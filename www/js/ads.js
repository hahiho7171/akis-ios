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

  // 1 GÜN ÜCRETSİZ MUAFİYET: kurulumdan sonraki ilk 1 gün reklam YOK (kart/zorlama yok).
  const GRACE_MS = 1 * 24 * 60 * 60 * 1000; /* 1 gün ücretsiz muafiyet (QA test build'de 2 dk'ya çekilir) */
  let firstRun = 0;
  function inGrace() { return firstRun > 0 && (Date.now() - firstRun < GRACE_MS); }
  function graceDaysLeft() { if (!inGrace()) return 0; return Math.ceil((GRACE_MS - (Date.now() - firstRun)) / (24 * 60 * 60 * 1000)); }
  function adsActive() { return !isPremium && firstRun > 0 && !inGrace(); }   // premium değil VE (init olmuş) VE muafiyet bitti

  // Arka arkaya reklamı önle (AdMob "disruptive ads") — en az 60 sn arayla.
  // NOT: 2026-07-28'de açılış reklamı seans reklamını yediği için 20 sn'ye indirilmişti;
  // 2026-08-08'de açılış reklamı tamamen kaldırıldı (politika) → 60 sn'ye geri dönüldü.
  let lastInterstitial = 0;
  const MIN_GAP = 60 * 1000;
  const WAIT_MS = 4000;   // reklam hazır değilse en fazla bu kadar bekle, sonra kullanıcıyı bekletme

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
    if (Date.now() - lastInterstitial < MIN_GAP) return;      // sıklık sınırı
    if (!interReady) { prepareInterstitial(); return; }        // hazır değilse bu seferlik atla
    try { await admob().showInterstitial(); lastInterstitial = Date.now(); }   // sayaç yalnız BAŞARILI gösterimde (başarısızsa sonraki reklamı bloklamasın)
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
      const finish = (v) => { if (done) return; done = true; if (guard) { clearTimeout(guard); guard = null; } pendingInter = null; waitUI(false); resolve(v); };

      if (!adsActive() || !native()) { finish(false); return; }
      if (Date.now() - lastInterstitial < MIN_GAP) { finish(false); return; }   // arka arkaya reklam yok

      const doShow = () => {
        waitUI(false);
        pendingInter = finish;                                   // Dismissed/FailedToShow olayı çözecek
        guard = setTimeout(() => finish(true), 45000);            // dismissed olayı hiç gelmezse kilitlenme sigortası (finish temizler)
        try {
          admob().showInterstitial()
            .then(() => { lastInterstitial = Date.now(); })       // sayaç yalnız başarılı gösterimde; guard finish'e kadar YAŞAR
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
        if (Date.now() - t0 > WAIT_MS) { clearInterval(iv); finish(false); }
      }, 200);
    });
  }

  // ---------- Genel API (yerleşimler) ----------
  function onAppOpen() { /* BOŞ (2026-08-08): AdMob politikası uygulama açılışında interstitial'ı yasaklıyor
     (https://support.google.com/admob/answer/6201362). Eklentiye App Open formatı gelirse burada kullanılır. */ }
  /* YERLEŞİM KURALI (kullanıcı kararı 2026-08-08):
     - Seans BAŞLATIRKEN reklam YOK (odak anı kutsal).
     - Çalışma bitip MOLAYA girerken → onWorkEnd (perdeli, beklemeli).
     - Moladan DERSE dönerken → onBreakEnd (perdeli, beklemeli).
     MIN_GAP 60 sn iki geçişin üst üste binmesini engeller (ör. 1 dk'lık molada tek reklam çıkar). */
  function onWorkEnd()  { return showInterstitialAwait(); }
  function onBreakEnd() { return showInterstitialAwait(); }
  /* Seanstan GERİ tuşuyla erken çıkış → ana ekrana dönmeden reklam (kullanıcı kararı 2026-08-08).
     NOT: Bu "uygulamadan çıkış" DEĞİL (o yasak) — uygulama İÇİ ekran geçişi; AdMob'a uygun. */
  function onSessionExit() { return showInterstitialAwait(); }

  return { init, setPremium, isPremiumNow, inGrace, graceDaysLeft, adsActive, onAppOpen, onWorkEnd, onBreakEnd, onSessionExit };
})();
