/* ===== ads.js — AdMob reklam yöneticisi (çatısız Capacitor) =====
   Yerleşim (kullanıcı tarifi):
     • açılış        → Interstitial
     • seans başlat  → Rewarded ("başlamak için reklam izle")
     • molaya geçiş  → Interstitial
     • ODAK SIRASINDA → reklam YOK
   Premium (isPremium=true) → HİÇ reklam gösterilmez.
   Şu an Google TEST reklam ID'leri kullanılıyor; Akış AdMob birimleri açılınca REAL doldur + USE_TEST=false.
*/
window.AkisAds = (function () {
  // Google resmi TEST reklam birimi ID'leri
  const TEST = {
    interstitial: { android: 'ca-app-pub-3940256099942544/1033173712', ios: 'ca-app-pub-3940256099942544/4411468910' },
    rewarded:     { android: 'ca-app-pub-3940256099942544/5224354917', ios: 'ca-app-pub-3940256099942544/1712485313' },
  };
  // Akış AdMob GERÇEK reklam birimleri (yayıncı ca-app-pub-3326866070505611)
  const REAL = {
    interstitial: { android: 'ca-app-pub-3326866070505611/3192512808', ios: 'ca-app-pub-3326866070505611/8364948438' },
    rewarded:     { android: 'ca-app-pub-3326866070505611/3248353127', ios: 'ca-app-pub-3326866070505611/5095641474' },
  };
  const USE_TEST = false;

  function plat() { try { return (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || 'web'; } catch (e) { return 'web'; } }
  function admob() { try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) || null; } catch (e) { return null; } }
  function native() { return plat() !== 'web' && !!admob(); }
  function adId(kind) { const p = plat() === 'ios' ? 'ios' : 'android'; return (USE_TEST ? TEST : REAL)[kind][p]; }

  let isPremium = false;
  function setPremium(v) { isPremium = !!v; }
  function isPremiumNow() { return isPremium; }

  // 3 GÜN ÜCRETSİZ MUAFİYET: kurulumdan sonraki ilk 3 gün reklam YOK (kart/zorlama yok).
  const GRACE_MS = 3 * 24 * 60 * 60 * 1000; /* 3 gün ücretsiz muafiyet (QA test build'de 2 dk'ya çekilir) */
  let firstRun = 0;
  function inGrace() { return firstRun > 0 && (Date.now() - firstRun < GRACE_MS); }
  function graceDaysLeft() { if (!inGrace()) return 0; return Math.ceil((GRACE_MS - (Date.now() - firstRun)) / (24 * 60 * 60 * 1000)); }
  function adsActive() { return !isPremium && firstRun > 0 && !inGrace(); }   // premium değil VE (init olmuş) VE muafiyet bitti

  // Aşırı interstitial'ı önle (AdMob politikası) — en az 60 sn arayla
  let lastInterstitial = 0;
  const MIN_GAP = 60 * 1000;

  // ---- durum ----
  let interReady = false, interLoading = false;
  let rewReady = false, rewLoading = false;
  let rewardEarned = false;
  let pendingReward = null; // seans-başlat rewarded çözümleyicisi

  function log() { /* try{ console.log.apply(console,['[ads]',...arguments]); }catch(e){} */ }

  // ---------- init ----------
  async function init(premiumInitial) {
    isPremium = !!premiumInitial;
    // kurulum tarihini kaydet (ilk 3 gün muafiyet sayacı)
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
        A.addListener('interstitialAdDismissed', () => { interReady = false; setTimeout(prepareInterstitial, 1200); });
        A.addListener('interstitialAdFailedToShow', () => { interReady = false; setTimeout(prepareInterstitial, 1200); });

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
      prepareRewarded();
    } catch (e) { log('init hata', e); }
  }

  // ---------- Interstitial ----------
  async function prepareInterstitial() {
    if (!native() || interReady || interLoading || !adsActive()) return;
    interLoading = true;
    try { await admob().prepareInterstitial({ adId: adId('interstitial'), isTesting: USE_TEST }); }
    catch (e) { interLoading = false; }
  }
  async function showInterstitial() {
    if (!adsActive() || !native()) return;
    if (Date.now() - lastInterstitial < MIN_GAP) return;      // sıklık sınırı
    if (!interReady) { prepareInterstitial(); return; }        // hazır değilse bu seferlik atla
    lastInterstitial = Date.now();
    try { await admob().showInterstitial(); } catch (e) {}
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

  // ---------- Genel API (yerleşimler) ----------
  function onAppOpen() { showInterstitial(); }                 // açılış reklamı (hazırsa)
  function onSessionStart() { return showRewardedToStart(); }  // "başlamak için reklam izle"
  function onBreakStart() { showInterstitial(); }              // molaya geçerken reklam

  return { init, setPremium, isPremiumNow, inGrace, graceDaysLeft, adsActive, onAppOpen, onSessionStart, onBreakStart };
})();
