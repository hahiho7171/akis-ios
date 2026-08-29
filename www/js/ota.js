/* ============================================================
   AKORA — OTA (MAĞAZASIZ GÜNCELLEME)  ·  2026-08-29

   Kullanıcı isteği: "Apolet'teki 'oto' gibi — küçük düzeltmeleri
   Play/App Store güncellemesi göndermeden yapabilelim."

   Nasıl çalışır:
     · Eklenti: @capgo/capacitor-updater (kendi sunucumuz, Capgo bulutu YOK)
     · Açılışta `https://akis-odak-app.web.app/ota/manifest.json` okunur
     · Sunucudaki paket sürümü cihazdakinden yeniyse ZIP indirilir ve
       BİR SONRAKİ AÇILIŞTA uygulanır (kullanıcıyı ortada kesmeyiz)

   🚨 HAYATİ: `notifyAppReady()` HER AÇILIŞTA çağrılmalı.
      Çağrılmazsa Capgo "yeni paket çöktü" varsayıp eskiye geri döner.
      Bu çağrı aşağıda EN BAŞTA, her şeyden önce yapılır.

   🚨 `enAzKod`: paket, kendisinden eski bir NATIVE sürüme inmemeli.
      Örnek: yeni web kodu yeni bir Java eklentisi çağırıyorsa, o eklenti
      olmayan eski APK'da çöker. Manifest'teki `enAzKod` cihazın
      versionCode'undan büyükse paket İNDİRİLMEZ.

   ⚠️ Sınır: yalnız `www/` içeriği (HTML/CSS/JS/görsel) güncellenir.
      Java/Swift tarafı, izinler, eklenti ekleme → mağaza güncellemesi şart.
   ============================================================ */
(function(){
  'use strict';

  var MANIFEST = 'https://akis-odak-app.web.app/ota/manifest.json';
  var BEKLE_MS = 4000;                 // açılışı yavaşlatmasın
  var SON_KEY  = 'akora.otaSurum';     // en son indirilen paket sürümü

  function eklenti(){
    try{
      return (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.CapacitorUpdater) || null;
    }catch(e){ return null; }
  }
  function yerli(){
    try{ return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); }
    catch(e){ return false; }
  }

  /* Cihazın NATIVE sürüm kodu (APK/IPA) — OTA paketininkiyle karışmasın */
  function nativeKod(){
    return new Promise(function(cbz){
      try{
        var App = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App;
        if(App && App.getInfo){
          App.getInfo().then(function(i){
            var k = parseInt(i && i.build, 10);
            cbz(isNaN(k) ? 0 : k);
          }).catch(function(){ cbz(0); });
          return;
        }
      }catch(e){}
      cbz(0);
    });
  }

  /* 1) ÖNCE bunu söyle: "paket sağlam açıldı" → geri alma tetiklenmesin */
  function hazirBildir(){
    var u = eklenti();
    if(!u || !u.notifyAppReady) return;
    try{ u.notifyAppReady(); }catch(e){}
  }

  function log(){
    try{ if(window.console && console.info) console.info.apply(console, ['[Akora OTA]'].concat([].slice.call(arguments))); }catch(e){}
  }

  function denetle(){
    var u = eklenti();
    if(!u || !u.download) { log('eklenti yok'); return; }

    fetch(MANIFEST + '?t=' + Date.now(), {cache:'no-store'})
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(m){
        if(!m || !m.surum || !m.url) return;

        var son = '';
        try{ son = localStorage.getItem(SON_KEY) || ''; }catch(e){}
        if(son === m.surum){ log('zaten güncel', m.surum); return; }

        return nativeKod().then(function(kod){
          if(m.enAzKod && kod && kod < m.enAzKod){
            log('paket bu APK için fazla yeni — atlanıyor', m.enAzKod, '>', kod);
            return;
          }
          log('indiriliyor', m.surum);
          return u.download({ url: m.url, version: m.surum })
            .then(function(paket){
              if(!paket || !paket.id) return;
              // Hemen değiştirmiyoruz: kullanıcı seansın ortasındaysa kesmeyelim.
              // Bir sonraki açılışta bu paketle açılır.
              return u.next({ id: paket.id }).then(function(){
                try{ localStorage.setItem(SON_KEY, m.surum); }catch(e){}
                log('hazır, sonraki açılışta uygulanacak', m.surum);
              });
            });
        });
      })
      .catch(function(e){ log('atlandı', e && e.message); });
  }

  /* --- açılış --- */
  hazirBildir();                       // 🚨 en başta, koşulsuz
  if(yerli()) setTimeout(denetle, BEKLE_MS);

  try{ window.AkoraOTA = { denetle: denetle, hazirBildir: hazirBildir }; }catch(e){}
})();
