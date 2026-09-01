/* ===== app.js — ana bağlama, ekran geçişi, ayarlar ===== */
(() => {
  const $ = s => document.querySelector(s);
  const SKEY='akis.settings.v1';

  // ---- ayarlar (kalıcı) ----
  const settings = Object.assign({
    /* 2026-08-29 kullanıcı kararı:
       · kum saati kaldırıldı → varsayılan görsel HALKA
       · "Kendin ayarla" 10 dakikadan başlar
       · 1 EYL 2026 kullanıcı kararı: SES STANDARDI = yalnız Lo-fi, YARIM ses.
         Ortam sesleri (şömine · kuş · tik-tak…) varsayılan KAPALI; isteyen
         "Sesler" panelinden kendisi açar. Eskiden tik-tak TAM sesle açıktı. */
    mode:'pomodoro', workMin:10, breakMin:5, visual:'ring',
    background:'none', mix:{}, music:'lofi', musicVol:50,
    deepFocus:true,          // ⑧ 2026-08-28: rakipte ceza VARSAYILAN AÇIK; motivasyonun kaynağı o.
                             //    Eski kullanıcının kapattığı tercih localStorage'dan gelir, bozulmaz.
    overtime:false,          // ⑪ süre dolunca yukarı saymaya devam et
    dnd:false                // ⑥ seans boyunca Rahatsız Etme
  }, load());

  /* 🚨 GÖÇ (2026-08-29): kaldırılan seçenekler kayıtlı kalmış olabilir.
     Yoksa AkisVisual bilinmeyen tip alır ve ekrana hiçbir şey çizilmez. */
  if(settings.visual === 'hourglass') settings.visual = 'ring';
  if(settings.mode === 'fiftytwo')    settings.mode   = 'pomodoro';
  /* "Kendin ayarla" 30 dk'dan 10 dk'ya çekildi (kullanıcı isteği). Eski kurulumlarda
     30 çoğunlukla ESKİ VARSAYILAN, bilinçli seçim değil — bir kez 10'a alınır.
     Bayrak yazıldığı için kullanıcı sonradan 30 yaparsa bir daha dokunulmaz. */
  try{
    if(!localStorage.getItem('akora.sure10') ){
      if(settings.workMin === 30) settings.workMin = 10;
      /* Açılış sesi: eskiden Klasik (Satie) çalıyordu. Kullanıcı 29 Ağu'da
         "sesler kapalı, yalnız saat tik-takı" dedi. Eski VARSAYILAN duruyorsa geçir;
         kullanıcı bilerek seçtiyse (başka müzik ya da ambiyans açık) dokunma. */
      const sesBos = !settings.mix || !Object.keys(settings.mix).some(k => settings.mix[k] > 0);
      if(settings.music === 'classic' && sesBos){ settings.music = 'off'; settings.mix = {tick:35}; }
      localStorage.setItem('akora.sure10','1');
      saveSettings();
    }
  }catch(e){}

  /* 🔊 SES STANDARDI (1 EYL 2026 kullanıcı kararı)
     Şikâyet: "hangi seçenek açılırsa açılsın bazılarında şömine, bazılarında kuş
     sesi açık geliyordu". Sebep: ortam sesi karışımı cihazda kalıcı; kimde ne
     kaldıysa o çalıyordu. Karar: standart = YALNIZ Lo-fi, YARIM ses.
     Bir KEZ herkeste standarda çekilir (bayrak yazılır); sonrasında kullanıcı
     "Sesler" panelinden ne yaptıysa o kalır, bir daha dokunulmaz. */
  try{
    if(!localStorage.getItem('akora.sesStandart1')){
      settings.music    = 'lofi';
      settings.musicVol = 50;
      settings.mix      = {};
      localStorage.setItem('akora.sesStandart1','1');
      saveSettings();
    }
  }catch(e){}

  // Seans-sonu + kalıcı bildirimleri zamanlayıcı durumuna eşitle (native'de)
  // + aynı anda oturumu diske yaz: bildirim ile uygulama ASLA ayrı düşmesin.
  function syncNotifs(opts){
    try{ if(window.AkisNotify && AkisNotify.syncSession) AkisNotify.syncSession(AkisTimer.snapshot(), opts); }catch(e){}
    oturumKaydet();
  }

  /* ===== OTURUM KALICILIĞI (2026-08-28, kullanıcı bildirimi) =====
     Sorun: telefon uygulamayı arka planda öldürünce sayaç sıfırlanıyor, ama bildirim
     çubuğundaki satır eski bitiş saatiyle kalıyordu → "süre yanlış devam ediyor".
     Çözüm: her durum değişiminde oturumu diske yaz; açılışta duvar saatine göre
     kaldığı yerden devam ettir. Böylece bildirime dokununca doğru ekran açılır. */
  const OKEY='akis.oturum.v1';

  /* 🪤 2026-08-29 (2. bildirim): "yeni indirdiğimde açılır açılmaz yine
     pomodoro başlıyor; sonra kapatıp açınca çıkmıyor."
     Kurulum/güncelleme sonrası ESKİ sürümün bıraktığı oturum kaydı hâlâ
     duruyor ve ilk açılışta geri yükleniyordu. Sürüm damgası değiştiyse
     kayıt koşulsuz atılır → güncelleme sonrası HER ZAMAN temiz açılış. */
  /* 🪤 2026-08-30 (2. NÜKS, cihazda): damga regexi `[0-9.]+` idi → `2.8.2b/c/d`
     gibi HARF EKLİ damgada yalnız "2.8.2" yakalanıyordu. 2.8.2 → 2.8.2d güncellemesinde
     damga DEĞİŞMEMİŞ görünüyor, eski oturum kaydı atılmıyor ve uygulama yine
     "sayaç çalışır hâlde" açılıyordu. Aynı hata `denetim_yapi.mjs`'te bulunup
     düzeltilmişti; app.js'teki İKİZİ atlanmıştı.
     Kural: damga TIRNAĞA/&'e kadar OLDUĞU GİBİ okunur, hiçbir karakteri kırpılmaz. */
  const APP_SURUM = (function(){
    try{
      const sc = document.querySelector('script[src*="app.js"]');
      const m  = sc && sc.getAttribute('src').match(/[?&]v=([^&"'\s]+)/);
      return m ? m[1] : '0';
    }catch(e){ return '0'; }
  })();
  (function surumTemizligi(){
    try{
      const SK = 'akora.surum';
      if(localStorage.getItem(SK) !== APP_SURUM){
        localStorage.removeItem(OKEY);
        localStorage.setItem(SK, APP_SURUM);
      }
    }catch(e){}
  })();
  const OTURUM_TAZE_MS = 6*60*60*1000;   // 6 saatten eski kayıt geri yüklenmez
  /* 🚨 Geri yükleme DENENMEDEN kayda dokunma. Yoksa açılışta tetiklenen bir
     visibilitychange/appStateChange, odak ekranı henüz açılmadığı için kaydı SİLİYOR
     ve kaldığın yerden devam özelliği sessizce ölüyordu (28 Ağu cihaz testinde yakalandı). */
  let geriYuklemeDenendi=false;
  function oturumKaydet(){
    if(!geriYuklemeDenendi) return;
    try{
      if(!$('#view-focus').classList.contains('active')){ localStorage.removeItem(OKEY); return; }
      const d=AkisTimer.durum();
      d.ts=Date.now(); d.task=task; d.committedWork=committedWork; d.paleFlag=paleFlag;
      d.v=APP_SURUM;                               // kaydı YAZAN sürüm (başka sürümün kaydı geri yüklenmez)
      localStorage.setItem(OKEY, JSON.stringify(d));
    }catch(e){}
  }
  function oturumSil(){ try{ localStorage.removeItem(OKEY); }catch(e){} }

  // ---- Derin Odak takibi: seans sırasında uygulamadan uzun ayrılma → soluk ağaç ----
  let awayAt=0, paleFlag=false;
  const PALE_AFTER_MS=30*1000;
  document.addEventListener('visibilitychange', ()=>{
    if(!settings.deepFocus) return;
    if(document.hidden){
      if(AkisTimer.running && AkisTimer.phase==='work') awayAt=Date.now();
    }else{
      if(awayAt && Date.now()-awayAt>PALE_AFTER_MS) paleFlag=true;
      awayAt=0;
    }
  });
  if(!settings.mix || typeof settings.mix!=='object') settings.mix={};
  function load(){ try{ return JSON.parse(localStorage.getItem(SKEY))||{}; }catch(e){ return {}; } }
  function saveSettings(){ try{ localStorage.setItem(SKEY, JSON.stringify(settings)); }catch(e){} }

  let task='';
  let lastSec=-1;
  let wakeLock=null;
  let committedWork=false;   // bu çalışma fazı kaydedildi mi? (çift sayımı önler)
  let customBreakMin=15;

  function esc(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  /* ---- ekran gecisi + EKRAN YASAM DONGUSU KAYDI (2026-08-30) ----
     KALICI DERS: show() bir ekrani KAPATMAZ, yalniz gizler. Gizli kalan canvas
        60 fps cizmeye devam eder -> telefon isinir, uygulama takilir. 2.8.1'de
        Bahcem'den DONANIM GERI tusuyla cikinca tam bu oldu: unmount yalniz
        ekrandaki geri okuna bagliydi, geri tusu yolunda yoktu.
     KURAL: ekran degistiren TEK kapi show(). Bir ekranin kapaninca durmasi
        gereken seyi (canvas dongusu, dinleyici) varsa BURAYA yazilir; boylece
        hangi yoldan cikildiginin (ekran dugmesi / donanim geri / menu) onemi kalmaz.
     YENI EKRAN EKLERKEN: dongusu varsa EKRAN_KAPANIS'a, acilinca tazelenmesi
        gereken sey varsa EKRAN_ACILIS'a bir satir ekle.
     BEKCI: scripts/denetim_yasamdongusu.mjs - tablosuz dongu birakirsan bagirir. */
  const EKRAN_KAPANIS = {
    'view-plot' : ()=>{ try{ AkisPlot.unmount(); }catch(e){} },                    // Bahcem izometrik dongusu
    'view-stats': ()=>{ try{ AkisGarden.unmount($('#pond-full')); }catch(e){} },   // buyuk orman canvas'i
    'view-focus': ()=>{ try{ AkisVisual.stop(); }catch(e){} },                     // kum saati / halka dongusu
    'view-home' : ()=>{ try{ const cv=$('#pond-mini'); if(cv && cv._mounted){ AkisGarden.unmount(cv); cv._mounted=false; } }catch(e){} }
  };
  const EKRAN_ACILIS = {
    'view-home' : ()=>{ try{ refreshPondMini(); }catch(e){} }
  };
  function show(id){
    const eski = document.querySelector('.view.active');
    const eskiId = eski ? eski.id : '';
    if(eskiId && eskiId !== id && EKRAN_KAPANIS[eskiId]){ try{ EKRAN_KAPANIS[eskiId](); }catch(e){} }
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    $('#'+id).classList.add('active');
    if(eskiId !== id && EKRAN_ACILIS[id]){ try{ EKRAN_ACILIS[id](); }catch(e){} }
    /* ☁️ EKRAN REKLAM KAPILARI (2026-08-30) — hepsi bulut ayarında VARSAYILAN KAPALI.
       Sonradan "Bahçem açılışında reklam olsun" denirse ayar dosyasında true yapmak yeter,
       mağaza güncellemesi gerekmez. Beklemesiz: kullanıcı ekranı görür, reklam üstüne gelir. */
    if(eskiId !== id){ try{ const k=EKRAN_REKLAM_KAPISI[id]; if(k && window.AkisAds && AkisAds.kapiSessiz) AkisAds.kapiSessiz(k); }catch(e){} }
  }
  const EKRAN_REKLAM_KAPISI = { 'view-plot':'bahce', 'view-stats':'istatistik',
                                'view-kitaplik':'kitaplik', 'view-takvim':'takvim' };
  /* takvim.js ve kitaplik.js kendi gorunum()'unu bu kapiya baglar - yoksa
     onlarin gecisleri temizlik tablosunu atlar. */
  try{ window.AkoraEkran = { goster: show }; }catch(e){}

  // ========== HOME ==========
  function initHome(){
    document.querySelectorAll('#mode-grid .mode-card').forEach(card=>{
      if(card.dataset.mode===settings.mode) selectMode(card.dataset.mode);
      card.addEventListener('click', ()=>selectMode(card.dataset.mode));
    });
    $('#work-min').textContent=settings.workMin;
    $('#break-min').textContent=settings.breakMin;
    document.querySelectorAll('.step-btn[data-target]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const d=+b.dataset.delta;
        if(b.dataset.target==='work'){
          settings.workMin=Math.max(5, Math.min(180, settings.workMin+d));
          $('#work-min').textContent=settings.workMin;
        }else{
          settings.breakMin=Math.max(1, Math.min(60, settings.breakMin+d));
          $('#break-min').textContent=settings.breakMin;
        }
        saveSettings();
      });
    });
    document.querySelectorAll('#visual-picker .chip').forEach(ch=>{
      ch.classList.toggle('active', ch.dataset.visual===settings.visual);   // toggle: HTML'deki varsayılan 'active' kalıntısıyla İKİ çip seçili görünmesin
      ch.addEventListener('click', ()=>{
        document.querySelectorAll('#visual-picker .chip').forEach(x=>x.classList.remove('active'));
        ch.classList.add('active'); settings.visual=ch.dataset.visual; saveSettings();
      });
    });
    document.querySelectorAll('#bg-chips .chip').forEach(ch=>{
      ch.classList.toggle('active', ch.dataset.bg===(settings.background||'none'));
      ch.addEventListener('click', ()=>{
        document.querySelectorAll('#bg-chips .chip').forEach(x=>x.classList.remove('active'));
        ch.classList.add('active'); settings.background=ch.dataset.bg; saveSettings();
      });
    });
    $('#task-input').addEventListener('input', e=> task=e.target.value.trim());
    // Derin Odak anahtarı
    const df=$('#deep-focus-toggle');
    if(df){
      df.classList.toggle('active', !!settings.deepFocus);
      df.addEventListener('click', ()=>{
        settings.deepFocus=!settings.deepFocus; saveSettings();
        df.classList.toggle('active', settings.deepFocus);
        if(settings.deepFocus) toast(t('deep_focus_hint'));
      });
    }
    // Arka plan çiplerine video poster görselleri (metin çipi → görsel kart)
    document.querySelectorAll('#bg-chips .chip').forEach(ch=>{
      const bg=ch.dataset.bg;
      if(bg && bg!=='none'){ ch.classList.add('bg-card'); ch.style.backgroundImage=`url('assets/video/posters/${bg}.jpg')`; }
      else ch.classList.add('bg-card','bg-card-none');
    });
    $('#btn-start').addEventListener('click', async ()=>{
      // 2026-08-08 kararı: odaklanma anı kutsal → burada reklam YOK.
      // ☁️ 30 Ağu: kapı KODDA hazır ama bulut ayarında VARSAYILAN KAPALI. Açılırsa
      // reklam seans başlamadan ÖNCE gösterilir, kapanınca seans başlar.
      try{ if(window.AkisAds && AkisAds.onSessionStart) await AkisAds.onSessionStart(); }catch(e){}
      if(!$('#view-home').classList.contains('active')) return;   // reklam sürerken başka ekrana geçildiyse
      startSession();
    });
    $('#btn-stats').addEventListener('click', openStats);
    refreshPondMini();
  }
  /* anaekran.js buradan süre kurar (ör. Uyku etiketi → 30 dk geri sayım) */
  try{
    window.AkoraAyar = {
      sureAyarla:function(calisma, mola){
        if(calisma) settings.workMin = Math.max(1, Math.min(240, calisma|0));
        if(mola)    settings.breakMin = Math.max(1, Math.min(60,  mola|0));
        saveSettings();
        const w=$('#work-min'), b=$('#break-min');
        if(w) w.textContent=settings.workMin;
        if(b) b.textContent=settings.breakMin;
      },
      sure:function(){ return {calisma:settings.workMin, mola:settings.breakMin}; }
    };
  }catch(e){}

  function selectMode(mode){
    settings.mode=mode; saveSettings();
    document.querySelectorAll('#mode-grid .mode-card').forEach(c=>c.classList.toggle('active', c.dataset.mode===mode));
    $('#custom-setup').classList.toggle('hidden', mode!=='custom');
  }

  // ========== SEANS BAŞLAT ==========
  function buildCfg(){
    if(settings.mode==='custom')
      return {mode:'custom', workSec:settings.workMin*60, breakSec:settings.breakMin*60,
              longBreakSec:Math.max(settings.breakMin*3,15)*60, longEvery:4, countUp:false};
    return {mode:settings.mode};
  }
  function startSession(){
    committedWork=false;
    paleFlag=false; awayAt=0;
    // Ana ekran ormanini seans boyunca arkada cizdirmeme isi artik show()'daki
    // EKRAN_KAPANIS tablosunda (view-home kapanisi) - tek kapi, tek yer.
    AkisTimer.configure(buildCfg());
    $('#focus-task').textContent = task || '';
    AkisVisual.setType(settings.visual);
    AkisVisual.setPhase('work');
    show('view-focus');
    enterFullscreen();
    applyBackground(settings.background);
    requestAnimationFrame(()=>{ AkisVisual.resize(); AkisVisual.start(); });
    AkisAudio.applyMix(settings.mix);
    AkisAudio.setMusicVolume(settings.musicVol/100);
    if(settings.music && settings.music!=='off') AkisAudio.setMusic(settings.music);
    AkisTimer.start();
    setPlayIcon(true);
    requestWakeLock();
    showChrome();
    /* Bildirim izni BURADA istenir — açılışta değil. Doğru bağlam: seans başlıyor,
       "süre dolunca haber vereceğiz + çubukta kalan süre duracak". İzin yoksa
       bildirim çubuğundaki kalıcı satır hiç görünemez (kullanıcı şikâyetinin bir ayağı). */
    try{ if(window.AkisNotify && AkisNotify.ask) AkisNotify.ask().then(()=>syncNotifs()); }catch(e){}
    sessizAyarla(true);      // ⑥ odak boyunca Rahatsız Etme
    syncNotifs();
    // ilk seansta bir kez: "görseli değiştirmek için kaydır" ipucu
    try{ if(!localStorage.getItem('akis.swipeHint')){ toast(t('swipe_hint')); localStorage.setItem('akis.swipeHint','1'); } }catch(e){}
  }

  // ========== FOCUS ==========
  function initFocus(){
    $('#btn-back').addEventListener('click', requestExit);
    $('#btn-playpause').addEventListener('click', ()=>{
      // Faz süresi dolmuş ve karar bekleniyorsa: yeniden başlatma (her basışta çan çalıyordu) → kararı sor
      const sn=AkisTimer.snapshot();
      if(!AkisTimer.running && !sn.countUp && sn.remaining<=0 && sn.phase==='work'){ showFlow(); return; }
      AkisTimer.toggle();
      const running=AkisTimer.running; setPlayIcon(running);
      const v=$('#bg-video');
      if(running){ AkisAudio.resumeAll(); AkisAudio.resumeMusic(); if(v.getAttribute('src')) v.play().catch(()=>{}); requestWakeLock(); }
      else { AkisAudio.suspendAll(); AkisAudio.pauseMusic(); try{v.pause();}catch(e){} releaseWakeLock(); }
      syncNotifs();   // durdur/başlat → seans-sonu bildirimi eşitle
    });
    $('#btn-fullscreen').addEventListener('click', toggleFullscreen);
    $('#btn-sound').addEventListener('click', ()=>toggleDrawer(true));
    $('#btn-extend').addEventListener('click', ()=>{ hideFlow(); AkisTimer.extend(5*60); setPlayIcon(true); syncNotifs(); });
    $('#btn-tobreak').addEventListener('click', async ()=>{
      hideFlow(); commitWork();
      // ÇALIŞMA BİTTİ → MOLAYA GİRERKEN reklam (perdeli bekleme; kullanıcı kararı 2026-08-08)
      try{ if(window.AkisAds) await AkisAds.onWorkEnd(); }catch(e){}
      if(!$('#view-focus').classList.contains('active')) return;   // reklam sürerken çıkıldıysa dur
      AkisTimer.goNext(true); applyPhaseVisual(); setPlayIcon(true);
    });

    // Mola butonu → süre seçici
    $('#btn-break').addEventListener('click', openBreakSheet);
    $('#break-sheet-x').addEventListener('click', closeBreakSheet);
    $('#bs-custom').addEventListener('click', ()=>$('#bs-custom-row').classList.remove('hidden'));
    $('#bs-start').addEventListener('click', ()=>pickBreak(customBreakMin));
    document.querySelectorAll('#bs-chips .chip[data-min]').forEach(ch=>{
      ch.addEventListener('click', ()=>pickBreak(+ch.dataset.min));
    });
    document.querySelectorAll('#bs-custom-row .step-btn[data-bd]').forEach(b=>{
      b.addEventListener('click', ()=>{
        customBreakMin=Math.max(1, Math.min(120, customBreakMin + (+b.dataset.bd)));
        $('#bs-min-lbl').textContent=t('dur_min',{n:customBreakMin});
      });
    });

    AkisTimer.on('tick', onTick);
    AkisTimer.on('phaseEnd', onPhaseEnd);
    AkisTimer.on('phaseStart', (phase)=>{
      if(phase==='work') committedWork=false;
      // NOT: molaya-giriş reklamı artık btn-tobreak/pickBreak içinde AWAIT ile gösteriliyor (çifte reklam olmasın)
      pushState();
      /* 🪤 phaseStart, goNext() içinde start()'TEN ÖNCE tetikleniyor → o an snapshot
         running:false geliyor ve kalıcı bildirim yanlış duruma yazılıyordu. Bir tur
         geciktirip sayaç gerçekten başladıktan SONRA eşitliyoruz. */
      setTimeout(()=>syncNotifs(), 0);
    });
  }

  function refreshBreakChips(){
    document.querySelectorAll('#bs-chips .chip[data-min]').forEach(ch=>{
      ch.textContent=t('dur_min',{n:+ch.dataset.min});
    });
    $('#bs-min-lbl').textContent=t('dur_min',{n:customBreakMin});
  }
  function openBreakSheet(){ hideFlow(); refreshBreakChips(); $('#bs-custom-row').classList.add('hidden'); $('#break-sheet').classList.remove('hidden'); }
  function closeBreakSheet(){ $('#break-sheet').classList.add('hidden'); }
  async function pickBreak(min){
    hideFlow();               // "Süre doldu" kartı açıksa kapat — molada bayat +5dk/Molaya geç kalmasın
    closeBreakSheet();
    if(AkisTimer.phase==='work'){
      commitWork();
      // ÇALIŞMADAN MOLAYA GİRERKEN reklam (Mola butonu yolu da aynı kurala uyar)
      try{ if(window.AkisAds) await AkisAds.onWorkEnd(); }catch(e){}
      if(!$('#view-focus').classList.contains('active')) return;
    }
    AkisTimer.customBreak(min*60);
    applyPhaseVisual(); setPlayIcon(true);
    AkisAudio.resume(); AkisAudio.resumeMusic();
  }

  function pushState(s){
    s = s || AkisTimer.snapshot();
    const phaseText = s.phase==='work' ? (s.countUp?t('phase_flow'):t('phase_focus')) : (s.phase==='long'?t('phase_long'):t('phase_break'));
    AkisVisual.setPhase(s.phase==='work'?'work':'break');
    AkisVisual.update({
      frac:s.frac, timeText:fmt(s.remaining), phaseText,
      total:s.longEvery||0,
      done: s.longEvery ? (s.completedWork % s.longEvery) : 0,
      currentIdx: s.longEvery ? (s.completedWork % s.longEvery) : -1,
      isWork: s.phase==='work'
    });
    // Mola butonu SADECE çalışma fazında anlamlı → moladayken gizle
    const bb=$('#btn-break'); if(bb) bb.classList.toggle('hidden', s.phase!=='work');
  }
  function onTick(s){ pushState(s); }

  async function onPhaseEnd(phase){
    chime(phase==='work');
    if(phase==='work'){
      showFlow();
      setPlayIcon(false);      // sayaç durdu → duraklat ikonu asılı kalmasın
      syncNotifs();            // satır "Duraklatıldı"ya dönsün, bayat bitiş saati kalmasın
    }else{
      // MOLADAN DERSE DÖNERKEN reklam (kullanıcı kararı 2026-08-08). Sayaç reklamın arkasında
      // akmasın diye reklam beklenir, kapandıktan sonra yeni faz başlatılır.
      try{ if(window.AkisAds) await AkisAds.onBreakEnd(); }catch(e){}
      if(!$('#view-focus').classList.contains('active')) return;   // reklam sürerken çıkıldıysa hayalet seans başlatma
      AkisTimer.goNext(true); applyPhaseVisual(); setPlayIcon(true);
    }
  }

  function commitWork(){
    if(committedWork) return;
    const s=AkisTimer.snapshot();
    const mins=s.elapsed/60;
    if(mins>=1){
      committedWork=true;
      const item=AkisStats.recordFocus(mins, task, paleFlag, AkisStats.activeTag());
      paleFlag=false;
      if(item) showReward(item);
      refreshPondMini();
      try{ if(window.AkisNotify) AkisNotify.onFocusDone(); }catch(e){}   // "bugün odaklanmadın" bildirimini yarına ötele
    }
  }

  // ---- Çıkış: onay iste, çalışılan süreyi kaydet ----
  function requestExit(){
    openModal({
      title:t('exit_title'),
      bodyHTML:`<p>${esc(t('exit_body'))}</p>`,
      actions:[
        {label:t('cancel'), cls:'ghost'},
        {label:t('exit_yes'), cls:'danger', fn:doExit}
      ]
    });
  }
  async function doExit(){
    if(AkisTimer.phase==='work' && !committedWork) commitWork();
    AkisTimer.pause();
    oturumSil();                                                                                   // seans bitti → geri yükleme kaydı da bitsin
    sessizAyarla(false);                                                                           // ⑥ Rahatsız Etme'yi kapat
    try{ if(window.AkisNotify && AkisNotify.clearSession) AkisNotify.clearSession(); }catch(e){}   // kalıcı + seans-sonu bildirimlerini kaldır
    // ERKEN ÇIKIŞ REKLAMI (kullanıcı kararı 2026-08-08): seans beklemeden geri tuşuyla çıkılırsa
    // ana ekrana dönmeden reklam göster (perdeli; süre kaydı YUKARIDA çoktan yapıldı, veri riski yok)
    try{ if(window.AkisAds) await AkisAds.onSessionExit(); }catch(e){}
    AkisVisual.stop();
    AkisAudio.stopAll();
    applyBackground('none');
    $('#view-focus').classList.remove('chrome-hidden'); clearTimeout(chromeTimer);
    exitFullscreen();
    releaseWakeLock();
    hideFlow(); closeBreakSheet(); toggleDrawer(false);
    show('view-home');
    refreshPondMini();   // ÖNCE ana ekrana geç, SONRA ormanı bağla (sıra önemli: refresh, view-home aktif değilse mount atlar)
    /* İLK seanstan sonra bir kez hesap teklifi (hesap.js › teklifEt).
       Sıra önemli: teklif çıktıysa puanlama penceresi AÇILMAZ — iki pencere
       üst üste binmesin. Teklif zaten yalnız ilk seansta, puanlama birkaç
       seans sonra çıkıyor; yine de garanti altına alınıyor. */
    let teklifCikti = false;
    try{ if(window.AkoraHesap && AkoraHesap.teklifEt) teklifCikti = AkoraHesap.teklifEt(); }catch(e){}
    if(!teklifCikti) maybeAskRating();   // birkaç seans biriktiyse bir kez puan sor (ana ekrana döndükten sonra)
  }

  function applyPhaseVisual(){ pushState(); }

  function setPlayIcon(running){
    $('#ic-pause').classList.toggle('hidden', !running);
    $('#ic-play').classList.toggle('hidden', running);
  }
  function showFlow(){ $('#flow-prompt').classList.remove('hidden'); }
  function hideFlow(){ $('#flow-prompt').classList.add('hidden'); }

  // ===== TAM EKRAN: kontrolleri gizle/göster (immersive) + saat/arka plan kaydırma =====
  let chromeTimer=null;
  function anyOverlayOpen(){
    return $('#sound-panel').classList.contains('open') || $('#lang-panel').classList.contains('open') ||
           !$('#break-sheet').classList.contains('hidden') || $('#modal').classList.contains('open') ||
           !$('#flow-prompt').classList.contains('hidden');
  }
  function armChromeHide(){
    clearTimeout(chromeTimer);
    chromeTimer=setTimeout(()=>{
      if(!$('#view-focus').classList.contains('active')) return;
      if(anyOverlayOpen()){ armChromeHide(); return; }
      $('#view-focus').classList.add('chrome-hidden');
    }, 3500);
  }
  function showChrome(){ $('#view-focus').classList.remove('chrome-hidden'); armChromeHide(); }
  function toggleChrome(){ if($('#view-focus').classList.contains('chrome-hidden')) showChrome(); else { $('#view-focus').classList.add('chrome-hidden'); clearTimeout(chromeTimer); } }

  const VIS_CYCLE=['ring','clock','digits'];
  const BG_CYCLE=['akvaryum','koi','sualti','okyanus','selale','orman','yagmur','somine'];
  function cycleVisual(dir){
    let i=VIS_CYCLE.indexOf(settings.visual); if(i<0)i=0; i=(i+dir+VIS_CYCLE.length)%VIS_CYCLE.length;
    settings.visual=VIS_CYCLE[i]; saveSettings();
    AkisVisual.setType(settings.visual);
    document.querySelectorAll('#visual-picker .chip').forEach(x=>x.classList.toggle('active', x.dataset.visual===settings.visual));
    toast(t('vis_'+settings.visual));
  }
  function cycleBackground(dir){
    let i=BG_CYCLE.indexOf(settings.background); if(i<0) i=(dir>0?-1:BG_CYCLE.length); i=(i+dir+BG_CYCLE.length)%BG_CYCLE.length;
    settings.background=BG_CYCLE[i]; saveSettings();
    applyBackground(settings.background);
    document.querySelectorAll('#bg-chips .chip').forEach(x=>x.classList.toggle('active', x.dataset.bg===settings.background));
    toast(t('bg_'+settings.background));
  }
  function initFocusGestures(){
    const view=$('#view-focus'); let gs=null;
    view.addEventListener('pointerdown', e=>{
      if(e.target.closest('button, input, .drawer, .modal-overlay, .break-sheet, .flow-prompt')){ gs=null; return; }
      gs={x:e.clientX, y:e.clientY, t:Date.now()};
    });
    view.addEventListener('pointerup', e=>{
      if(!gs) return;
      const dx=e.clientX-gs.x, dy=e.clientY-gs.y, dt=Date.now()-gs.t, sx=gs.x, sy=gs.y; gs=null;
      const W=window.innerWidth, H=window.innerHeight;
      if(Math.abs(dx)<14 && Math.abs(dy)<14 && dt<450){ toggleChrome(); return; }      // dokunuş → kontrolleri aç/kapat
      if(Math.abs(dx)>52 && Math.abs(dx)>Math.abs(dy)*1.3){                            // yatay kaydırma
        const onClock = Math.abs(sx-W/2) < W*0.26 && sy > H*0.22 && sy < H*0.62;       // saatin üstünde mi?
        (onClock ? cycleVisual : cycleBackground)(dx>0 ? 1 : -1);
      }
    });
  }

  // ========== SES PANELİ ==========
  function buildMixer(){
    const box=$('#mixer'); if(!box) return; box.innerHTML='';
    const premium = (AkisAudio.premiumKeys||[]);
    AkisAudio.keys.forEach(key=>{
      const row=document.createElement('div'); row.className='mix-row';
      const kilitli = premium.indexOf(key)>=0 && !AkisStats.hasSound(key);   // ⑨ jetonla açılan ek sesler
      const v0=Math.round((+settings.mix[key]||0)*100);
      if(v0>0 && !kilitli) row.classList.add('on');
      const lbl=document.createElement('span'); lbl.className='mix-lbl'; lbl.textContent=t('amb_'+key);
      row.appendChild(lbl);

      if(kilitli){
        /* Kilitli ses: kaydırıcı yerine "jetonla aç" düğmesi.
           🚨 Var olan sesler ASLA buraya düşmez — premium listesi tamamen yeni kanallardan oluşur. */
        const fiyat = AkisAudio.premiumFiyat(key);
        const b=document.createElement('button'); b.className='shop-buy'+(AkisStats.coins()>=fiyat?'':' off');
        b.textContent = t('shop_buy')+' · '+fiyat;
        b.addEventListener('click', ()=>{
          const r=AkisStats.buySound(key, fiyat);
          if(!r.ok){ toast(t(r.reason==='owned'?'shop_owned':'shop_need')); return; }
          toast(t('shop_bought')); refreshCoinPill(); buildMixer();
        });
        row.appendChild(b);
      } else {
        const sl=document.createElement('input'); sl.type='range'; sl.min='0'; sl.max='100'; sl.value=v0;
        sl.addEventListener('input', ()=>{
          const v=+sl.value/100; settings.mix[key]=v; saveSettings();
          AkisAudio.setTrackVolume(key, v);
          row.classList.toggle('on', +sl.value>0);
        });
        row.appendChild(sl);
      }
      box.appendChild(row);
    });
  }
  function initSound(){
    $('#sound-close').addEventListener('click', ()=>toggleDrawer(false));
    buildMixer();

    document.querySelectorAll('#music-chips .chip').forEach(ch=>{
      if(ch.dataset.music===settings.music){
        document.querySelectorAll('#music-chips .chip').forEach(x=>x.classList.remove('active')); ch.classList.add('active');
      }
      if(ch.disabled) return;
      ch.addEventListener('click', ()=>{
        document.querySelectorAll('#music-chips .chip').forEach(x=>x.classList.remove('active'));
        ch.classList.add('active'); settings.music=ch.dataset.music; saveSettings();
        AkisAudio.setMusicVolume(settings.musicVol/100);
        AkisAudio.setMusic(settings.music);
      });
    });
    const mv=$('#music-vol'); mv.value=settings.musicVol;
    mv.addEventListener('input', ()=>{ settings.musicVol=+mv.value; saveSettings(); AkisAudio.setMusicVolume(mv.value/100); });

    // drawer arka planı → dokununca panelleri kapat
    $('#drawer-backdrop').addEventListener('click', ()=>{ toggleDrawer(false); $('#lang-panel').classList.remove('open'); syncBackdrop(); });
  }
  function applyBackground(bg){
    const v=$('#bg-video'), sc=$('#bg-scrim'); if(!v) return;
    if(bg && bg!=='none'){
      const src='assets/video/'+bg+'.mp4';
      if(v.getAttribute('src')!==src){
        v.style.opacity='0';
        v.setAttribute('src',src); try{v.load();}catch(e){}
        v.oncanplay=()=>{ v.style.opacity='1'; v.oncanplay=null; };
        setTimeout(()=>{ v.style.opacity='1'; }, 700);
      }
      v.style.display='block'; if(sc) sc.style.display='block';
      const p=v.play(); if(p&&p.catch) p.catch(()=>{});
      AkisVisual.setBgClear(true);
    } else {
      try{ v.pause(); }catch(e){}
      v.removeAttribute('src'); try{ v.load(); }catch(e){}
      v.style.display='none'; if(sc) sc.style.display='none';
      AkisVisual.setBgClear(false);
    }
  }
  function toggleDrawer(open){ $('#sound-panel').classList.toggle('open', open); syncBackdrop(); }
  function syncBackdrop(){
    const anyOpen = $('#sound-panel').classList.contains('open') || $('#lang-panel').classList.contains('open');
    $('#drawer-backdrop').classList.toggle('open', anyOpen);
  }

  // ========== ÖDÜL BALONU ==========
  let rewardTO=null;
  function showReward(item){
    const box=$('#reward-toast'); if(!box) return;
    $('#reward-emoji').textContent=item.pale?'🥀':(item.firefly?'✨':item.emoji);
    $('#reward-title').textContent=t('reward_added',{label:t('item_'+item.type)});
    $('#reward-sub').textContent=item.pale?t('reward_pale'):(item.firefly?t('reward_night'):t('reward_done'));
    box.classList.add('show');
    if(!item.pale) confettiBurst();          // kutlama: küçük konfeti patlaması (ödül anı boş kalmasın)
    clearTimeout(rewardTO); rewardTO=setTimeout(()=>box.classList.remove('show'), 2600);
  }

  /* ---- Kutlama konfetisi: kütüphanesiz, canvas üstüne 1.6 sn parçacık ---- */
  function confettiBurst(){
    try{
      const cv=$('#visual-canvas'); if(!cv) return;
      const r=cv.getBoundingClientRect();
      const c=document.createElement('canvas');
      c.width=r.width; c.height=r.height;
      c.style.cssText=`position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:30`;
      cv.parentElement.appendChild(c);
      const x=c.getContext('2d');
      const renkler=['#37CFE0','#F4CD76','#8FD99F','#3AA0F0','#ffd9a0'];
      const P=[]; for(let i=0;i<44;i++){ const a=Math.random()*Math.PI*2, v=2+Math.random()*4;
        P.push({x:c.width/2, y:c.height*0.62, vx:Math.cos(a)*v, vy:Math.sin(a)*v-3.2,
                s:3+Math.random()*4, r:renkler[i%renkler.length], w:Math.random()*Math.PI}); }
      let f=0;
      (function adim(){
        x.clearRect(0,0,c.width,c.height);
        P.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.vy+=0.16; p.w+=0.2;
          x.save(); x.translate(p.x,p.y); x.rotate(p.w); x.globalAlpha=Math.max(0,1-f/96);
          x.fillStyle=p.r; x.fillRect(-p.s/2,-p.s/2,p.s,p.s*0.6); x.restore(); });
        if(++f<96) requestAnimationFrame(adim); else c.remove();
      })();
    }catch(e){}
  }

  // ========== GENEL MODAL ==========
  let modalOnClose=null;
  function openModal(opts){
    $('#modal-title').textContent=opts.title||'';
    $('#modal-body').innerHTML=opts.bodyHTML||'';
    const acts=$('#modal-actions'); acts.innerHTML='';
    (opts.actions||[]).forEach(a=>{
      const b=document.createElement('button');
      b.className='m-btn '+(a.cls||'');
      b.textContent=a.label;
      b.addEventListener('click', ()=>{ closeModal(); if(a.fn) a.fn(); });
      acts.appendChild(b);
    });
    modalOnClose=opts.onClose||null;
    $('#modal').classList.add('open');
  }
  function closeModal(){ $('#modal').classList.remove('open'); const f=modalOnClose; modalOnClose=null; if(f) f(); }
  function initModal(){
    $('#modal-x').addEventListener('click', closeModal);
    $('#modal').addEventListener('click', e=>{ if(e.target.id==='modal') closeModal(); });
  }

  // ===== PREMIUM / paywall =====
  // ⚠️ Apple Guideline 3.1.2(c): otomatik yenilenen abonelikte UYGULAMANIN İÇİNDE şunlar ZORUNLU —
  // aboneliğin adı, süresi, fiyatı ve ÇALIŞAN EULA + gizlilik politikası linkleri.
  // 17 Ağu 2026'da tam bu yüzden reddedildik; aşağıdaki bloğu sadeleştirme/silme.
  const EULA_URL='https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
  const PRIVACY_URL='https://akis-odak-app.web.app/gizlilik';

  function premOn(){ try{ return !!(window.AkisPremium && AkisPremium.isPremium()); }catch(e){ return false; } }
  // Linkler: target=_blank → Capacitor hem iOS'ta hem Android'de sistem tarayıcısında açar.
  function legalLinksHTML(){
    return `<p class="pw-links">`+
      `<a href="${EULA_URL}" target="_blank" rel="noopener noreferrer">${esc(t('premium_terms'))}</a>`+
      `<span class="pw-sep" aria-hidden="true">·</span>`+
      `<a href="${PRIVACY_URL}" target="_blank" rel="noopener noreferrer">${esc(t('premium_privacy'))}</a>`+
      `</p>`;
  }
  function openPaywall(){
    // Mağaza fiyatı okunamazsa bile SOMUT bir fiyat görünmeli (Apple 3.1.2(c) fiyatı zorunlu kılıyor).
    const price = (window.AkisPremium && AkisPremium.priceText && AkisPremium.priceText()) || 'US$0.99';
    openModal({
      title: t('premium_title'),
      bodyHTML:
        `<p class="pw-name">${esc(t('premium_product'))}</p>`+
        `<p>${esc(t('premium_body'))}</p>`+
        `<p class="pw-meta">${esc(t('premium_price',{price}))}</p>`+
        `<p class="pw-meta">${esc(t('premium_len'))}</p>`+
        legalLinksHTML(),
      actions: [
        {label: t('premium_restore'), cls:'ghost', fn: async ()=>{
          // 🩹 2026-08-26: eskiden sonuç yutuluyordu → kullanıcıya "hiçbir şey olmadı" gibi görünüyordu
          if(!window.AkisPremium){ toast(t('premium_fail')); return; }
          toast(t('premium_busy'));
          let r=null; try{ r = await AkisPremium.restore(); }catch(e){}
          if(!r || !r.ok) toast(t('premium_fail'));
          else if(r.premium) toast(t('premium_active'));
          else toast(t('premium_restore_none'));
        }},
        {label: t('premium_subscribe'), cls:'primary', fn: async ()=>{
          if(!window.AkisPremium){ toast(t('premium_fail')); return; }
          toast(t('premium_busy'));
          let r=null; try{ r = await AkisPremium.buy(); }catch(e){}
          if(!r || !r.ok){ if(!r || r.reason!=='iptal/hata') toast(t('premium_fail')); }
        }}
      ]
    });
  }
  function refreshPremiumUI(){
    const cta=$('#premium-cta'), row=$('#premium-row');
    const on=premOn();
    let showCta=false;
    try{ showCta = !on && window.AkisAds && AkisAds.adsActive && AkisAds.adsActive(); }catch(e){}
    if(cta) cta.classList.toggle('hidden', !showCta);
    if(row){ row.classList.toggle('premium-on', on); row.textContent = on ? t('premium_active') : t('premium_row'); }
  }
  function initPremium(){
    const cta=$('#premium-cta'); if(cta) cta.addEventListener('click', openPaywall);
    const row=$('#premium-row'); if(row) row.addEventListener('click', ()=>{ if(premOn()) toast(t('premium_active')); else openPaywall(); });
    try{ if(window.AkisPremium){ AkisPremium.init(); AkisPremium.onChange(()=>refreshPremiumUI()); } }catch(e){}
    try{ if(window.AkisI18n && AkisI18n.onChange) AkisI18n.onChange(refreshPremiumUI); }catch(e){}  // dil değişince premium-row metnini tazele
    refreshPremiumUI();
    setInterval(refreshPremiumUI, 30000);  // muafiyet bitince "reklamsız ol" düğmesi kendiliğinden çıksın
  }

  // ========== PUANLA / PAYLAŞ / TANITIM ==========
  const PKG='com.asimgokcek.akis';
  const APPLE_ID='6791552371';
  /* 🩹 2026-08-26 DÜZELTME — mağaza bağlantısı PLATFORMA GÖRE seçilir.
     Eskiden sabit Google Play adresiydi: iPhone'da "Uygulamayı puanla" market:// çalışmadığı için
     Google Play sayfasına düşüyor, "Arkadaşına gönder" de iPhone kullanıcısına PLAY linki yolluyordu. */
  function magazaPlat(){ try{ return (window.Capacitor && Capacitor.getPlatform && Capacitor.getPlatform()) || 'web'; }catch(e){ return 'web'; } }
  const PLAY_URL='https://play.google.com/store/apps/details?id='+PKG;
  const APPLE_URL='https://apps.apple.com/app/id'+APPLE_ID;
  function storeUrl(){ return magazaPlat()==='ios' ? APPLE_URL : PLAY_URL; }
  const TOUR_KEY='akis.tour.v2';   // v2: teknik+bilim sayfalari eklendi (2026-08-27)
  const RATE_KEY='akis.rateAsked.v1';
  const RATE_AFTER=5;                    // bu kadar seans bitince bir kez puan sorulur

  function isNative(){ try{ return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); }catch(e){ return false; } }

  /* Mağaza sayfası: önce mağaza uygulamasını aç (Android market:// · iOS itms-apps://),
     açılmazsa https adresine düş. Platform ayrımı ŞART — iOS'ta market:// hiçbir şey yapmaz. */
  function openStore(){
    try{ localStorage.setItem(RATE_KEY,'1'); }catch(e){}
    const web = storeUrl();
    if(isNative()){
      const derin = magazaPlat()==='ios'
        ? 'itms-apps://itunes.apple.com/app/id'+APPLE_ID+'?action=write-review'
        : 'market://details?id='+PKG;
      let acildi=false;
      const to=setTimeout(()=>{ if(!acildi) try{ window.open(web,'_blank'); }catch(e){} }, 900);
      try{ window.location.href=derin; acildi=true; }catch(e){ clearTimeout(to); }
      setTimeout(()=>clearTimeout(to), 2500);
      return;
    }
    try{ window.open(web,'_blank'); }catch(e){}
  }

  // Paylaş: Capacitor Share → Web Share → panoya kopyala (hepsi başarısızsa sessiz).
  async function shareApp(){
    const metin=t('share_text')+' '+storeUrl();
    try{
      const Share = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Share;
      if(Share && Share.share){ await Share.share({title:'Akora', text:t('share_text'), url:storeUrl()}); return; }
    }catch(e){ return; }                                  // kullanıcı vazgeçti → sessiz
    try{ if(navigator.share){ await navigator.share({title:'Akora', text:t('share_text'), url:storeUrl()}); return; } }catch(e){ return; }
    try{ await navigator.clipboard.writeText(metin); toast(t('link_copied')); }catch(e){}
  }

  // ---- tanıtım turu ----
  // Maskot "Damla": 〜 logosundan türeyen su damlası karakter (emoji yerine marka SVG'leri — her cihazda aynı görünür)
  const MASKOT_GOVDE=(ic)=>`<svg viewBox="0 0 96 96" width="84" height="84" fill="none">
    <defs><linearGradient id="mg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fe0ea"/><stop offset="1" stop-color="#2a9fd4"/></linearGradient></defs>
    <path d="M48 8C34 30 22 44 22 60a26 26 0 0 0 52 0C74 44 62 30 48 8Z" fill="url(#mg)"/>
    <ellipse cx="39" cy="56" rx="4" ry="5.6" fill="#08222e"/><ellipse cx="57" cy="56" rx="4" ry="5.6" fill="#08222e"/>
    <circle cx="40.4" cy="54" r="1.5" fill="#eafcff"/><circle cx="58.4" cy="54" r="1.5" fill="#eafcff"/>
    <path d="M40 68q8 6 16 0" stroke="#08222e" stroke-width="3" stroke-linecap="round"/>
    <path d="M30 40q4-6 8-8" stroke="#bdf3fa" stroke-width="3" stroke-linecap="round" opacity=".7"/>${ic||''}</svg>`;
  const TOUR=[
    {emoji:MASKOT_GOVDE(''), t:'tour_t1', b:'tour_b1'},
    // 2026-08-27: rakiplerin giris ekranlarinda teknigin KENDISI anlatiliyordu; bizde yoktu
    {emoji:MASKOT_GOVDE('<g transform="translate(56,8)" fill="none" stroke="#f4cd76" stroke-width="2.4"><rect x="0" y="6" width="9" height="9" rx="2.5" fill="#f4cd76" stroke="none"/><rect x="12" y="6" width="9" height="9" rx="2.5"/><rect x="0" y="19" width="9" height="9" rx="2.5" fill="#f4cd76" stroke="none"/><rect x="12" y="19" width="9" height="9" rx="2.5"/></g>'), t:'tour_t5', b:'tour_b5'},
    {emoji:MASKOT_GOVDE('<g transform="translate(58,6)" fill="none" stroke="#f4cd76" stroke-width="2.4" stroke-linecap="round"><path d="M13 24a9 9 0 1 1 6 0v3h-6z"/><path d="M13 30h6" /><path d="M16 2v3M5 9l2 2M27 9l-2 2"/></g>'), t:'tour_t6', b:'tour_b6'},
    {emoji:MASKOT_GOVDE('<g transform="translate(60,10)"><circle cx="14" cy="14" r="13" fill="#10151c" stroke="#f4cd76" stroke-width="2.5"/><path d="M14 7v7l5 3" stroke="#f4cd76" stroke-width="2.5" stroke-linecap="round"/></g>'), t:'tour_t2', b:'tour_b2'},
    {emoji:MASKOT_GOVDE('<g transform="translate(58,8)" stroke="#f4cd76" stroke-width="2.5" fill="none" stroke-linecap="round"><path d="M4 18v-4a12 12 0 0 1 24 0v4"/><rect x="1" y="16" width="8" height="11" rx="3" fill="#f4cd76" stroke="none"/><rect x="23" y="16" width="8" height="11" rx="3" fill="#f4cd76" stroke="none"/></g>'), t:'tour_t3', b:'tour_b3'},
    {emoji:MASKOT_GOVDE('<g transform="translate(58,10)" fill="none" stroke="#f4cd76" stroke-width="2.4" stroke-linecap="round"><path d="M3 12h18v8a8 8 0 0 1-16 0z" fill="#f4cd76" stroke="none"/><path d="M21 14h3a4 4 0 0 1 0 8h-3"/><path d="M8 6q2-3 0-5M14 6q2-3 0-5"/></g>'), t:'tour_t7', b:'tour_b7'},
    {emoji:MASKOT_GOVDE('<g transform="translate(62,6)"><path d="M12 2C6 12 2 17 2 23a10 10 0 0 0 20 0C22 17 18 12 12 2Z" fill="#4E9C68"/><rect x="10" y="26" width="4" height="8" rx="1.5" fill="#6B4A3A"/></g>'), t:'tour_t4', b:'tour_b4'}
  ];
  let tourStep=0;
  function tourNeeded(){ try{ return localStorage.getItem(TOUR_KEY)!=='1'; }catch(e){ return false; } }
  function startTour(again){
    tourStep=0;
    drawTour();
  }
  function tourSeen(){ try{ localStorage.setItem(TOUR_KEY,'1'); }catch(e){} }   // bayrak SONDA/Geç'te yazılır — yarıda kapatan tur hakkını kaybetmesin
  function drawTour(){
    const s=TOUR[tourStep], son=tourStep===TOUR.length-1;
    const dots=TOUR.map((_,i)=>`<i class="${i===tourStep?'on':''}"></i>`).join('');
    const acts=[];
    if(tourStep>0) acts.push({label:t('tour_back'), cls:'ghost', fn:()=>{ tourStep--; drawTour(); }});
    else acts.push({label:t('tour_skip'), cls:'ghost', fn:tourSeen});
    acts.push({label: son?t('tour_done'):t('tour_next'), cls:'primary',
               fn: son?tourSeen:()=>{ tourStep++; drawTour(); }});
    openModal({
      title: t(s.t),
      bodyHTML: `<div class="tour-emoji">${s.emoji}</div><p>${esc(t(s.b))}</p><div class="tour-dots">${dots}</div>`,
      actions: acts
    });
  }

  /* Puanlama artık MAĞAZALARIN KENDİ penceresiyle yapılıyor → js/degerlendirme.js
     (Android: Play In-App Review · iOS: SKStoreReviewController).

     🚨 Buradaki ESKİ özel pencere KALDIRILDI. Sebebi kozmetik değil, kural:
        Google ve Apple, yerleşik puanlama akışından ÖNCE kendi sorunuzu
        sormanızı açıkça yasaklıyor. Ayrıca eski akış TEK SEFERLİKTİ —
        "sonra" diyen kullanıcıya bir daha hiç sorulmuyordu.
     ✅ Kazanç: pencere kullanıcının TELEFON DİLİNDE geliyor (20 dilin
        hepsi bedava), uygulamadan çıkarmıyor ve seyrek ama TEKRAR soruyor.
     Eşikler degerlendirme.js › AYAR bloğunda; OTA ile mağaza güncellemesi
     olmadan değiştirilebilir. */
  function maybeAskRating(){
    try{ if(window.AkoraPuan && AkoraPuan.seansBitti) return AkoraPuan.seansBitti(); }catch(e){}
  }

  function initSupport(){
    const bt=$('#btn-tour');  if(bt) bt.addEventListener('click', ()=>startTour(true));
    /* Menüden "Uygulamayı puanla": ÖNCE yerleşik pencereyi dene (uygulamadan
       çıkarmaz, kullanıcının dilinde gelir). Mağaza kotası dolu ya da eklenti
       yoksa mağaza sayfasına düş — kullanıcı bir şeye bastı, bir şey olmalı. */
    const br=$('#btn-rate');
    if(br) br.addEventListener('click', async ()=>{
      let oldu=false;
      try{ if(window.AkoraPuan && AkoraPuan.elle) oldu = await AkoraPuan.elle(); }catch(e){}
      if(!oldu) openStore();
    });
    const bs=$('#btn-share'); if(bs) bs.addEventListener('click', shareApp);
  }

  // oturum listesi HTML'i
  function sessionListHTML(list){
    if(!list || !list.length) return `<div class="empty-row">${esc(t('no_sessions'))}</div>`;
    return `<ul class="sess-list">`+list.map(s=>{
      const d=new Date(s.ts||0);
      const hh=String(d.getHours()).padStart(2,'0'), mm=String(d.getMinutes()).padStart(2,'0');
      const nm=(s.name && s.name.trim()) ? esc(s.name) : esc(t('session_unnamed'));
      const time=(s.ts? ` · ${hh}:${mm}`:'');
      return `<li><span class="sess-name">${nm}</span><span class="sess-meta">${esc(t('dur_min',{n:s.min}))}${time}</span></li>`;
    }).join('')+`</ul>`;
  }
  function openTodaySessions(){
    openModal({ title:t('today_sessions'), bodyHTML:sessionListHTML(AkisStats.todaySessions()) });
  }

  /* ===================== ZAMAN TÜNELİ (2026-08-27) =====================
     Rakiplerde tüm geçmiş bir akış hâlinde görünüyordu; bizde yalnız "bugün" vardı. */
  function gunEtiketi(ds){
    const bugun=AkisStats.today();
    const d=new Date(); d.setDate(d.getDate()-1);
    const dun=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if(ds===bugun) return t('timeline_today');
    if(ds===dun)   return t('timeline_yesterday');
    try{
      const [y,m,g]=ds.split('-').map(Number);
      return new Date(y,m-1,g).toLocaleDateString(AkisI18n.current(),{day:'numeric',month:'long'});
    }catch(e){ return ds; }
  }
  function openTimeline(){
    const gunler=AkisStats.timeline(30);
    const govde = !gunler.length
      ? `<div class="empty-row">${esc(t('timeline_empty'))}</div>`
      : gunler.map(g=>
          `<div class="tl-day"><div class="tl-head"><b>${esc(gunEtiketi(g.date))}</b>`+
          `<span>${esc(t('timeline_day_sum',{n:g.list.length,m:g.minutes}))}</span></div>`+
          sessionListHTML(g.list)+`</div>`).join('');
    openModal({ title:t('timeline_title'), bodyHTML:`<div class="tl-wrap">${govde}</div>` });
  }

  /* ===================== BAHÇEM (2026-08-27) =====================
     Dekore edilebilir izometrik alan. Ağaçlar ve satın alınan süsler
     istenen hücreye sürüklenir; yerleşim cihazda saklanır. */
  function openPlot(){
    // ana ekran ormaninin durmasi show()'daki EKRAN_KAPANIS'ta (view-home)
    show('view-plot');
    const cv=$('#plot-cv');
    requestAnimationFrame(()=>{ try{ AkisPlot.mount(cv); }catch(e){ console && console.warn(e); } });
  }
  function closePlot(){
    // AkisPlot.unmount() show()'daki EKRAN_KAPANIS['view-plot'] tarafindan yapilir
    // (donanim geri tusundan cikista da calissin diye oraya tasindi, 2026-08-30).
    // 2026-08-29: Bahçem artık menüdeki orman kartından da açılıyor;
    // oradan gelindiyse istatistiğe değil ANA EKRANA dönülür.
    if(window.__akoraPlotEve){ window.__akoraPlotEve=false; show('view-home'); return; }
    show('view-stats'); openStats(); refreshPondMini();
  }
  function initPlot(){
    const b=$('#btn-plot');   if(b) b.addEventListener('click', openPlot);
    // ana ekrandaki mini orman görseline dokununca da bahçe açılsın (kullanıcı isteği)
    const mini=$('#pond-mini');
    if(mini){ mini.style.cursor='pointer'; mini.addEventListener('click', openPlot); }
    const g=$('#plot-back');  if(g) g.addEventListener('click', closePlot);
    const r=$('#plot-reset'); if(r) r.addEventListener('click', ()=>{
      openModal({ title:t('plot_reset_title'), bodyHTML:`<p>${esc(t('plot_reset_body'))}</p>`,
        actions:[{label:t('cancel'), cls:'ghost'},
                 {label:t('reset_ok'), cls:'danger', fn:()=>{ try{ AkisPlot.sifirla(); }catch(e){} }}] });
    });
  }

  /* ===================== SÜS DÜKKÂNI + JETON (2026-08-27) =====================
     Odaklanılan her dakika 1 jeton. Jetonlar ormana süs açar.
     ⚠️ Var olan hiçbir şey kilitlenmedi — yalnız YENİ süsler eklendi. */
  const DECOS=[
    {id:'flowers', fiyat:60,  ad:'deco_flowers', sim:'\u{1F338}'},
    {id:'rock',    fiyat:90,  ad:'deco_rock',    sim:'\u{1FAA8}'},
    {id:'lantern', fiyat:150, ad:'deco_lantern', sim:'\u{1F3EE}'},
    {id:'bench',   fiyat:240, ad:'deco_bench',   sim:'\u{1FA91}'},
    {id:'pond',    fiyat:380, ad:'deco_pond',    sim:'\u{1F4A7}'},
    {id:'fox',     fiyat:600, ad:'deco_fox',     sim:'\u{1F98A}'}
  ];
  const ZEMINLER=[
    {id:'grass',  fiyat:0,   ad:'ground_grass',  renk:'#438a55'},
    {id:'meadow', fiyat:120, ad:'ground_meadow', renk:'#5da255'},
    {id:'sand',   fiyat:200, ad:'ground_sand',   renk:'#cbab72'},
    {id:'stone',  fiyat:320, ad:'ground_stone',  renk:'#7c868c'},
    {id:'snow',   fiyat:450, ad:'ground_snow',   renk:'#d6e2ea'},
    {id:'night',  fiyat:700, ad:'ground_night',  renk:'#31485f'}
  ];
  /* Ağaç TÜRLERİ (2026-08-29) — renkten farklı: gövde ve taç biçimi değişir.
     Görseller CC0 (Wenrexa, OpenGameArt) → www/assets/agac/turler/<id>.webp
     Lisans kaydı: _tasarim/varliklar/KAYNAKLAR.md */
  /* FİYAT MERDİVENİ (2026-08-29, rakip ölçümüne göre ayarlandı)
     Kazanç: 1 odak dakikası = 1 jeton. Forest'ta 10 dk = 3 jeton (0,3/dk) —
     yani biz 3,3 KAT cömertiz. Forest'ın EN UCUZ ağacı 600 jeton ≈ 33 saat odak
     ve en sık şikâyeti "ağaçlar çok pahalı". Bizde merdiven şöyle kuruldu:
       giriş   150–350  → 2,5–6 saat  (ilk hafta içinde birkaç tanesi alınır)
       orta    450–650  → 7,5–11 saat
       uzun    800–1000 → 13–17 saat  (en pahalısı bile Forest'ın EN UCUZUNUN yarısı)
     Toplam 9 ağaç = 4950 jeton ≈ 82 saat odak. Günlük giriş + görevlerle
     (~75 jeton/gün ek) bu süre pratikte yarıya iner. */
  const AGAC_TURLERI=[
    {id:'klasik',  fiyat:0,   ad:'tur_klasik'},
    {id:'mese',    fiyat:150, ad:'tur_mese'},
    {id:'turuncu', fiyat:250, ad:'tur_turuncu'},
    {id:'kavak',   fiyat:350, ad:'tur_kavak'},
    {id:'alev',    fiyat:450, ad:'tur_alev'},
    {id:'altin',   fiyat:550, ad:'tur_altin'},
    {id:'leylak',  fiyat:650, ad:'tur_leylak'},
    {id:'bonsai',  fiyat:800, ad:'tur_bonsai'},
    {id:'sogut',   fiyat:900, ad:'tur_sogut'},
    {id:'kis',     fiyat:1000,ad:'tur_kis'}
  ];
  function agacTurGorsel(id){
    return id==='klasik' ? 'assets/agac/tree.webp' : 'assets/agac/turler/'+id+'.webp';
  }

  const PALETLER=[
    {id:'forest', fiyat:0,   ad:'pal_forest'},
    {id:'sakura', fiyat:250, ad:'pal_sakura'},
    {id:'autumn', fiyat:350, ad:'pal_autumn'},
    {id:'frost',  fiyat:500, ad:'pal_frost'},
    {id:'golden', fiyat:700, ad:'pal_golden'},
    {id:'mor',    fiyat:900, ad:'pal_mor'}
  ];
  const HAVALAR=[
    {id:'clear',   fiyat:0,   ad:'wx_clear',   sim:'☀️'},
    {id:'firefly', fiyat:180, ad:'wx_firefly', sim:'✨'},
    {id:'rain',    fiyat:300, ad:'wx_rain',    sim:'🌧️'},
    {id:'snow',    fiyat:420, ad:'wx_snow',    sim:'❄️'},
    {id:'fog',     fiyat:560, ad:'wx_fog',     sim:'🌫️'}
  ];
  let shopSekme='tree';

  function refreshCoinPill(){
    const el=$('#coin-pill'); if(el) el.textContent=t('coins_have',{n:AkisStats.coins()});
  }
  function paletNokta(id){
    let c=[90,170,118];
    try{ c=AkisGarden.paletRenk(id); }catch(e){}
    return '<span class="shop-sw" style="background:rgb('+c[0]+','+c[1]+','+c[2]+')"></span>';
  }
  /* onizle: {id, tur, ek} verilirse satır tıklanabilir olur ve büyük önizleme açar */
  function satirHTML(sim, ad, sag, onizle){
    const oz = onizle
      ? ' data-onizle="'+esc(onizle.id)+'" data-onizle-ad="'+esc(ad)+'"'+
        ' data-onizle-tur="'+esc(onizle.tur)+'" data-onizle-ek="'+esc(onizle.ek||'')+'"'
      : '';
    return '<li'+oz+'><span class="shop-ic">'+sim+'</span><span class="shop-name">'+esc(ad)+'</span>'+sag+'</li>';
  }
  function alDugmesi(tur, id, fiyat, yeter){
    return '<button class="shop-buy'+(yeter?'':' off')+'" data-tur="'+tur+'" data-id="'+id+'">'+esc(t('shop_buy'))+' · '+fiyat+'</button>';
  }
  function secDugmesi(tur, id, aktif){
    return aktif ? '<span class="shop-own">'+esc(t('shop_active'))+'</span>'
                 : '<button class="shop-use" data-tur="'+tur+'" data-id="'+id+'">'+esc(t('shop_use'))+'</button>';
  }

  function shopHTML(){
    const jeton=AkisStats.coins();
    const sekmeler=[['tree','agac_tur'],['deco','shop_tab_deco'],['ground','shop_tab_ground'],
                    ['pal','shop_tab_pal'],['wx','shop_tab_wx'],['grow','shop_tab_grow']];
    let govde='';

    if(shopSekme==='tree'){
      const sahip=AkisStats.ownedTrees(), akt=AkisStats.activeTree();
      govde='<ul class="shop-list">'+AGAC_TURLERI.map(function(a){
        const v=sahip.indexOf(a.id)>=0, yeter=jeton>=a.fiyat;
        const kucuk='<img class="shop-agac" src="'+agacTurGorsel(a.id)+'" alt="" loading="lazy">';
        return satirHTML(kucuk, t(a.ad),
                         v ? secDugmesi('tree',a.id,akt===a.id) : alDugmesi('tree',a.id,a.fiyat,yeter),
                         {id:a.id, tur:'tree'});
      }).join('')+'</ul>';
    } else if(shopSekme==='deco'){
      govde='<ul class="shop-list">'+DECOS.map(function(d){
        const varMi=AkisStats.hasDeco(d.id), yeter=jeton>=d.fiyat;
        return satirHTML(d.sim, t(d.ad), varMi ? '<span class="shop-own">'+esc(t('shop_owned'))+'</span>'
                                              : alDugmesi('deco',d.id,d.fiyat,yeter),
                         {id:d.id, tur:'deco', ek:d.sim});
      }).join('')+'</ul>';
    } else if(shopSekme==='ground'){
      const sahip=AkisStats.ownedGrounds(), akt=AkisStats.activeGround();
      govde='<ul class="shop-list">'+ZEMINLER.map(function(z){
        const v=sahip.indexOf(z.id)>=0, yeter=jeton>=z.fiyat;
        const sw='<span class="shop-sw" style="background:'+z.renk+'"></span>';
        return satirHTML(sw, t(z.ad), v ? secDugmesi('ground',z.id,akt===z.id) : alDugmesi('ground',z.id,z.fiyat,yeter),
                         {id:z.id, tur:'ground', ek:z.renk});
      }).join('')+'</ul>';
    } else if(shopSekme==='pal'){
      const sahip=AkisStats.ownedPalettes(), akt=AkisStats.activePalette();
      govde='<ul class="shop-list">'+PALETLER.map(function(pl){
        const v=sahip.indexOf(pl.id)>=0, yeter=jeton>=pl.fiyat;
        let prenk='#5aa06e';
        try{ const c=AkisGarden.paletRenk(pl.id); prenk='rgb('+c[0]+','+c[1]+','+c[2]+')'; }catch(e){}
        return satirHTML(paletNokta(pl.id), t(pl.ad), v ? secDugmesi('pal',pl.id,akt===pl.id) : alDugmesi('pal',pl.id,pl.fiyat,yeter),
                         {id:pl.id, tur:'pal', ek:prenk});
      }).join('')+'</ul>';
    } else if(shopSekme==='wx'){
      const sahip=AkisStats.ownedWeathers(), akt=AkisStats.activeWeather();
      govde='<ul class="shop-list">'+HAVALAR.map(function(w){
        const v=sahip.indexOf(w.id)>=0, yeter=jeton>=w.fiyat;
        return satirHTML(w.sim, t(w.ad), v ? secDugmesi('wx',w.id,akt===w.id) : alDugmesi('wx',w.id,w.fiyat,yeter),
                         {id:w.id, tur:'wx', ek:w.sim});
      }).join('')+'</ul>';
    } else {
      const n=AkisStats.plotSize(), f=AkisStats.expandPrice(), olur=AkisStats.canExpand();
      govde='<p class="shop-hint">'+esc(t('grow_body',{n:n,m:n*n}))+'</p>'+
        (olur ? '<ul class="shop-list">'+satirHTML('\u{1F3DD}️', t('grow_one',{n:n+1}), alDugmesi('grow','plot',f, jeton>=f))+'</ul>'
              : '<div class="empty-row">'+esc(t('grow_max'))+'</div>');
    }

    return '<div class="shop-tabs">'+sekmeler.map(function(x){
        return '<button class="shop-tab'+(shopSekme===x[0]?' on':'')+'" data-sekme="'+x[0]+'">'+esc(t(x[1]))+'</button>';
      }).join('')+'</div>'+
      '<p class="shop-bal">'+esc(t('coins_have',{n:jeton}))+'</p>'+govde+
      '<p class="shop-hint">'+esc(t('shop_hint'))+'</p>';
  }

  /* Dükkân önizlemesi: modal'ın üstünde ayrı bir katman.
     Dükkânı KAPATMAZ — kapanınca kullanıcı listeye geri döner. */
  function onizleAc(id, ad, tur, ek){
    let k=$('#shop-onizle');
    if(!k){
      k=document.createElement('div'); k.id='shop-onizle'; k.className='shop-onizle';
      k.innerHTML='<div class="so-kart">'+
        '<button class="so-x" aria-label="Kapat"><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button>'+
        '<div class="so-gorsel"></div><p class="so-ad"></p></div>';
      document.body.appendChild(k);
      k.addEventListener('click', function(e){ if(e.target===k || e.target.closest('.so-x')) k.classList.remove('open'); });
    }
    // Ağaçta gerçek görsel; zemin/renkte büyük renk alanı; süs/havada büyük simge.
    let ic;
    if(tur==='tree')                      ic='<img src="'+agacTurGorsel(id)+'" alt="">';
    else if(tur==='ground'||tur==='pal')  ic='<span class="so-renk" style="background:'+esc(ek||'#ccc')+'"></span>';
    else                                  ic='<span class="so-sim">'+(ek||'')+'</span>';
    k.querySelector('.so-gorsel').innerHTML=ic;
    k.querySelector('.so-ad').textContent=ad||'';
    k.classList.add('open');
  }

  function openShop(){
    openModal({ title:t('shop_title'), bodyHTML:shopHTML() });
    baglaShop();
  }
  function tazeleShop(){
    const g=$('#modal-body'); if(!g) return;
    g.innerHTML=shopHTML(); baglaShop();
    refreshCoinPill(); refreshPondMini();
    try{ AkisPlot.rebuild(); }catch(e){}
    try{ if(window.AkisPlot && AkisPlot.gorselTemizle) AkisPlot.gorselTemizle(); }catch(e){}
    try{ if(window.AkoraAna && AkoraAna.yenile) AkoraAna.yenile(); }catch(e){}
  }
  function baglaShop(){
    const g=$('#modal-body'); if(!g) return;
    g.querySelectorAll('.shop-tab').forEach(function(b){
      b.addEventListener('click', function(){ shopSekme=b.dataset.sekme; tazeleShop(); });
    });
    g.querySelectorAll('.shop-buy').forEach(function(b){
      b.addEventListener('click', function(){
        const tur=b.dataset.tur, id=b.dataset.id;
        let r;
        if(tur==='tree'){ const a=AGAC_TURLERI.find(function(x){return x.id===id;}); r=AkisStats.buyTree(id,a.fiyat); }
        else if(tur==='deco'){ const d=DECOS.find(function(x){return x.id===id;}); r=AkisStats.buyDeco(id,d.fiyat); }
        else if(tur==='ground'){ const z=ZEMINLER.find(function(x){return x.id===id;}); r=AkisStats.buyGround(id,z.fiyat); }
        else if(tur==='pal'){ const pl=PALETLER.find(function(x){return x.id===id;}); r=AkisStats.buyPalette(id,pl.fiyat); }
        else if(tur==='wx'){ const w=HAVALAR.find(function(x){return x.id===id;}); r=AkisStats.buyWeather(id,w.fiyat); }
        else { r=AkisStats.expandPlot(); }
        if(!r || !r.ok){
          toast(t(r && r.reason==='owned' ? 'shop_owned' : (r && r.reason==='max' ? 'grow_max' : 'shop_need')));
          return;
        }
        toast(t(tur==='grow' ? 'grow_done' : 'shop_bought'));
        tazeleShop();
      });
    });
    /* Büyük önizleme (2026-08-29 kullanıcı isteği): satıra dokununca ne aldığını
       ortada büyük görsel olarak görsün. Al/Kullan düğmeleri bundan etkilenmez. */
    g.querySelectorAll('li[data-onizle]').forEach(function(li){
      li.addEventListener('click', function(e){
        if(e.target.closest('button')) return;      // Al / Kullan tıklaması değil
        onizleAc(li.dataset.onizle, li.dataset.onizleAd, li.dataset.onizleTur, li.dataset.onizleEk);
      });
    });

    g.querySelectorAll('.shop-use').forEach(function(b){
      b.addEventListener('click', function(){
        const tur=b.dataset.tur, id=b.dataset.id;
        if(tur==='tree') AkisStats.setTree(id);
        else if(tur==='ground') AkisStats.setGround(id);
        else if(tur==='wx') AkisStats.setWeather(id);
        else AkisStats.setPalette(id);
        try{ if(window.AkisPlot && AkisPlot.gorselTemizle) AkisPlot.gorselTemizle(); }catch(e){}
        try{ if(window.AkoraAna && AkoraAna.yenile) AkoraAna.yenile(); }catch(e){}
        tazeleShop();
      });
    });
  }
  function openDayDetail(dateStr, dayLabel){
    const list=AkisStats.sessionsForDate(dateStr);
    const mins=AkisStats.dayMinutes(dateStr);
    const summary=`<div class="day-summary">${esc(t('dur_min',{n:mins}))} · ${esc(t('sessions_count',{n:list.length}))}</div>`;
    openModal({ title:dayLabel, bodyHTML: summary + sessionListHTML(list) });
  }

  // ========== İSTATİSTİK + ORMAN ==========
  function initStats(){
    $('#stats-back').addEventListener('click', ()=>{ show('view-home'); });   // temizlik + orman tazeleme: show() tablosu
    $('#btn-today-sessions').addEventListener('click', openTodaySessions);
    const tl=$('#btn-timeline'); if(tl) tl.addEventListener('click', openTimeline);
    const sh=$('#btn-shop');     if(sh) sh.addEventListener('click', ()=>{ openShop();
      try{ if(window.AkisAds && AkisAds.kapiSessiz) AkisAds.kapiSessiz('dukkan'); }catch(e){} });   // ☁️ varsayılan KAPALI

    // ---- VERİ YEDEĞİ: dışa aktar (paylaş/panoya) + geri yükle (yapıştır) ----
    const be=$('#btn-backup'), bi=$('#btn-restore');
    if(be) be.addEventListener('click', async ()=>{
      /* Yedeğin içeriği TEK YERDE kurulur → js/yedek.js › AkoraYedek.
         (İstatistik + Kitaplık + Bahçem yerleşimi + uygulama ayarları.) */
      let veri;
      try{ veri=AkoraYedek.metin(); }catch(e){ veri=AkisStats.exportData(); }
      try{
        const Share = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Share;
        if(isNative() && Share && Share.share){ await Share.share({ title:'Akis backup', text:veri }); return; }
      }catch(e){ return; }   // paylaşımdan vazgeçti → sessiz
      /* 🪤 Panoya yazma sessizce patlayabilir (odaklanmamış sayfa, izin yok,
         güvensiz bağlam). Eskiden `catch(e){}` bunu yutuyordu ve düğme
         hiçbir şey yapmıyor gibi görünüyordu. Artık tutmazsa yedeği
         ekranda gösteriyoruz — kullanıcı elle kopyalayabilir. */
      try{
        await navigator.clipboard.writeText(veri);
        toast(t('backup_copied'));
      }catch(e){
        openModal({
          title: t('backup_export'),
          bodyHTML: `<p>${esc(t('backup_copy_manual'))}</p>
            <textarea class="restore-ta" rows="6" readonly>${esc(veri)}</textarea>`,
          actions:[{label:t('cancel'), cls:'ghost'}]
        });
        setTimeout(()=>{ const ta=document.querySelector('#modal .restore-ta');
          if(ta){ ta.focus(); ta.select(); } }, 120);
      }
    });
    if(bi) bi.addEventListener('click', ()=>{
      openModal({
        title:t('backup_import'),
        bodyHTML:`<textarea id="restore-ta" class="restore-ta" rows="6" placeholder="${esc(t('backup_paste_ph'))}"></textarea>`,
        actions:[
          {label:t('cancel'), cls:'ghost'},
          {label:t('backup_import'), cls:'primary', fn:()=>{
            const v=($('#restore-ta')||{}).value||'';
            let oldu=false;
            try{ oldu=AkoraYedek.uygula(v); }catch(e){ oldu=false; }
            if(oldu){
              toast(t('restore_done'));
              /* 🪤 Ayarlar ve Bahçem yerleşimi de geri geldiği için YENİDEN
                 YÜKLEMEK ŞART: bellekteki eski yerleşim, kullanıcı Bahçem'i bir
                 daha açtığında geri yüklenen veriyi ÜSTÜNE YAZARDI (sessiz kayıp).
                 hesap.js'in buluttan geri yükleme yolu da aynısını yapıyor. */
              setTimeout(()=>location.reload(), 800);
            }
            else toast(t('restore_fail'));
          }}
        ]
      });
    });
    $('#btn-reset-stats').addEventListener('click', ()=>{
      openModal({
        title:t('reset_title'),
        bodyHTML:`<p>${esc(t('reset_confirm'))}</p>`,
        actions:[
          {label:t('cancel'), cls:'ghost'},
          {label:t('reset_ok'), cls:'danger', fn:()=>{ AkisStats.reset(); openStats(); refreshPondMini(); }}
        ]
      });
    });
  }
  function openStats(){
    // Ana ekran ormaninin durmasi/geri baglanmasi show() tablosunda (EKRAN_KAPANIS/ACILIS)
    $('#st-today').textContent = AkisStats.todayMinutes();
    $('#st-streak').textContent = AkisStats.streak();
    $('#st-total').textContent = AkisStats.totalHours().toFixed(1);
    // seri dondurma hakkı + rozetler
    const fl=$('#freeze-left'); if(fl) fl.textContent = t('freeze_left',{n:AkisStats.freezesLeft()});
    const br=$('#badges-row');
    if(br && AkisStats.badges){
      br.innerHTML = AkisStats.badges().map(b=>
        `<div class="badge ${b.on?'on':''}" title="${esc(t(b.id))}"><span class="b-emoji">${b.emoji}</span><span class="b-name">${esc(t(b.id))}</span></div>`
      ).join('');
    }
    const ph=$('#pond-stats-h'); if(ph) ph.textContent='🌳 '+t('forest_stats_title',{n:AkisStats.itemCount()});
    refreshCoinPill();
    refreshDailyCard();      // ② günlük check-in + görevler · ⑦ aylık mücadele
    refreshPeriod();         // ④ Gün/Hafta/Ay/Yıl grafiği
    refreshTagBreakdown();   // ③ etikete göre zaman dağılımı
    show('view-stats');
    requestAnimationFrame(()=>AkisGarden.mount($('#pond-full'), AkisStats.items()));
  }

  /* ================= AKORA_YENI_EKRANLAR (2026-08-28) =================
     Forest denetiminden çıkan eksikler. Hepsi CİHAZDA çalışır, hesap istemez. */

  // ---- ③ ETİKETLER ----
  function etiketAdi(id){
    const t0 = AkisStats.tagById(id);
    if(t0 && t0.ozel) return t0.ad;                 // kullanıcının kendi etiketi: çevrilmez
    return t('tag_' + (id||'other'));
  }
  function etiketRengi(id){
    const t0 = AkisStats.tagById(id);
    return (t0 && t0.renk) || '#9aa7b4';
  }
  function refreshTagRow(){
    const box=$('#tag-row'); if(!box) return;
    const aktif=AkisStats.activeTag();
    box.innerHTML = AkisStats.tags().map(tg=>
      `<button class="tag-chip${tg.id===aktif?' on':''}" data-tag="${esc(tg.id)}">
         <span class="dot" style="background:${esc(tg.renk)}"></span>${esc(etiketAdi(tg.id))}
       </button>`).join('') +
      `<button class="tag-chip add" id="tag-add-btn">+ ${esc(t('tag_new'))}</button>`;
    box.querySelectorAll('.tag-chip[data-tag]').forEach(b=>{
      b.addEventListener('click', ()=>{ AkisStats.setActiveTag(b.dataset.tag); refreshTagRow(); });
    });
    const ekle=$('#tag-add-btn');
    if(ekle) ekle.addEventListener('click', yeniEtiketSor);
  }
  function yeniEtiketSor(){
    openModal({
      title:t('tag_new'),
      bodyHTML:`<input id="tag-ad" class="restore-ta" style="font-family:inherit;font-size:15px;height:44px" maxlength="20" placeholder="${esc(t('tags_title'))}">`,
      actions:[
        {label:t('cancel'), cls:'ghost'},
        {label:t('checkin_get'), cls:'primary', fn:()=>{
          const v=($('#tag-ad')||{}).value||'';
          const renkler=['#e879a6','#6ef0d6','#f4cd76','#7bd88f','#9d8df1','#5ec2f0'];
          const yeni=AkisStats.addTag(v, renkler[(AkisStats.tags().length)%renkler.length]);
          if(yeni){ AkisStats.setActiveTag(yeni.id); refreshTagRow(); }
        }}
      ]
    });
    setTimeout(()=>{ const i=$('#tag-ad'); if(i) i.focus(); }, 120);
  }

  // ---- ⑤ FAVORİLERİM ----
  const FAVKEY='akis.fav.v1';
  function favOku(){ try{ return JSON.parse(localStorage.getItem(FAVKEY))||[]; }catch(e){ return []; } }
  function favYaz(l){ try{ localStorage.setItem(FAVKEY, JSON.stringify(l.slice(0,6))); }catch(e){} }
  function favEkle(){
    const l=favOku();
    const f={ mode:settings.mode, workMin:settings.workMin, breakMin:settings.breakMin,
              visual:settings.visual, background:settings.background, tag:AkisStats.activeTag() };
    f.ad = (f.mode==='custom' ? f.workMin+' dk' : t('mode_'+f.mode)) + ' · ' + etiketAdi(f.tag);
    if(l.some(x=>x.ad===f.ad)) { toast(t('fav_saved')); return; }
    l.unshift(f); favYaz(l); refreshFavRow(); toast(t('fav_saved'));
  }
  function favUygula(f){
    settings.mode=f.mode; settings.workMin=f.workMin; settings.breakMin=f.breakMin;
    settings.visual=f.visual; settings.background=f.background;
    AkisStats.setActiveTag(f.tag);
    saveSettings();
    try{ selectMode(settings.mode); }catch(e){}
    refreshTagRow(); refreshFavRow();
    try{ applyVisualPick && applyVisualPick(); }catch(e){}
  }
  function refreshFavRow(){
    const box=$('#fav-row'); if(!box) return;
    const l=favOku();
    box.innerHTML = l.map((f,i)=>
      `<button class="tag-chip" data-fav="${i}"><span class="dot" style="background:${esc(etiketRengi(f.tag))}"></span>${esc(f.ad)}</button>`
    ).join('') + `<button class="tag-chip add" id="fav-add-btn">+ ${esc(t('fav_add'))}</button>`;
    box.querySelectorAll('[data-fav]').forEach(b=>{
      b.addEventListener('click', ()=>favUygula(l[+b.dataset.fav]));
      b.addEventListener('contextmenu', e=>{ e.preventDefault();
        const k=favOku(); k.splice(+b.dataset.fav,1); favYaz(k); refreshFavRow(); });
    });
    const a=$('#fav-add-btn'); if(a) a.addEventListener('click', favEkle);
  }

  // ---- ② GÜNLÜK CHECK-IN + GÖREVLER · ⑦ AYLIK MÜCADELE ----
  function gorevMetni(g){
    if(g.tur==='dakika')     return t('q_odak',  {n:g.hedef});
    if(g.tur==='seans')      return t('q_seans', {n:g.hedef});
    if(g.tur==='tekseans')   return t('q_uzun',  {n:g.hedef});
    if(g.tur==='sabah')      return t('q_sabah');
    if(g.tur==='aksam')      return t('q_aksam');
    return '';
  }
  /* Kart İKİ yerde duruyor: istatistik › Başarımlar ve ana ekrandaki
     "Günlük ödül" alt sayfası. Bu yüzden id yerine SINIF kullanılır — aynı id
     iki kez olsaydı düğmeler yanlış karta bağlanırdı. (1 Eyl 2026) */
  function refreshDailyCard(){
    document.querySelectorAll('.daily-card').forEach(gunlukKartKur);
    odulNoktaYenile();
  }
  function gunlukKartKur(box){
    if(!box) return;
    const ci=AkisStats.checkinDurum();
    const gv=AkisStats.gunlukGorevler();
    const ay=AkisStats.aylikMucadele();

    let h = `<div class="dc-head">
        <div><b>${esc(t('checkin'))}</b>
          <div class="dc-sub">${esc(ci.seri>0 ? t('checkin_streak',{n:ci.seri}) : t('daily_title'))}</div></div>
        <button class="dc-btn dc-checkin" ${ci.alindiMi?'disabled':''}>
          ${ci.alindiMi ? esc(t('checkin_done')) : esc(t('checkin_get'))+' +'+ci.odul}
        </button>
      </div><div class="dc-sep"></div>
      <div class="dc-sub">${esc(t('quests'))}</div>`;

    gv.forEach(g=>{
      const yuzde = Math.round(Math.min(1, g.ilerleme/g.hedef)*100);
      h += `<div class="dc-quest${g.bitti?' bitti':''}">
          <span class="qt">${esc(gorevMetni(g))}</span>
          <button class="dc-btn" data-gorev="${esc(g.id)}" ${(!g.bitti||g.alindi)?'disabled':''}>
            ${g.alindi ? '✓' : '+'+g.odul}
          </button>
        </div><div class="dc-bar"><i style="width:${yuzde}%"></i></div>`;
    });

    const ayYuzde = Math.round(Math.min(1, ay.gun/ay.hedef)*100);
    h += `<div class="dc-sep"></div>
      <div class="dc-quest${ay.bitti?' bitti':''}">
        <span class="qt"><b>${esc(t('monthly'))}</b><br>${esc(t('monthly_body',{n:ay.gun,m:ay.hedef}))}</span>
        <button class="dc-btn dc-aylik" ${(!ay.bitti||ay.alindi)?'disabled':''}>
          ${ay.alindi ? '✓' : '+'+ay.odul}
        </button>
      </div><div class="dc-bar"><i style="width:${ayYuzde}%"></i></div>`;

    box.innerHTML=h;

    const cb=box.querySelector('.dc-checkin');
    if(cb) cb.addEventListener('click', ()=>{
      const r=AkisStats.checkinAl();
      if(r.ok){ toast('+'+r.odul+' 🪙'); refreshDailyCard(); refreshCoinPill(); }
    });
    box.querySelectorAll('[data-gorev]').forEach(b=>b.addEventListener('click', ()=>{
      const r=AkisStats.gorevOdulAl(b.dataset.gorev);
      if(r.ok){ toast('+'+r.odul+' 🪙'); refreshDailyCard(); refreshCoinPill(); }
    }));
    const ab=box.querySelector('.dc-aylik');
    if(ab) ab.addEventListener('click', ()=>{
      const r=AkisStats.aylikOdulAl();
      if(r.ok){ toast('+'+r.odul+' 🪙'); refreshDailyCard(); refreshCoinPill(); }
    });
  }

  /* ---- ANA EKRANDAKİ ÖDÜL DÜĞMESİ (1 Eyl 2026 kullanıcı isteği) ----
     Şikâyet: "günlük ödül çok gizli bir yerde, kimse göremiyor." Ödül artık
     ana ekranın üstünde duruyor; alınacak bir şey varsa üstünde kırmızı nokta
     yanıyor, dokununca aynı kart alt sayfada açılıyor. */
  function odulVarMi(){
    try{
      if(!AkisStats.checkinDurum().alindiMi) return true;
      if(AkisStats.gunlukGorevler().some(g=>g.bitti && !g.alindi)) return true;
      const ay=AkisStats.aylikMucadele();
      if(ay && ay.bitti && !ay.alindi) return true;
    }catch(e){}
    return false;
  }
  function odulNoktaYenile(){
    const n=$('#odul-nokta'); if(!n) return;
    n.classList.toggle('acik', odulVarMi());
  }
  function odulAc(){
    refreshDailyCard();
    try{ if(window.AkoraAna && AkoraAna.sheetAc) AkoraAna.sheetAc('odul'); }catch(e){}
  }
  try{ window.AkoraOdul = { ac: odulAc, yenile: odulNoktaYenile, varMi: odulVarMi }; }catch(e){}

  // ---- ④ DÖNEM GRAFİKLERİ (Gün / Hafta / Ay / Yıl) ----
  let aktifDonem='hafta';
  function refreshPeriod(){
    const wc=$('#week-chart'); if(!wc) return;
    const seri=AkisStats.donemSerisi(aktifDonem, AkisI18n.current());
    const toplam=seri.reduce((a,b)=>a+b.dk,0);
    const max=Math.max(30,...seri.map(x=>x.dk));
    const saatlik = (aktifDonem==='gun');
    const n = seri.length;
    wc.classList.toggle('saatlik', saatlik);
    /* 🪤 2026-08-29: Ay (30 sütun) ve Yıl'da her sütuna etiket yazılınca
       yazılar sığmayıp grafiğin dışına taşıyordu. Sütun sayısına göre
       hem etiket sıklığı hem boşluk daraltılır. */
    wc.classList.toggle('yogun', n > 14);
    const adim = n <= 8 ? 1 : (n <= 14 ? 2 : (n <= 24 ? 3 : 5));

    if(toplam <= 0){
      wc.innerHTML = `<p class="grafik-bos">${esc(t('no_sessions'))}</p>`;
    }else{
      wc.innerHTML = seri.map((x,i)=>{
        const et = (i % adim === 0) ? x.etiket : '';
        return `<div class="week-bar" data-i="${i}"><div class="bar" style="height:${Math.round(x.dk/max*100)}%"></div><span class="day">${esc(et)}</span></div>`;
      }).join('');
    }
    const tp=$('#period-total');
    if(tp) tp.textContent = t('p_total', {n: seri.reduce((a,b)=>a+b.dk,0)});
    // Hafta görünümünde barlara dokununca gün detayı (eski davranış korunur)
    if(aktifDonem==='hafta'){
      const wk=AkisStats.last7(AkisI18n.current());
      wc.querySelectorAll('.week-bar').forEach((bar,i)=>{
        if(!wk[i]) return;
        bar.addEventListener('click', ()=>openDayDetail(wk[i].date, wk[i].day));
      });
    }
    document.querySelectorAll('#period-tabs .ptab').forEach(b=>
      b.classList.toggle('on', b.dataset.p===aktifDonem));
    // "Detay için bir güne dokun" yalnız Hafta'da anlamlı (tıklanan tek dönem o)
    const ip=document.querySelector('#view-stats .chart-hint');
    if(ip) ip.style.display = (aktifDonem==='hafta') ? '' : 'none';
  }
  function initPeriodTabs(){
    document.querySelectorAll('#period-tabs .ptab').forEach(b=>{
      b.addEventListener('click', ()=>{
        aktifDonem=b.dataset.p;
        refreshPeriod();
        refreshTagBreakdown();   // 🪤 dönem değişince etiket dağılımı da değişmeli (aynı sayılar kalıyordu)
      });
    });
  }
  function refreshTagBreakdown(){
    const box=$('#tag-breakdown'); if(!box) return;
    const gun = aktifDonem==='gun'?1 : aktifDonem==='hafta'?7 : aktifDonem==='ay'?30 : 365;
    const d=AkisStats.tagBreakdown(gun);
    if(!d.length){ box.innerHTML=`<p class="chart-hint">${esc(t('no_sessions'))}</p>`; return; }
    const top=d[0].dk||1;
    box.innerHTML=d.slice(0,7).map(x=>
      `<div class="tb-row">
         <span class="tb-name">${esc(etiketAdi(x.id))}</span>
         <span class="tb-bar"><i class="tb-fill" style="width:${Math.round(x.dk/top*100)}%;background:${esc(etiketRengi(x.id))}"></i></span>
         <span class="tb-val">${esc(t('dur_min',{n:x.dk}))}</span>
       </div>`).join('');
  }


  /* ---- ⑧⑩⑪ YENİ AYARLAR (2026-08-28) ----
     ⑧ Derin Odak artık VARSAYILAN AÇIK: rakipte ceza varsayılan açık ve motivasyonun kaynağı o.
        (Eski kullanıcının kapalı tercihi korunur — sadece hiç seçim yapmamışlara açık gelir.)
     ⑩ Günün başlangıç saati · ⑪ Aşan süreyi say */
  function initYeniAyarlar(){
    const ov=$('#set-overtime'), ovv=$('#set-overtime-v');
    function ovYaz(){ if(ovv) ovv.textContent = settings.overtime ? '✓' : '—'; }
    if(ov){
      ovYaz();
      try{ AkisTimer.setOvertime(!!settings.overtime); }catch(e){}
      ov.addEventListener('click', ()=>{
        settings.overtime=!settings.overtime; saveSettings();
        try{ AkisTimer.setOvertime(settings.overtime); }catch(e){}
        ovYaz();
      });
    }
    const ds=$('#set-daystart'), dsv=$('#set-daystart-v');
    function dsYaz(){ if(dsv) dsv.textContent = String(AkisStats.dayStart()).padStart(2,'0')+':00'; }
    if(ds){
      dsYaz();
      ds.addEventListener('click', ()=>{
        // 0,2,4,6 saat seçenekleri — gece çalışanlar için yeterli, uzun liste gerekmez
        const secenek=[0,2,3,4,5,6];
        const simdi=AkisStats.dayStart();
        const sonraki=secenek[(secenek.indexOf(simdi)+1) % secenek.length];
        AkisStats.setDayStart(sonraki); dsYaz();
        if($('#view-stats').classList.contains('active')) openStats();
      });
    }
  }


  /* ---- ⑥ SEANSTA SESSİZLİK (2026-08-28) ----
     Odak başlayınca "Rahatsız Etme" açılır, seans bitince kapanır. İzin yoksa bir kez ayar
     ekranına yönlendirilir. Native eklenti yoksa (web/iOS) sessizce atlanır. */
  function OB(){ try{ return window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.OdakBildirim; }catch(e){ return null; } }
  async function sessizAyarla(ac){
    if(!settings.dnd) return;
    const p=OB(); if(!p || !p.sessizMod) return;
    try{
      const r = await p.sessizMod({ac:!!ac});
      if(r && r.izinYok && ac){
        settings.dnd=false; saveSettings(); dndYaz();
        toast(t('set_dnd_perm'));
        try{ await p.sessizIzinIste(); }catch(e){}
      }
    }catch(e){}
  }
  function dndYaz(){ const v=$('#set-dnd-v'); if(v) v.textContent = settings.dnd ? '✓' : '—'; }
  function initSessiz(){
    const b=$('#set-dnd'); if(!b) return;
    dndYaz();
    b.addEventListener('click', async ()=>{
      settings.dnd=!settings.dnd; saveSettings(); dndYaz();
      if(settings.dnd){
        const p=OB();
        if(p && p.sessizMod){
          const r=await p.sessizMod({ac:false});      // izni yokla, açma
          if(r && r.izinYok){ toast(t('set_dnd_perm')); try{ await p.sessizIzinIste(); }catch(e){} }
        }
      }
    });
  }

  function refreshPondMini(){
    const cv=$('#pond-mini'); if(!cv) return;
    AkisGarden.update(cv, AkisStats.items());
    // Ana ekran görünmüyorken (seans/istatistik) canvas'ı YENİDEN BAĞLAMA — arkada 60fps pil yakar
    const evdeyiz = $('#view-home').classList.contains('active');
    if(!cv._mounted && evdeyiz){ AkisGarden.mount(cv, AkisStats.items()); cv._mounted=true; }
    const c=$('#pond-count'); if(c) c.textContent=t('forest_count',{n:AkisStats.itemCount()});
  }

  // ========== yardımcılar ==========
  function fmt(sec){
    sec=Math.max(0,Math.round(sec));
    const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
    const mm=String(m).padStart(2,'0'), ss=String(s).padStart(2,'0');
    return h>0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }
  function chime(down){
    // Yumuşak ama BELİRGİN 3-notalı çıngırak (zil tınılı). Odak bitti=sakinleştiren inen,
    // mola bitti=canlandıran çıkan diziliş. Sert alarm değil — geçişi bozmadan haber verir.
    try{
      const AC=window.AudioContext||window.webkitAudioContext; const c=new AC();
      const now=c.currentTime;
      const notes = down ? [880, 740, 659] : [523, 659, 784];
      notes.forEach((f,i)=>{
        const t = now + i*0.17;
        const o=c.createOscillator(), o2=c.createOscillator(), g=c.createGain();
        o.type='sine'; o2.type='sine';
        o.frequency.setValueAtTime(f, t);
        o2.frequency.setValueAtTime(f*2, t);                 // bir oktav üst partial → zil tınısı
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.32, t+0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t+0.45);
        o.connect(g); o2.connect(g); g.connect(c.destination);
        o.start(t); o2.start(t); o.stop(t+0.5); o2.stop(t+0.5);
      });
      setTimeout(()=>{ try{c.close();}catch(e){} }, 1400);
    }catch(e){}
    // Telefon titreşimi — ekrana bakmasan bile hissedersin
    try{ if(navigator.vibrate) navigator.vibrate(down ? [160,90,160] : [110,60,110,60,110]); }catch(e){}
  }
  // Native Immersive eklentisini ÇAĞIRMA yolu: native-bridge 'registerPlugin' vermiyor,
  // ama cap.nativePromise/nativeCallback var. Bunları kullan.
  function nativeImm(method){
    try{
      const c=window.Capacitor;
      if(c && typeof c.nativePromise==='function'){ c.nativePromise('Immersive', method, {}).catch(()=>{}); return true; }
      if(c && typeof c.nativeCallback==='function'){ c.nativeCallback('Immersive', method, {}); return true; }
    }catch(e){}
    return false;
  }
  let immersiveOn=false;
  function enterFullscreen(){
    immersiveOn=true;
    if(nativeImm('enter')) return;
    const el=document.documentElement;
    try{ const p=(el.requestFullscreen||el.webkitRequestFullscreen||(()=>{})).call(el); if(p&&p.catch) p.catch(()=>{}); }catch(e){}
  }
  function exitFullscreen(){
    immersiveOn=false;
    if(nativeImm('exit')) return;
    try{ if(document.fullscreenElement||document.webkitFullscreenElement){ const p=(document.exitFullscreen||document.webkitExitFullscreen||(()=>{})).call(document); if(p&&p.catch) p.catch(()=>{}); } }catch(e){}
  }
  function toggleFullscreen(){ if(immersiveOn) exitFullscreen(); else enterFullscreen(); }
  async function requestWakeLock(){
    try{ if('wakeLock' in navigator){ wakeLock=await navigator.wakeLock.request('screen'); } }catch(e){}
  }
  function releaseWakeLock(){ try{ if(wakeLock){ wakeLock.release(); wakeLock=null; } }catch(e){} }

  document.addEventListener('visibilitychange', ()=>{
    const seansta = $('#view-focus').classList.contains('active');
    if(document.hidden){
      // Arka plana geçerken bildirimi ve diske yazılan oturumu TAM O AN tazele:
      // JS birazdan donacak, çubukta kalan bilgi bu anın bilgisi olsun.
      if(seansta) syncNotifs({arkaPlan:true});
    }else{
      // Geri dönüşte wake lock'u yeniden al (tarayıcı/WebView arka planda otomatik bırakır)
      if(AkisTimer.running) requestWakeLock();
      if(seansta) syncNotifs();
    }
  });

  /* Capacitor App durum olayı — visibilitychange'in native karşılığı.
     Ana (orta) tuşla arka plana alma, bildirime dokunup geri dönme buradan gelir. */
  function initAppState(){
    const cap=window.Capacitor;
    const App = cap && cap.Plugins && cap.Plugins.App;
    if(!App || !App.addListener) return;
    App.addListener('appStateChange', (st)=>{
      const seansta = $('#view-focus').classList.contains('active');
      if(!seansta) return;
      if(st && st.isActive){ requestWakeLock(); syncNotifs(); }
      else { syncNotifs({arkaPlan:true}); }
    });
  }

  /* Açılışta yarım kalmış seansı geri yükle (uygulama arka planda öldürüldüyse).
     Sayaç duvar saatine göre ilerletilir; geri sayımda hedefi AŞAMAZ. */
  function oturumGeriYukle(){
    let d=null;
    try{ d=JSON.parse(localStorage.getItem(OKEY)||'null'); }catch(e){}
    geriYuklemeDenendi=true;                       // bundan sonra kayda yazmak/silmek serbest
    if(!d || !d.cfg || !d.ts) return false;
    /* İKİNCİ KAPI (30 Ağu): kaydı yazan sürüm bu sürüm değilse geri yüklenmez.
       Yukarıdaki temizlik bir sebeple çalışmazsa bile kurulum sonrası açılış TEMİZ kalır. */
    if(d.v !== APP_SURUM){ oturumSil(); return false; }
    const gecenSn=(Date.now()-d.ts)/1000;
    if(gecenSn<0 || gecenSn*1000>OTURUM_TAZE_MS){ oturumSil(); return false; }

    /* 🪤 2026-08-29 KULLANICI HATASI: "uygulamayı açar açmaz geri sayım başlıyor".
       Zinciri şöyleydi:
         1) 30 dk'lık seans başlatılıp uygulamadan çıkılmış.
         2) Saatler sonra açılışta geri yükleme elapsed'i hedefe KIRPIP odak
            ekranını açıyor → seans bitmiş olduğu hâlde ekranda duruyor.
         3) Odak ekranı açık olduğu için oturumKaydet() kaydı TAZE ts ile
            yeniden yazıyor (running:false, elapsed==target).
         4) Sonraki açılışta kayıt "taze" göründüğü için 2. adım tekrarlıyor.
            → Kayıt kendi kendini besleyen bir döngüye giriyor, HİÇ silinmiyor.

       Kural: BİTMİŞ seans geri yüklenmez — duraklamış olsa bile.
       (Yalnız `d.running` bakmak yetmiyordu; 3. adımdaki kayıt duraklamış.) */
    const BOS_SINIR = 2*3600;                     // ucu açık/aşan seansta uzak kalma sınırı
    const acikUclu  = !!(d.countUp || d.overtime);
    if(acikUclu){
      if(d.running && gecenSn > BOS_SINIR){ oturumSil(); return false; }
    }else{
      const varilan = d.elapsed + (d.running ? gecenSn : 0);
      if(!(d.targetSec > 0) || varilan >= d.targetSec){ oturumSil(); return false; }
    }

    if(d.running){
      d.elapsed = d.countUp ? (d.elapsed + gecenSn)
                            : Math.min(d.targetSec, d.elapsed + gecenSn);
    }
    if(!AkisTimer.geriYukle(d)) return false;

    task = d.task || '';
    committedWork = !!d.committedWork;
    paleFlag = !!d.paleFlag;

    $('#focus-task').textContent = task || '';
    AkisVisual.setType(settings.visual);
    AkisVisual.setPhase(AkisTimer.phase==='work' ? 'work' : 'break');
    show('view-focus');
    enterFullscreen();          // normal seansla aynı görünsün (native'de çalışır, web'de sessizce geçer)
    applyBackground(settings.background);
    requestAnimationFrame(()=>{ AkisVisual.resize(); AkisVisual.start(); });
    pushState();
    showChrome();

    /* Ses, tarayıcı/WebView kuralı gereği dokunmadan başlayamaz — karışım kurulur,
       ilk dokunuşta açılır. */
    try{
      AkisAudio.applyMix(settings.mix);
      AkisAudio.setMusicVolume(settings.musicVol/100);
      if(settings.music && settings.music!=='off') AkisAudio.setMusic(settings.music);
      document.addEventListener('pointerdown', ()=>{
        try{ AkisAudio.resumeAll(); AkisAudio.resumeMusic(); }catch(e){}
      }, {once:true});
    }catch(e){}

    if(d.running){ AkisTimer.start(); setPlayIcon(true); requestWakeLock(); }
    else { setPlayIcon(false); }
    syncNotifs();
    return true;
  }

  // ========== DİL SEÇİCİ ==========
  function initLang(){
    $('#btn-lang').addEventListener('click', ()=>{ renderLangList(); $('#lang-panel').classList.add('open'); syncBackdrop(); });
    $('#lang-close').addEventListener('click', ()=>{ $('#lang-panel').classList.remove('open'); syncBackdrop(); });
  }
  function renderLangList(){
    const cur=AkisI18n.current();
    const box=$('#lang-list');
    box.innerHTML = AkisI18n.langs().map(l=>
      `<button class="lang-item${l.code===cur?' active':''}" data-lang="${l.code}">
         <span>${l.name}</span>
         <svg class="tick" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
       </button>`
    ).join('');
    box.querySelectorAll('.lang-item').forEach(b=>{
      b.addEventListener('click', ()=>{ AkisI18n.setLang(b.dataset.lang); $('#lang-panel').classList.remove('open'); syncBackdrop(); });
    });
  }
  function onLangChange(){
    refreshPondMini();
    refreshBreakChips();
    refreshTagRow(); refreshFavRow();
    buildMixer();
    pushState();
    if($('#view-stats').classList.contains('active')) openStats();
  }

  // ========== MINI TOAST ==========
  let _toastEl=null, _toastTO=null;
  function toast(msg){
    if(!_toastEl){ _toastEl=document.createElement('div'); _toastEl.className='mini-toast'; document.body.appendChild(_toastEl); }
    _toastEl.textContent=msg; _toastEl.classList.add('show');
    clearTimeout(_toastTO); _toastTO=setTimeout(()=>_toastEl.classList.remove('show'), 1700);
  }

  // ========== DONANIM GERİ TUŞU (Android) ==========
  function initBackButton(){
    const cap=window.Capacitor;
    const App = cap && cap.Plugins && cap.Plugins.App;
    if(!App || !App.addListener) return;   // web'de / eklenti yoksa sessizce atla
    let exitArmed=false, exitTO=null;
    App.addListener('backButton', ()=>{
      // 1) Açık modal / panel / alt-sayfa varsa ÖNCE onu kapat
      if($('#modal').classList.contains('open')){ closeModal(); return; }
      if(!$('#break-sheet').classList.contains('hidden')){ closeBreakSheet(); return; }
      if($('#lang-panel').classList.contains('open')){ $('#lang-panel').classList.remove('open'); syncBackdrop(); return; }
      // 1b) Yeni kabuk: menü çekmecesi / alt sayfa açıksa önce onu kapat (2026-08-28)
      if(document.querySelector('.ak-menu.open, .ak-sheet.open')){
        try{ window.AkoraAna && AkoraAna.hepsiKapat(); }catch(e){}
        return;
      }
      if($('#sound-panel').classList.contains('open')){ toggleDrawer(false); return; }
      if(!$('#flow-prompt').classList.contains('hidden')){ hideFlow(); return; }
      // 2) Alt ekranlar -> ana sayfaya don. Canvas donguleri show()'daki EKRAN_KAPANIS
      //    tablosunda kapanir; burada ayrica unmount cagirmak GEREKMEZ (ve unutulamaz).
      if($('#view-stats').classList.contains('active')){ show('view-home'); return; }
      if($('#view-takvim') && $('#view-takvim').classList.contains('active')){ show('view-home'); return; }
      if($('#view-kitaplik') && $('#view-kitaplik').classList.contains('active')){ show('view-home'); return; }
      if($('#view-plot').classList.contains('active')){ show('view-home'); return; }
      // 3) Odak ekranı → çıkış onayı (X ile aynı; çalışılan süre kaydedilir)
      if($('#view-focus').classList.contains('active')){ requestExit(); return; }
      // 4) Ana sayfadayız → çıkmak için iki kez geri
      if(exitArmed){ clearTimeout(exitTO); try{ App.exitApp(); }catch(e){} return; }
      exitArmed=true;
      toast(t('exit_hint'));
      exitTO=setTimeout(()=>{ exitArmed=false; }, 2000);
    });
  }

  // ========== başlat ==========
  function init(){
    AkisVisual.init($('#visual-canvas'));
    initHome(); initFocus(); initSound(); initStats(); initLang(); initModal(); initBackButton(); initFocusGestures(); initPremium(); initSupport(); initPlot(); initAppState(); initPeriodTabs(); initYeniAyarlar(); initSessiz();
    AkisI18n.apply();
    AkisI18n.onChange(onLangChange);
    refreshBreakChips();
    refreshTagRow(); refreshFavRow();   // ③ etiket · ⑤ favoriler
    if(window.AkisNotify) AkisNotify.init();
    if(window.AkisAds){ AkisAds.init(window.AkisPremium ? AkisPremium.isPremium() : false); refreshPremiumUI(); setTimeout(()=>{ refreshPremiumUI(); }, 3000);
      /* ☁️ AÇILIŞ KAPISI — bulut ayarında VARSAYILAN KAPALI. ⚠️ AdMob politikası uygulama
         açılışında interstitial'ı yasaklıyor; açmak kullanıcının kararı ve riskidir. */
      setTimeout(()=>{ try{ if(AkisAds.onAppOpen) AkisAds.onAppOpen(); }catch(e){} }, 2500); }  // CTA tazele. AÇILIŞ REKLAMI KALDIRILDI (2026-08-08): AdMob "app load" interstitial'ını YASAKLIYOR (yasak yerleşimler); açılış için ayrı App Open formatı gerekir, eklentide yok (issue #167).
    window.addEventListener('orientationchange', ()=>{ setTimeout(()=>AkisVisual.resize(), 250); });
    // Yarım kalmış seans varsa doğrudan odak ekranıyla aç (bildirime dokununca da buraya düşer)
    const devam = oturumGeriYukle();
    if(!devam && tourNeeded()) setTimeout(()=>startTour(), 700);   // ilk açılış tanıtımı
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
