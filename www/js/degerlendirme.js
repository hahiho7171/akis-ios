/* ============================================================
   AKORA — PUANLAMA / YORUM YÖNLENDİRMESİ  ·  2026-08-29

   Kullanıcı isteği: "Play Store ve Apple Store'un otomatik puanlama
   kapılarını açalım, ara ara herkesin KENDİ DİLİNDE çıkacak şekilde
   puan vermeyenleri yönlendirelim."

   NASIL:
     · Mağazaların KENDİ yerleşik penceresi kullanılır
       (Android: Play In-App Review · iOS: SKStoreReviewController)
       @capacitor-community/in-app-review eklentisi üzerinden.
     · Bu pencere uygulamadan ÇIKARMADAN puan aldırır ve
       kullanıcının TELEFON DİLİNDE gelir — çeviri yazmamıza gerek yok,
       işletim sistemi hallediyor.

   🚨 İKİ MAĞAZANIN DA YASAKLADIĞI ŞEY: yerleşik pencereden ÖNCE
      "beğendin mi?" diye kendi penceremizi göstermek. Google
      ("don't ask the user before showing the flow") ve Apple
      (HIG: "Don't ask the user a question before the prompt")
      bunu açıkça yasaklıyor. Bu yüzden ESKİ özel pencere kaldırıldı;
      yerleşik akış doğru anda DOĞRUDAN çağrılıyor.

   🚨 KOTA GERÇEĞİ: iki mağaza da bu pencereyi kısıtlıyor. Apple yılda
      en fazla 3 kez gösterir; Google da kendi kotasını uygular ve
      kotası dolmuşsa HİÇBİR ŞEY göstermeden başarıyla döner. Yani
      "kaç kez gösterildi" bilinemez — biz yalnız "kaç kez İSTEDİK"i
      sayarız ve seyrek isteriz. Sık istemek kotayı boşa harcar.

   NE ZAMAN İSTENİR — hep İYİ bir andan sonra:
     · yalnız BİTMİŞ bir odak seansının ardından (yarıda bırakılanda asla)
     · en az ISINMA_SEANS seans tamamlanmışsa
     · en az ARA_GUN gün önceki istemeden bu yana
     · ömür boyu en fazla EN_COK_ISTEK kez
     · seans/mola sürerken ya da reklamdan hemen sonra ASLA

   🔧 OTA İLE AYARLANABİLİR: aşağıdaki AYAR bloğu yalnız web kodudur.
      Eşikleri değiştirmek için mağaza güncellemesi GEREKMEZ —
      `node scripts/ota_yayinla.mjs` yeter.
   ============================================================ */
(function(){
  'use strict';

  var AYAR = {
    ISINMA_SEANS : 4,     // ilk istekten önce tamamlanmış seans sayısı
    ARA_GUN      : 45,    // iki istek arası en az gün
    EN_COK_ISTEK : 4,     // ömür boyu en fazla kaç kez isteyelim
    GECIKME_MS   : 1600   // seans bitiş kutlaması otursun, sonra sor
  };

  var KEY = 'akora.puan.v2';   // {n: istekSayisi, son: zamanDamgasi, verdi: bool}

  function cap(){ return window.Capacitor; }
  function yerli(){
    try{ return !!(cap() && cap().isNativePlatform && cap().isNativePlatform()); }catch(e){ return false; }
  }
  function eklenti(){
    try{ return (cap() && cap().Plugins && cap().Plugins.InAppReview) || null; }catch(e){ return null; }
  }
  function log(){
    try{ if(window.console && console.info) console.info.apply(console, ['[Akora puan]'].concat([].slice.call(arguments))); }catch(e){}
  }

  function durum(){
    try{ return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }catch(e){ return {}; }
  }
  function durumYaz(d){
    try{ localStorage.setItem(KEY, JSON.stringify(d)); }catch(e){}
  }

  /* Eski tek-seferlik bayrağı (akis.rateAsked.v1) devral: kullanıcı eskiden
     "puan ver"e bastıysa bir daha rahatsız etmeyelim. */
  function eskiyiDevral(){
    var d = durum();
    if(d.n !== undefined) return d;
    var eski = '';
    try{ eski = localStorage.getItem('akis.rateAsked.v1') || ''; }catch(e){}
    d = eski === '1'
      ? { n: 1, son: Date.now(), verdi: true }   // zaten mağazaya gitmişti
      : { n: 0, son: 0, verdi: false };
    durumYaz(d);
    return d;
  }

  function seansSayisi(){
    try{
      if(window.AkisStats && AkisStats.itemCount) return AkisStats.itemCount() || 0;
    }catch(e){}
    return 0;
  }

  /* Şu an sormak uygun mu? Tek karar noktası — hem otomatik hem elle
     tetiklemede burası konuşur. */
  function uygunMu(){
    if(!yerli()) return { ok:false, sebep:'native değil' };
    var d = eskiyiDevral();
    if(d.verdi)                    return { ok:false, sebep:'kullanıcı zaten puan verdi/gitti' };
    if((d.n||0) >= AYAR.EN_COK_ISTEK) return { ok:false, sebep:'ömür boyu istek sınırı' };
    if(seansSayisi() < AYAR.ISINMA_SEANS) return { ok:false, sebep:'henüz yeterli seans yok' };
    var gecen = (Date.now() - (d.son||0)) / 86400000;
    if(d.son && gecen < AYAR.ARA_GUN) return { ok:false, sebep:'son istekten ' + Math.round(gecen) + ' gün geçti' };
    // Seans sürerken ASLA — odağı bölmek, kötü puanın en kısa yolu.
    try{
      var s = window.AkisTimer && AkisTimer.snapshot && AkisTimer.snapshot();
      if(s && s.running) return { ok:false, sebep:'seans sürüyor' };
    }catch(e){}
    return { ok:true };
  }

  /* Yerleşik pencereyi aç. Mağaza kotası doluysa eklenti hiçbir şey
     göstermeden başarıyla döner — bu bir hata DEĞİL, normal davranış. */
  function iste(zorla){
    var k = zorla ? { ok:true } : uygunMu();
    if(!k.ok){ log('atlandı:', k.sebep); return Promise.resolve(false); }

    var p = eklenti();
    if(!p || !p.requestReview){
      /* Eklenti yoksa (eski native kabuk + yeni OTA paketi) sessiz kal.
         Menüdeki "Uygulamayı puanla" satırı zaten mağazaya götürüyor. */
      log('eklenti yok, atlandı');
      return Promise.resolve(false);
    }

    var d = eskiyiDevral();
    d.n = (d.n || 0) + 1;
    d.son = Date.now();
    durumYaz(d);                      // ÖNCE yaz: pencere açılırken uygulama
                                      // arka plana geçerse tekrar sormayalım
    log('yerleşik puanlama penceresi isteniyor · istek #' + d.n);
    return p.requestReview()
      .then(function(){ return true; })
      .catch(function(e){ log('pencere açılamadı', e && e.message); return false; });
  }

  /* Seans bittiğinde app.js buradan haber veriyor. */
  function seansBitti(){
    setTimeout(function(){ iste(false); }, AYAR.GECIKME_MS);
  }

  /* Kullanıcı menüden "Uygulamayı puanla" derse: bu AÇIK bir istek,
     eşiklere bakmayız — ama yerleşik pencere kotası doluysa
     app.js mağaza sayfasına düşürür. */
  function elle(){
    return iste(true);
  }

  try{
    window.AkoraPuan = {
      seansBitti: seansBitti,
      elle: elle,
      uygunMu: uygunMu,
      durum: durum,
      AYAR: AYAR
    };
  }catch(e){}
})();
