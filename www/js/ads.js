/* ===== ads.js — AdMob reklam yöneticisi (çatısız Capacitor) =====
   Yerleşim (kullanıcı tarifi):
     • açılış        → Interstitial
     • seans başlat  → Rewarded ("başlamak için reklam izle")
     • molaya geçiş  → Interstitial
     • ODAK SIRASINDA → reklam YOK
   Premium (isPremium=true) → HİÇ reklam gösterilmez.

   ☁️ 2026-08-30 — YERLEŞİMLER ARTIK BULUTTAN YÖNETİLİYOR (`kapi_ayar.js`).
   Hangi kapıda reklam çıkacağı, sıklık, muafiyet süresi, reklam birimi kimlikleri ve
   şerit reklam → `https://akis-odak-app.web.app/ayar/kapilar.json`. Yeni bir yere reklam
   koymak (ör. Bahçem açılışı) için MAĞAZA GÜNCELLEMESİ GEREKMEZ; kapılar kodda hazır,
   ayar dosyasında `true` yapmak yeter. Ayar okunamazsa varsayılan = bugünkü davranış.
   🔒 Premium kontrolü ayar dosyasının ÜSTÜNDEDİR — bulut premium'a reklam açamaz.
*/
window.AkisAds = (function () {
  // Google resmi TEST reklam birimi ID'leri
  const TEST = {
    interstitial: { android: 'ca-app-pub-3940256099942544/1033173712', ios: 'ca-app-pub-3940256099942544/4411468910' },
    rewarded:     { android: 'ca-app-pub-3940256099942544/5224354917', ios: 'ca-app-pub-3940256099942544/1712485313' },
    banner:       { android: 'ca-app-pub-3940256099942544/6300978111', ios: 'ca-app-pub-3940256099942544/2934735716' },
  };
  // Akış AdMob GERÇEK reklam birimleri (yayıncı ca-app-pub-3326866070505611)
  const REAL = {
    interstitial: { android: 'ca-app-pub-3326866070505611/3192512808', ios: 'ca-app-pub-3326866070505611/8364948438' },
    rewarded:     { android: 'ca-app-pub-3326866070505611/3248353127', ios: 'ca-app-pub-3326866070505611/5095641474' },
    /* ŞERİT (banner) — birimler 1 Eyl 2026'da AdMob'da açıldı.
       Yayınlanmış sürümlerde bu alan BOŞ; canlı cihazlara `kapilar.json`
       içindeki `birimler.banner` ile ulaşır (mağaza güncellemesi gerekmez).
       Şeridin AÇILMASI ayrı: `banner.acik` bayrağı. */
    banner:       { android: 'ca-app-pub-3326866070505611/7260984823',
                    ios:     'ca-app-pub-3326866070505611/9543638438' },
  };
  const USE_TEST = false;

  function plat() { try { return (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || 'web'; } catch (e) { return 'web'; } }
  function admob() { try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) || null; } catch (e) { return null; } }
  function native() { return plat() !== 'web' && !!admob(); }
  /* ---- bulut ayarı (yoksa varsayılanla çalışır) ---- */
  function AY() {
    try { if (window.AkoraKapiAyar) return AkoraKapiAyar.al(); } catch (e) {}
    return { acik: true, muafiyetGun: 1, aralikSn: 60, gunlukEnFazla: 0, bekleMs: 4000,
             kapilar: { calismaSonu: true, molaSonu: true, seanstanCikis: true },
             modlar: {}, birimler: {}, banner: { acik: false } };
  }
  function kapiAcik(ad) {
    try { if (window.AkoraKapiAyar) return AkoraKapiAyar.kapiAcik(ad); } catch (e) {}
    const a = AY(); return !!(a.acik && a.kapilar && a.kapilar[ad]);
  }
  function modAcik(m) {
    try { if (window.AkoraKapiAyar) return AkoraKapiAyar.modAcik(m); } catch (e) {}
    return true;
  }
  /* Şu anki çalışma modu ('pomodoro' | 'custom' | 'flowtime' | 'fiftytwo') */
  function suAndakiMod() {
    try { const sn = window.AkisTimer && AkisTimer.snapshot && AkisTimer.snapshot(); return (sn && sn.mode) || ''; }
    catch (e) { return ''; }
  }

  /* Reklam birimi: ayar dosyasında doluysa ONU kullan (birim değişikliği güncelleme istemez) */
  function adId(kind) {
    const p = plat() === 'ios' ? 'ios' : 'android';
    try {
      const b = AY().birimler; const u = b && b[kind] && b[kind][p];
      if (u && /^ca-app-pub-/.test(u)) return u;
    } catch (e) {}
    const t = (USE_TEST ? TEST : REAL)[kind];
    return (t && t[p]) || '';
  }

  let isPremium = false;
  function setPremium(v) { isPremium = !!v; }
  function isPremiumNow() { return isPremium; }

  // 1 GÜN ÜCRETSİZ MUAFİYET: kurulumdan sonraki ilk 1 gün reklam YOK (kart/zorlama yok).
  let firstRun = 0;
  function graceMs() { return Math.max(0, (AY().muafiyetGun || 0)) * 24 * 60 * 60 * 1000; }   // buluttan
  function inGrace() { const g = graceMs(); return g > 0 && firstRun > 0 && (Date.now() - firstRun < g); }
  function graceDaysLeft() { if (!inGrace()) return 0; return Math.ceil((graceMs() - (Date.now() - firstRun)) / (24 * 60 * 60 * 1000)); }
  /* premium DEĞİL · init olmuş · muafiyet bitti · bulut şalteri açık */
  function adsActive() { return !isPremium && firstRun > 0 && !inGrace() && AY().acik !== false; }

  /* ---- günlük tavan (bulut: gunlukEnFazla; 0 = sınırsız) ---- */
  const GUN_KEY = 'akora.reklamGun';
  function bugun() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function gunlukSayi() {
    try { const o = JSON.parse(localStorage.getItem(GUN_KEY) || 'null'); return (o && o.gun === bugun()) ? (+o.n || 0) : 0; }
    catch (e) { return 0; }
  }
  function gunlukArtir() {
    try { localStorage.setItem(GUN_KEY, JSON.stringify({ gun: bugun(), n: gunlukSayi() + 1 })); } catch (e) {}
  }
  function gunlukDoldu() { const t = AY().gunlukEnFazla || 0; return t > 0 && gunlukSayi() >= t; }

  // Arka arkaya reklamı önle (AdMob "disruptive ads") — en az 60 sn arayla.
  // NOT: 2026-07-28'de açılış reklamı seans reklamını yediği için 20 sn'ye indirilmişti;
  // 2026-08-08'de açılış reklamı tamamen kaldırıldı (politika) → 60 sn'ye geri dönüldü.
  let lastInterstitial = 0;
  function minGap() { return Math.max(30, AY().aralikSn || 60) * 1000; }   // buluttan (en az 30 sn)
  function waitMs()  { return Math.max(0, AY().bekleMs === undefined ? 4000 : AY().bekleMs); }

  // ---- durum ----
  let interReady = false, interLoading = false, interLoadingSince = 0;
  const LOAD_STALL_MS = 30 * 1000;   // yükleme takılırsa bu süre sonunda yeniden denenir
  let rewReady = false, rewLoading = false;
  let rewardEarned = false;
  let pendingReward = null;  // (rewarded şu an kullanılmıyor — ileride gerekirse duruyor)
  let pendingInter = null;   // seans-başlat interstitial çözümleyicisi

  function log() { /* try{ console.log.apply(console,['[ads]',...arguments]); }catch(e){} */ }

  // ---------- init ----------
  async function init(premiumInitial) {
    isPremium = !!premiumInitial;
    // kurulum tarihini kaydet (ilk 1 gün muafiyet sayacı)
    try {
      firstRun = +localStorage.getItem('akis_first_run') || 0;
      if (!firstRun) { firstRun = Date.now(); localStorage.setItem('akis_first_run', String(firstRun)); }
    } catch (e) { firstRun = Date.now(); }
    if (!native()) return;
    const A = admob();
    try {
      await A.initialize({ initializeForTesting: USE_TEST, testingDevices: [], tagForChildDirectedTreatment: false });

      // AB kullanıcıları için onay (UMP) — hata olursa yut
      try {
        const c = await A.requestConsentInfo({ tagForUnderAgeOfConsent: false });
        if (c && c.isConsentFormAvailable && (c.status === 'REQUIRED')) { try { await A.showConsentForm(); } catch (e) {} }
      } catch (e) {}

      // iOS izleme izni (ATT) — zorunlu
      if (plat() === 'ios') { try { await A.requestTrackingAuthorization(); } catch (e) {} }

      // kalıcı olay dinleyicileri
      try {
        A.addListener('interstitialAdLoaded', () => { interReady = true; interLoading = false; });
        A.addListener('interstitialAdFailedToLoad', () => { interReady = false; interLoading = false; });
        A.addListener('interstitialAdDismissed', () => {
          interReady = false;
          if (pendingInter) { const r = pendingInter; pendingInter = null; r(true); }   // reklam izlendi → akışa devam
          setTimeout(prepareInterstitial, 1200);
        });
        A.addListener('interstitialAdFailedToShow', () => {
          interReady = false;
          if (pendingInter) { const r = pendingInter; pendingInter = null; r(false); }  // gösterilemedi → kullanıcıyı bekletme
          setTimeout(prepareInterstitial, 1200);
        });

        A.addListener('onRewardedVideoAdLoaded', () => { rewReady = true; rewLoading = false; });
        A.addListener('onRewardedVideoAdFailedToLoad', () => { rewReady = false; rewLoading = false; });
        A.addListener('onRewardedVideoAdReward', () => { rewardEarned = true; });
        A.addListener('onRewardedVideoAdDismissed', () => {
          rewReady = false;
          if (pendingReward) { const r = pendingReward; pendingReward = null; r(true); } // reklam gösterildi → devam
          setTimeout(prepareRewarded, 1200);
        });
        A.addListener('onRewardedVideoAdFailedToShow', () => {
          rewReady = false;
          if (pendingReward) { const r = pendingReward; pendingReward = null; r(true); }
          setTimeout(prepareRewarded, 1200);
        });
      } catch (e) {}

      prepareInterstitial();
      // NOT: rewarded artık kullanılmıyor (seans başlatma interstitial'a geçti) → boşuna istek atma.
    } catch (e) { log('init hata', e); }
  }

  // ---------- Interstitial ----------
  async function prepareInterstitial() {
    if (!native() || interReady || !adsActive()) return;
    // ÖNEMLİ: yükleme ne "loaded" ne "failed" olayı üretmezse (ağ kopması vb.) interLoading
    // sonsuza kadar true kalıp SONRAKİ TÜM reklamları engelliyordu → 30 sn sonra yeniden dene.
    if (interLoading && (Date.now() - interLoadingSince) < LOAD_STALL_MS) return;
    interLoading = true; interLoadingSince = Date.now();
    try { await admob().prepareInterstitial({ adId: adId('interstitial'), isTesting: USE_TEST }); }
    catch (e) { interLoading = false; }
  }
  async function showInterstitial() {
    if (!adsActive() || !native()) return;
    if (Date.now() - lastInterstitial < minGap()) return;      // sıklık sınırı (buluttan)
    if (!interReady) { prepareInterstitial(); return; }        // hazır değilse bu seferlik atla
    try { await admob().showInterstitial(); lastInterstitial = Date.now(); gunlukArtir(); }   // sayaç yalnız BAŞARILI gösterimde
    catch (e) {}
  }

  // ---------- Rewarded (izle-başla) ----------
  async function prepareRewarded() {
    if (!native() || rewReady || rewLoading || !adsActive()) return;
    rewLoading = true;
    try { await admob().prepareRewardVideoAd({ adId: adId('rewarded'), isTesting: USE_TEST }); }
    catch (e) { rewLoading = false; }
  }
  // Promise<boolean>: seansa başlanabilir mi? Premium/web/hazır-değil → true (kullanıcıyı engelleme).
  function showRewardedToStart() {
    return new Promise((resolve) => {
      if (!adsActive() || !native()) { resolve(true); return; }
      if (!rewReady) { prepareRewarded(); resolve(true); return; }   // hazır değilse bekletme, başlat
      rewardEarned = false;
      pendingReward = resolve;
      const guard = setTimeout(() => { if (pendingReward) { pendingReward = null; resolve(true); } }, 30000); // güvenlik
      admob().showRewardVideoAd().catch(() => {
        clearTimeout(guard);
        if (pendingReward) { pendingReward = null; resolve(true); }
      });
    });
  }

  // ---------- Seans başlatma reklamı (SORMADAN, tam ekran) ----------
  // "Yükleniyor" perdesini aç/kapa (index.html'deki #ad-wait). Yoksa sessizce geçer.
  function waitUI(on) {
    try { const el = document.getElementById('ad-wait'); if (el) el.classList.toggle('hidden', !on); } catch (e) {}
  }

  /* Reklamı GÖSTER, kapanınca çöz. Hazır değilse WAIT_MS kadar bekler (perdeyle),
     yine gelmezse kullanıcıyı BEKLETMEDEN devam eder (AdMob: reklam uygulamayı kilitlememeli).
     Promise<boolean> — true = reklam gösterildi. */
  function showInterstitialAwait() {
    return new Promise((resolve) => {
      let done = false, guard = null;
      const finish = (v) => { if (done) return; done = true; if (guard) { clearTimeout(guard); guard = null; } pendingInter = null; waitUI(false); releaseApp(); resolve(v); };

      if (!adsActive() || !native()) { finish(false); return; }
      if (Date.now() - lastInterstitial < minGap()) { finish(false); return; }   // arka arkaya reklam yok
      if (gunlukDoldu()) { finish(false); return; }                             // günlük tavan (buluttan)

      const doShow = () => {
        waitUI(false);
        holdApp();                                               // sayaç dursun, ses sussun
        pendingInter = finish;                                   // Dismissed/FailedToShow olayı çözecek
        guard = setTimeout(() => finish(true), 45000);            // dismissed olayı hiç gelmezse kilitlenme sigortası (finish temizler)
        try {
          admob().showInterstitial()
            .then(() => { lastInterstitial = Date.now(); gunlukArtir(); })   // sayaç yalnız başarılı gösterimde; guard finish'e kadar YAŞAR
            .catch(() => { finish(false); });
        } catch (e) { finish(false); }
      };

      if (interReady) { doShow(); return; }

      // hazır değil → yüklemeyi tetikle ve kısa süre bekle (kaçan gösterimleri kurtarır)
      prepareInterstitial();
      waitUI(true);
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (done) { clearInterval(iv); return; }
        if (interReady) { clearInterval(iv); doShow(); return; }
        if (Date.now() - t0 > waitMs()) { clearInterval(iv); finish(false); }
      }, 200);
    });
  }

  /* ===== 🩹 2026-08-26 — REKLAM AÇIKKEN UYGULAMAYI DONDUR (kullanıcı bildirimi) =====
     Sorun: reklam tam ekran açılırken (a) sayaç arkada işlemeye devam ediyor,
            (b) yağmur/müzik sesi reklamın üstünden gelmeye devam ediyordu.
     Çözüm: reklam GERÇEKTEN gösterilirken sayaç duraklatılır, ses+video susturulur;
            reklam kapanınca ses geri gelir. Sayaç KASITLI olarak kendiliğinden devam
            ETMEZ — çağıran taraf (app.js) reklamdan sonra yeni fazı başlatır. */
  let held = false, heldTimer = false;
  function holdApp() {
    if (held) return; held = true; heldTimer = false;
    try { if (window.AkisTimer && AkisTimer.running) { AkisTimer.pause(); heldTimer = true; } } catch (e) {}
    try { if (window.AkisAudio) { AkisAudio.pauseMusic(); AkisAudio.suspendAll(); } } catch (e) {}
    try { const v = document.getElementById('bg-video'); if (v) v.pause(); } catch (e) {}
  }
  function releaseApp() {
    if (!held) return; held = false;
    try { if (window.AkisAudio) { AkisAudio.resumeAll(); AkisAudio.resumeMusic(); } } catch (e) {}
    try { const v = document.getElementById('bg-video'); if (v && v.getAttribute('src')) { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); } } catch (e) {}
    heldTimer = false;   // sayacı burada BAŞLATMIYORUZ; yeni fazı app.js kuracak
  }
  function timerWasHeld() { return heldTimer; }

  // ---------- Genel API — TEK KAPI: kapi(ad) ----------
  /* ☁️ Her yerleşim buradan geçer. Açık mı kapalı mı → bulut ayarı söyler.
     Yeni bir yere reklam koymak = ayar dosyasında o kapıyı `true` yapmak.
     Promise<boolean> — true: reklam gösterildi.
     KAPI ADLARI: acilis · seansBasi · calismaSonu · molaSonu · seanstanCikis ·
                  bahce · orman · dukkan · istatistik · kitaplik · takvim        */
  function kapi(ad) {
    try {
      if (!ad || !kapiAcik(ad)) return Promise.resolve(false);        // bulut kapatmış
      if (!modAcik(suAndakiMod())) return Promise.resolve(false);      // bu çalışma modunda kapalı
      return showInterstitialAwait();
    } catch (e) { return Promise.resolve(false); }
  }
  /* Beklemeden, arka planda dene (ekran açılışlarında kullanıcıyı tutmamak için) */
  function kapiSessiz(ad) { try { kapi(ad); } catch (e) {} }

  /* --- Adı geçen eski çağrılar (app.js bunları kullanıyor) --- */
  /* ⚠️ AdMob politikası: uygulama açılışında interstitial YASAK
     (support.google.com/admob/answer/6201362). Kapı KODDA hazır ama ayar dosyasında
     varsayılanı KAPALI; açmak kullanıcının kararı ve riskidir. */
  function onAppOpen()     { return kapi('acilis'); }
  function onSessionStart(){ return kapi('seansBasi'); }
  function onWorkEnd()     { return kapi('calismaSonu'); }
  function onBreakEnd()    { return kapi('molaSonu'); }
  function onSessionExit() { return kapi('seanstanCikis'); }

  // ---------- Şerit reklam (banner) — kod hazır, bulut açar ----------
  let bannerAcik = false;
  async function bannerGoster(ekran) {
    try {
      const b = AY().banner || {};
      if (!b.acik || !adsActive() || !native()) return false;
      if (Array.isArray(b.ekranlar) && b.ekranlar.length && ekran && b.ekranlar.indexOf(ekran) < 0) return false;
      const A = admob(); if (!A || !A.showBanner) return false;
      const bid = adId('banner');
      if (!bid) return false;                                   // birim yok → istek atma
      await A.showBanner({ adId: bid, position: b.konum || 'BOTTOM_CENTER',
                           adSize: 'ADAPTIVE_BANNER', margin: 0, isTesting: USE_TEST });
      bannerAcik = true; return true;
    } catch (e) { return false; }
  }
  async function bannerGizle() {
    if (!bannerAcik) return;
    try { const A = admob(); if (A && A.hideBanner) await A.hideBanner(); } catch (e) {}
    bannerAcik = false;
  }

  return { init, setPremium, isPremiumNow, inGrace, graceDaysLeft, adsActive, timerWasHeld,
           kapi, kapiSessiz, kapiAcik, onAppOpen, onSessionStart, onWorkEnd, onBreakEnd, onSessionExit,
           bannerGoster, bannerGizle, ayar: AY };
})();
