/* ============================================================
   AKORA — PUSH BİLDİRİM (FCM)  ·  2026-08-29

   Kullanıcı isteği: "kullanıcıların çalışmadığı günlerde onlara
   bildirim gönderebileceğimiz bir push sistemi kur."

   İKİ AYRI KANAL VAR, KARIŞTIRMA:

   1) YEREL hatırlatma (`notify.js`) — telefonun kendi saati kurar.
      Hesap gerekmez, internet gerekmez, bize hiçbir şeye mal olmaz,
      HER kullanıcıya ulaşır. Günlük "odaklanmadın" dürtmesi budur.

   2) PUSH (bu dosya) — BİZİM gönderdiğimiz mesaj. Duyuru, yeni özellik,
      geri kazanma kampanyası. Firebase Console › Messaging'ten
      KONUYA (topic) gönderilir.

   💸 Neden konu (topic) — tek tek cihaz değil:
      Tek tek token'a göndermek bir SUNUCU ister (Cloud Functions → Blaze
      → faturalı plan). Konuya gönderim Firebase Console'un kendi
      ekranından, BEDAVA ve sunucusuz yapılır. Cihaz kendini doğru
      konuya kendi yazar; biz yalnız "uyuyan" konusuna mesaj atarız.

   Cihazın yazıldığı konular:
      tum            → herkes (duyuru)
      dil_<kod>      → tr, en, de… (dilinde mesaj atabilelim)
      uyuyan         → 3+ gündür odaklanmamış
      aktif          → son 3 günde odaklanmış
      premium / bedava
   Konular HER AÇILIŞTA yeniden hesaplanır; kullanıcı geri dönerse
   "uyuyan"dan çıkar, bir daha geri kazanma mesajı almaz.

   🚨 İZİN: ayrıca izin İSTEMİYORUZ. Android 13+ ve iOS'ta bildirim izni
      tektir; `notify.js` ilk seansta zaten istiyor. İzin verilmeden
      token alınmaz — bu yüzden burada yalnız "izin var mı" diye bakarız.
   ============================================================ */
(function(){
  'use strict';

  var UYKU_GUN = 3;                      // kaç gün odaklanmayınca "uyuyan"
  var KONU_KEY = 'akora.push.konular';   // en son yazıldığımız konular
  var TOKEN_KEY= 'akora.push.token';

  function cap(){ return window.Capacitor; }
  function yerli(){
    try{ return !!(cap() && cap().isNativePlatform && cap().isNativePlatform()); }catch(e){ return false; }
  }
  function FM(){
    try{ return cap() && cap().Plugins && cap().Plugins.FirebaseMessaging; }catch(e){ return null; }
  }
  function log(){
    try{ if(window.console && console.info) console.info.apply(console,['[Akora push]'].concat([].slice.call(arguments))); }catch(e){}
  }

  /* ---------- kaç gündür odaklanmadı ---------- */
  function bosGun(){
    try{
      var s = window.AkisStats;
      if(!s || !s.getData) return 0;
      var d = s.getData() || {};
      var gunler = d.days || d.gunler || {};
      var bugun = new Date();
      for(var i=0;i<60;i++){
        var g = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate()-i);
        var ds = g.getFullYear()+'-'+('0'+(g.getMonth()+1)).slice(-2)+'-'+('0'+g.getDate()).slice(-2);
        var v = gunler[ds];
        var dk = (typeof v === 'number') ? v : (v && (v.minutes || v.dakika)) || 0;
        if(dk > 0) return i;              // i gün önce odaklanmış
      }
      return 60;
    }catch(e){ return 0; }
  }

  function premiumMu(){
    try{ return !!(window.AkisPremium && AkisPremium.isPremium && AkisPremium.isPremium()); }catch(e){ return false; }
  }
  function dilKodu(){
    try{
      var l = (window.AkisI18n && AkisI18n.current && AkisI18n.current()) ||
              (window.AkisI18n && AkisI18n.getLang && AkisI18n.getLang()) || 'en';
      return String(l).toLowerCase().replace(/[^a-z]/g,'').slice(0,5) || 'en';
    }catch(e){ return 'en'; }
  }

  function konularHesapla(){
    var bos = bosGun();
    var k = ['tum', 'dil_' + dilKodu()];
    k.push(bos >= UYKU_GUN ? 'uyuyan' : 'aktif');
    k.push(premiumMu() ? 'premium' : 'bedava');
    return k;
  }

  /* ---------- konu aboneliklerini eşitle ----------
     Sadece FARKI uygular: her açılışta 4 abone/4 çık isteği atmak
     gereksiz ağ trafiği ve pil demek. */
  function konulariEsitle(){
    var fm = FM(); if(!fm || !fm.subscribeToTopic) return Promise.resolve();
    var yeni = konularHesapla();
    var eski = [];
    try{ eski = JSON.parse(localStorage.getItem(KONU_KEY) || '[]') || []; }catch(e){}

    var girecek = yeni.filter(function(x){ return eski.indexOf(x) < 0; });
    var cikacak = eski.filter(function(x){ return yeni.indexOf(x) < 0; });
    if(!girecek.length && !cikacak.length) return Promise.resolve();

    var isler = [];
    girecek.forEach(function(t){ isler.push(fm.subscribeToTopic({topic:t}).catch(function(){})); });
    cikacak.forEach(function(t){
      if(fm.unsubscribeFromTopic) isler.push(fm.unsubscribeFromTopic({topic:t}).catch(function(){}));
    });
    return Promise.all(isler).then(function(){
      try{ localStorage.setItem(KONU_KEY, JSON.stringify(yeni)); }catch(e){}
      log('konular', yeni.join(', '));
    });
  }

  /* ---------- token'ı buluta yaz ----------
     Yalnız GİRİŞ YAPMIŞ kullanıcı için; güvenlik kuralları
     `kullanicilar/{uid}` dışına yazmayı zaten reddediyor.
     Konu gönderimi için token'a ihtiyacımız YOK; bu kayıt ileride
     tek kişiye mesaj/destek gerekirse diye tutulur. */
  /* 🚨 29 Ağu 2026 — SESSİZ HATA DÜZELTİLDİ.
     Eski hâli token'ı ÖNCE localStorage'a yazıp sonra "giriş var mı" diye
     bakıyordu. Gerçek akış (kur → aç → SONRA giriş yap) şöyle kırılıyordu:
       1. açılış: token geldi, giriş yok → localStorage'a yazıldı, çıkıldı
       2. kullanıcı giriş yaptı → kimse tokenKaydet'i çağırmıyor
       3. sonraki açılış: son === token → "değişmemiş" deyip HİÇ yazmıyor
     Sonuç: `kullanicilar/{uid}/cihazlar` belgesi ASLA oluşmuyordu.
     Çözüm: hatırlama anahtarı artık uid'i de içeriyor ve damga YALNIZ
     yazma başarılı olunca atılıyor. Ayrıca hesap.js girişten sonra
     `AkoraPush.tokenTazele()` çağırıyor. Emülatörde ölçülerek bulundu. */
  function tokenKaydet(token){
    if(!token) return;
    try{ localStorage.setItem(TOKEN_KEY, token); }catch(e){}

    var uid = '';
    try{ uid = (window.AkoraHesap && AkoraHesap.uid && AkoraHesap.uid()) || ''; }catch(e){}
    if(!uid) return;                     // girişsizken yazılacak yer yok

    var damga = uid + '|' + token;
    var son = '';
    try{ son = localStorage.getItem(TOKEN_KEY + '.yazildi') || ''; }catch(e){}
    if(son === damga) return;            // bu uid için bu token zaten yazıldı

    try{
      var db = cap().Plugins.FirebaseFirestore;
      if(!db || !db.setDocument) return;
      db.setDocument({
        reference: 'kullanicilar/' + AkoraHesap.uid() + '/cihazlar/' + token.slice(0,60),
        data: {
          token: token,
          platform: (cap().getPlatform && cap().getPlatform()) || '',
          dil: dilKodu(),
          guncel: new Date().toISOString()
        },
        merge: true
      }).then(function(){
        try{ localStorage.setItem(TOKEN_KEY + '.yazildi', damga); }catch(e){}
      }).catch(function(){});
    }catch(e){}
  }

  /* Giriş yapıldıktan SONRA çağrılır (hesap.js › girisSonrasi).
     Token zaten elimizde; eksik olan tek şey uid'di. */
  function tokenTazele(){
    var tk = '';
    try{ tk = localStorage.getItem(TOKEN_KEY) || ''; }catch(e){}
    if(tk) tokenKaydet(tk);
    return !!tk;
  }

  /* ---------- ön planda gelen mesaj ----------
     FCM, uygulama AÇIKKEN sistem bildirimi göstermez; kendimiz gösteririz.
     Aksi hâlde kullanıcı uygulamadayken mesajı hiç görmez. */
  function onPlandaGoster(m){
    try{
      var n = (m && m.notification) || {};
      if(!n.title && !n.body) return;
      var ln = cap().Plugins.LocalNotifications;
      if(!ln || !ln.schedule) return;
      ln.schedule({ notifications: [{
        id: 4100 + Math.floor(Math.random()*800),
        title: n.title || 'Akora',
        body:  n.body  || '',
        smallIcon: 'ic_stat_akis'
      }]}).catch(function(){});
    }catch(e){}
  }

  /* ---------- açılış ---------- */
  function baslat(){
    var fm = FM();
    if(!yerli() || !fm){ log('native değil, atlanıyor'); return; }

    // İzin İSTEMİYORUZ; notify.js zaten doğru anda soruyor.
    fm.checkPermissions().then(function(p){
      if(!p || p.receive !== 'granted'){ log('izin yok, token alınmadı'); return; }
      return fm.getToken().then(function(r){
        var tk = r && r.token;
        log('token alındı', tk ? tk.slice(0,12)+'…' : '(yok)');
        tokenKaydet(tk);
        return konulariEsitle();
      });
    }).catch(function(e){ log('atlandı', e && e.message); });

    try{
      fm.addListener('tokenReceived', function(r){ tokenKaydet(r && r.token); });
      fm.addListener('notificationReceived', function(e){ onPlandaGoster(e); });
    }catch(e){}
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(baslat, 2500); });
  } else {
    setTimeout(baslat, 2500);
  }

  /* İzin sonradan verilirse (ilk seansta) tekrar dene; konular da tazelensin. */
  try{
    window.AkoraPush = {
      baslat: baslat,
      tokenTazele: tokenTazele,
      esitle: konulariEsitle,
      bosGun: bosGun,
      konular: konularHesapla
    };
  }catch(e){}
})();
