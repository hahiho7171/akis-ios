/* ============================================================
   AKORA — KAPI (REKLAM YERLEŞİMİ) UZAKTAN AYARI  ·  2026-08-30
   Kullanıcı isteği: "Reklam kapılarını buluttan yönetelim; sonradan bir yere
   reklam koymak istersek her seferinde mağaza güncellemesi göndermeyelim."

   Nasıl çalışır:
     · Ayar dosyası:  https://akis-odak-app.web.app/ayar/kapilar.json
     🪤 DOSYA/URL ADINDA "reklam" GEÇMEZ — geçtiği ilk sürümde tarayıcıdaki reklam
        engelleyici dosyayı 43 baytlık 1x1 GIF ile değiştirdi ve modül HİÇ yüklenmedi
        (30 Ağu, ölçüldü). WebView'de engelleyici yok ama DNS süzgeçleri de aynı şeyi
        yapabilir; ad tarafsız kalacak.
     · Açılışta ÖNCE localStorage'daki kopya uygulanır (ağ beklenmez),
       arka planda tazelenir. Ağ yoksa/dosya bozuksa VARSAYILAN çalışır.
     · Bu dosyayı değiştirip `firebase deploy --only hosting` demek yeter:
       uygulamalar en geç bir sonraki açılışta yeni ayarla çalışır.

   🔒 GÜVENLİK SINIRLARI (sunucudaki dosya ne derse desin aşılamaz):
     · Premium kullanıcıya reklam YOK — ayar dosyası bunu açamaz (ads.js kontrolü).
     · İki reklam arası en az 30 sn (AdMob "disruptive ads" ihlali olmasın).
     · Muafiyet 0-30 gün, günlük en fazla 0-50 arası kırpılır.
   ⚠️ `kapilar.acilis` (uygulama açılır açılmaz interstitial) AdMob politikasınca
      YASAK sayılabilir (support.google.com/admob/answer/6201362). Kod hazır ama
      varsayılanı KAPALI — açmadan önce risk kullanıcıya aittir.
   ============================================================ */
window.AkoraKapiAyar = (function () {
  'use strict';

  var URL_AYAR = 'https://akis-odak-app.web.app/ayar/kapilar.json';
  var LS       = 'akora.reklamAyar';
  var LS_TS    = 'akora.reklamAyarTs';
  var TAZE_MS  = 6 * 60 * 60 * 1000;      // 6 saatte bir tazele
  var ZAMAN_MS = 5000;                    // ağ zaman aşımı

  /* VARSAYILAN = bugünkü davranışın BİREBİR aynısı.
     Sunucu erişilemezse uygulama hiç değişmemiş gibi çalışır. */
  var VARSAYILAN = {
    surum: 0,
    acik: true,                 // ana şalter: false → hiç reklam gösterilmez
    muafiyetGun: 1,             // kurulumdan sonra reklamsız gün
    aralikSn: 60,               // iki reklam arası en az saniye
    gunlukEnFazla: 0,           // 0 = sınırsız
    bekleMs: 4000,              // reklam hazır değilse en fazla bekleme
    kapilar: {
      acilis:        false,     // uygulama açılır açılmaz (⚠️ politika riski)
      seansBasi:     false,     // "Başla"ya basınca
      calismaSonu:   true,      // çalışma bitti → molaya geçerken
      molaSonu:      true,      // mola bitti → çalışmaya dönerken
      seanstanCikis: true,      // geri tuşuyla seanstan çıkarken
      bahce:         false,     // Bahçem ekranı açılırken
      orman:         false,     // Akora Ormanı açılırken
      dukkan:        false,     // Dükkân açılırken
      istatistik:    false,     // İstatistik açılırken
      kitaplik:      false,     // Kitaplığım açılırken
      takvim:        false      // Takvim açılırken
    },
    /* Hangi çalışma modunda reklam çıksın (timer.js mod adları) */
    modlar: { pomodoro: true, custom: true, flowtime: true, fiftytwo: true },
    /* Reklam birimi kimlikleri — boşsa koddaki gerçek birimler kullanılır.
       Birim değiştirmek için mağaza güncellemesi gerekmez. */
    birimler: { interstitial: { android: '', ios: '' },
                rewarded:     { android: '', ios: '' },
                banner:       { android: '', ios: '' } },
    /* Şerit reklam — kod hazır, varsayılan kapalı */
    banner: { acik: false, konum: 'BOTTOM_CENTER', ekranlar: [] }
  };

  var ayar = kopyala(VARSAYILAN);

  function kopyala(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return o; } }

  /* Derin birleştirme — sunucu yalnız değiştirmek istediği alanı yazabilir.
     Bilinmeyen alanlar YOK SAYILIR (varsayılanda olmayan anahtar eklenmez). */
  function birlestir(hedef, gelen) {
    if (!gelen || typeof gelen !== 'object') return hedef;
    Object.keys(hedef).forEach(function (k) {
      var h = hedef[k], g = gelen[k];
      if (g === undefined || g === null) return;
      if (h && typeof h === 'object' && !Array.isArray(h)) { birlestir(h, g); return; }
      if (Array.isArray(h)) { if (Array.isArray(g)) hedef[k] = g.slice(); return; }
      if (typeof h === typeof g) hedef[k] = g;
      else if (typeof h === 'number' && !isNaN(+g)) hedef[k] = +g;
      else if (typeof h === 'boolean') hedef[k] = !!g;
    });
    return hedef;
  }

  /* Sunucu ne yazarsa yazsın aşılamayan sınırlar */
  function kirp(a) {
    a.aralikSn      = Math.max(30, Math.min(3600, +a.aralikSn || 60));
    a.muafiyetGun   = Math.max(0, Math.min(30, +a.muafiyetGun || 0));
    a.gunlukEnFazla = Math.max(0, Math.min(50, +a.gunlukEnFazla || 0));
    a.bekleMs       = Math.max(0, Math.min(15000, +a.bekleMs || 0));
    return a;
  }

  function uygula(gelen) {
    var y = birlestir(kopyala(VARSAYILAN), gelen);
    ayar = kirp(y);
    return ayar;
  }

  /* 1) Açılış: diskteki kopyayı HEMEN uygula (ağ beklenmez) */
  (function ilkYukle() {
    try {
      var ham = localStorage.getItem(LS);
      if (ham) uygula(JSON.parse(ham));
    } catch (e) { ayar = kirp(kopyala(VARSAYILAN)); }
  })();

  /* 2) Arka planda tazele */
  function tazele(zorla) {
    try {
      var son = +localStorage.getItem(LS_TS) || 0;
      if (!zorla && son && (Date.now() - son) < TAZE_MS) return Promise.resolve(ayar);
    } catch (e) {}
    var bitti = false;
    return new Promise(function (cbz) {
      var zt = setTimeout(function () { if (!bitti) { bitti = true; cbz(ayar); } }, ZAMAN_MS);
      fetch(URL_AYAR + '?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (bitti) return;
          if (j && typeof j === 'object') {
            uygula(j);
            try { localStorage.setItem(LS, JSON.stringify(j)); localStorage.setItem(LS_TS, String(Date.now())); } catch (e) {}
          }
        })
        .catch(function () {})
        .then(function () { if (!bitti) { bitti = true; clearTimeout(zt); cbz(ayar); } });
    });
  }

  function al()        { return ayar; }
  function kapiAcik(ad){ return !!(ayar.acik && ayar.kapilar && ayar.kapilar[ad]); }
  function modAcik(m)  { if (!m) return true; var v = ayar.modlar ? ayar.modlar[m] : undefined; return v === undefined ? true : !!v; }

  setTimeout(function () { tazele(false); }, 2500);
  try {
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) tazele(false);
    });
  } catch (e) {}

  return { al: al, kapiAcik: kapiAcik, modAcik: modAcik, tazele: tazele,
           uygula: uygula, VARSAYILAN: VARSAYILAN };
})();
