/* ===== app.js — ana bağlama, ekran geçişi, ayarlar ===== */
(() => {
  const $ = s => document.querySelector(s);
  const SKEY='akis.settings.v1';

  // ---- ayarlar (kalıcı) ----
  const settings = Object.assign({
    mode:'pomodoro', workMin:30, breakMin:5, visual:'hourglass',
    background:'none', mix:{}, music:'classic', musicVol:40,   // 2026-08-26 kullanıcı kararı: açılış sesi ambiyans değil KLASİK (Satie), orta ses. Ambiyans (yağmur vb.) varsayılan KAPALI.
    deepFocus:false          // "Derin Odak": uygulamadan 30sn+ ayrılırsan ağaç soluk dikilir (opsiyonel)
  }, load());

  // Seans-sonu + kalıcı bildirimleri zamanlayıcı durumuna eşitle (native'de)
  function syncNotifs(){ try{ if(window.AkisNotify && AkisNotify.syncSession) AkisNotify.syncSession(AkisTimer.snapshot()); }catch(e){} }

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

  // ---- ekran geçişi ----
  function show(id){
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    $('#'+id).classList.add('active');
  }

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
    $('#btn-start').addEventListener('click', ()=>{
      // REKLAM YOK (kullanıcı kararı 2026-08-08): odaklanma anı kutsal. Reklam yerleşimi:
      // çalışma bitip MOLAYA girerken + moladan DERSE dönerken (doğal geçiş noktaları).
      startSession();
    });
    $('#btn-stats').addEventListener('click', openStats);
    refreshPondMini();
  }
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
    // Ana ekrandaki orman canvas'ı seans boyunca arkada 60fps çizmesin (pil) — çıkışta refreshPondMini yeniden bağlar
    try{ const cv=$('#pond-mini'); if(cv && cv._mounted){ AkisGarden.unmount(cv); cv._mounted=false; } }catch(e){}
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
      syncNotifs();   // faz değişti → seans-sonu bildirimi + kalıcı bildirim tazele
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
      const item=AkisStats.recordFocus(mins, task, paleFlag);
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
    maybeAskRating();          // birkaç seans biriktiyse bir kez puan sor (ana ekrana döndükten sonra)
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

  const VIS_CYCLE=['hourglass','ring','clock','digits'];
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
    AkisAudio.keys.forEach(key=>{
      const row=document.createElement('div'); row.className='mix-row';
      const v0=Math.round((+settings.mix[key]||0)*100);
      if(v0>0) row.classList.add('on');
      const lbl=document.createElement('span'); lbl.className='mix-lbl'; lbl.textContent=t('amb_'+key);
      const sl=document.createElement('input'); sl.type='range'; sl.min='0'; sl.max='100'; sl.value=v0;
      sl.addEventListener('input', ()=>{
        const v=+sl.value/100; settings.mix[key]=v; saveSettings();
        AkisAudio.setTrackVolume(key, v);
        row.classList.toggle('on', +sl.value>0);
      });
      row.appendChild(lbl); row.appendChild(sl); box.appendChild(row);
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
  const TOUR_KEY='akis.tour.v1';
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
      if(Share && Share.share){ await Share.share({title:'Akış', text:t('share_text'), url:storeUrl()}); return; }
    }catch(e){ return; }                                  // kullanıcı vazgeçti → sessiz
    try{ if(navigator.share){ await navigator.share({title:'Akış', text:t('share_text'), url:storeUrl()}); return; } }catch(e){ return; }
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
    {emoji:MASKOT_GOVDE('<g transform="translate(60,10)"><circle cx="14" cy="14" r="13" fill="#10151c" stroke="#f4cd76" stroke-width="2.5"/><path d="M14 7v7l5 3" stroke="#f4cd76" stroke-width="2.5" stroke-linecap="round"/></g>'), t:'tour_t2', b:'tour_b2'},
    {emoji:MASKOT_GOVDE('<g transform="translate(58,8)" stroke="#f4cd76" stroke-width="2.5" fill="none" stroke-linecap="round"><path d="M4 18v-4a12 12 0 0 1 24 0v4"/><rect x="1" y="16" width="8" height="11" rx="3" fill="#f4cd76" stroke="none"/><rect x="23" y="16" width="8" height="11" rx="3" fill="#f4cd76" stroke="none"/></g>'), t:'tour_t3', b:'tour_b3'},
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

  // Birkaç seans sonra bir kez "puan verir misin?" — "hayır" derse bir daha sorulmaz.
  function maybeAskRating(){
    if(!isNative()) return;
    try{ if(localStorage.getItem(RATE_KEY)==='1') return; }catch(e){ return; }
    if(AkisStats.itemCount() < RATE_AFTER) return;
    setTimeout(()=>{
      openModal({
        title: t('rate_ask_title'),
        bodyHTML: `<p>${esc(t('rate_ask_body'))}</p>`,
        actions: [
          {label:t('rate_no'), cls:'ghost', fn:()=>{ try{ localStorage.setItem(RATE_KEY,'1'); }catch(e){} }},
          {label:t('rate_yes'), cls:'primary', fn:openStore}
        ]
      });
    }, 1200);
  }

  function initSupport(){
    const bt=$('#btn-tour');  if(bt) bt.addEventListener('click', ()=>startTour(true));
    const br=$('#btn-rate');  if(br) br.addEventListener('click', openStore);
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
  function openDayDetail(dateStr, dayLabel){
    const list=AkisStats.sessionsForDate(dateStr);
    const mins=AkisStats.dayMinutes(dateStr);
    const summary=`<div class="day-summary">${esc(t('dur_min',{n:mins}))} · ${esc(t('sessions_count',{n:list.length}))}</div>`;
    openModal({ title:dayLabel, bodyHTML: summary + sessionListHTML(list) });
  }

  // ========== İSTATİSTİK + ORMAN ==========
  function initStats(){
    $('#stats-back').addEventListener('click', ()=>{ AkisGarden.unmount($('#pond-full')); show('view-home'); refreshPondMini(); });
    $('#btn-today-sessions').addEventListener('click', openTodaySessions);

    // ---- VERİ YEDEĞİ: dışa aktar (paylaş/panoya) + geri yükle (yapıştır) ----
    const be=$('#btn-backup'), bi=$('#btn-restore');
    if(be) be.addEventListener('click', async ()=>{
      const veri=AkisStats.exportData();
      try{
        const Share = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Share;
        if(isNative() && Share && Share.share){ await Share.share({ title:'Akis backup', text:veri }); return; }
      }catch(e){ return; }   // paylaşımdan vazgeçti → sessiz
      try{ await navigator.clipboard.writeText(veri); toast(t('backup_copied')); }catch(e){}
    });
    if(bi) bi.addEventListener('click', ()=>{
      openModal({
        title:t('backup_import'),
        bodyHTML:`<textarea id="restore-ta" class="restore-ta" rows="6" placeholder="${esc(t('backup_paste_ph'))}"></textarea>`,
        actions:[
          {label:t('cancel'), cls:'ghost'},
          {label:t('backup_import'), cls:'primary', fn:()=>{
            const v=($('#restore-ta')||{}).value||'';
            if(AkisStats.importData(v)){ toast(t('restore_done')); openStats(); refreshPondMini(); }
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
    // Ana ekran mini-ormanı istatistik açıkken arkada çizmesin (stats-back'teki refreshPondMini geri bağlar)
    try{ const cv=$('#pond-mini'); if(cv && cv._mounted){ AkisGarden.unmount(cv); cv._mounted=false; } }catch(e){}
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
    // haftalık grafik (gün adları yerel) — barlar tıklanabilir
    const wk=AkisStats.last7(AkisI18n.current()); const max=Math.max(30,...wk.map(d=>d.minutes));
    $('#week-chart').innerHTML = wk.map(d=>
      `<div class="week-bar" data-date="${d.date}" data-day="${esc(d.day)}"><div class="bar" style="height:${Math.round(d.minutes/max*100)}%"></div><span class="day">${esc(d.day)}</span></div>`
    ).join('');
    document.querySelectorAll('#week-chart .week-bar').forEach(bar=>{
      bar.addEventListener('click', ()=>openDayDetail(bar.dataset.date, bar.dataset.day));
    });
    show('view-stats');
    requestAnimationFrame(()=>AkisGarden.mount($('#pond-full'), AkisStats.items()));
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
    if(document.hidden && AkisTimer.running && AkisTimer.phase==='work'){ /* mobilde katı mod eklenecek */ }
    // Geri dönüşte wake lock'u yeniden al (tarayıcı/WebView arka planda otomatik bırakır)
    if(!document.hidden && AkisTimer.running){ requestWakeLock(); }
  });

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
      if($('#sound-panel').classList.contains('open')){ toggleDrawer(false); return; }
      if(!$('#flow-prompt').classList.contains('hidden')){ hideFlow(); return; }
      // 2) İstatistik ekranı → ana sayfaya dön
      if($('#view-stats').classList.contains('active')){ AkisGarden.unmount($('#pond-full')); show('view-home'); refreshPondMini(); return; }
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
    initHome(); initFocus(); initSound(); initStats(); initLang(); initModal(); initBackButton(); initFocusGestures(); initPremium(); initSupport();
    AkisI18n.apply();
    AkisI18n.onChange(onLangChange);
    refreshBreakChips();
    if(window.AkisNotify) AkisNotify.init();
    if(window.AkisAds){ AkisAds.init(window.AkisPremium ? AkisPremium.isPremium() : false); refreshPremiumUI(); setTimeout(()=>{ refreshPremiumUI(); }, 3000); }  // CTA tazele. AÇILIŞ REKLAMI KALDIRILDI (2026-08-08): AdMob "app load" interstitial'ını YASAKLIYOR (yasak yerleşimler); açılış için ayrı App Open formatı gerekir, eklentide yok (issue #167).
    window.addEventListener('orientationchange', ()=>{ setTimeout(()=>AkisVisual.resize(), 250); });
    if(tourNeeded()) setTimeout(()=>startTour(), 700);   // ilk açılış tanıtımı
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
