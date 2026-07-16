/* ===== app.js — ana bağlama, ekran geçişi, ayarlar ===== */
(() => {
  const $ = s => document.querySelector(s);
  const SKEY='akis.settings.v1';

  // ---- ayarlar (kalıcı) ----
  const settings = Object.assign({
    mode:'pomodoro', workMin:30, breakMin:5, visual:'hourglass',
    ambient:'off', ambientVol:50, music:'off', musicVol:40
  }, load());
  function load(){ try{ return JSON.parse(localStorage.getItem(SKEY))||{}; }catch(e){ return {}; } }
  function saveSettings(){ try{ localStorage.setItem(SKEY, JSON.stringify(settings)); }catch(e){} }

  let task='';
  let lastSec=-1;
  let wakeLock=null;

  // ---- ekran geçişi ----
  function show(id){
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    $('#'+id).classList.add('active');
  }

  // ========== HOME ==========
  function initHome(){
    // mod seçimi
    document.querySelectorAll('#mode-grid .mode-card').forEach(card=>{
      if(card.dataset.mode===settings.mode) selectMode(card.dataset.mode);
      card.addEventListener('click', ()=>selectMode(card.dataset.mode));
    });
    // custom steppers
    $('#work-min').textContent=settings.workMin;
    $('#break-min').textContent=settings.breakMin;
    document.querySelectorAll('.step-btn').forEach(b=>{
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
    // görsel chip
    document.querySelectorAll('#visual-picker .chip').forEach(ch=>{
      if(ch.dataset.visual===settings.visual) ch.classList.add('active');
      ch.addEventListener('click', ()=>{
        document.querySelectorAll('#visual-picker .chip').forEach(x=>x.classList.remove('active'));
        ch.classList.add('active'); settings.visual=ch.dataset.visual; saveSettings();
      });
    });
    $('#task-input').addEventListener('input', e=> task=e.target.value.trim());
    $('#btn-start').addEventListener('click', startSession);
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
    AkisTimer.configure(buildCfg());
    $('#focus-task').textContent = task || '';
    AkisVisual.setType(settings.visual);
    AkisVisual.setPhase('work');
    show('view-focus');
    requestAnimationFrame(()=>{ AkisVisual.resize(); AkisVisual.start(); });
    applyAmbient(settings.ambient);
    AkisAudio.setMusicVolume(settings.musicVol/100);
    if(settings.music && settings.music!=='off') AkisAudio.setMusic(settings.music);
    lastSec=-1;
    AkisTimer.start();
    setPlayIcon(true);
    requestWakeLock();
  }

  // ========== FOCUS ==========
  function initFocus(){
    $('#btn-back').addEventListener('click', endSession);
    $('#btn-playpause').addEventListener('click', ()=>{
      AkisTimer.toggle();
      const running=AkisTimer.running; setPlayIcon(running);
      if(running){ AkisAudio.resume(); AkisAudio.resumeMusic(); requestWakeLock(); }
      else { AkisAudio.suspend(); AkisAudio.pauseMusic(); releaseWakeLock(); }
    });
    $('#btn-skip').addEventListener('click', ()=>{
      hideFlow();
      if(AkisTimer.phase==='work'){ commitWork(); AkisTimer.goNext(true); }
      else { AkisTimer.goNext(true); }
      applyPhaseVisual();
      setPlayIcon(true);
    });
    $('#btn-fullscreen').addEventListener('click', toggleFullscreen);
    $('#btn-sound').addEventListener('click', ()=>toggleDrawer(true));
    $('#btn-extend').addEventListener('click', ()=>{ hideFlow(); AkisTimer.extend(5*60); setPlayIcon(true); });
    $('#btn-tobreak').addEventListener('click', ()=>{ hideFlow(); commitWork(); AkisTimer.goNext(true); applyPhaseVisual(); setPlayIcon(true); });

    AkisTimer.on('tick', onTick);
    AkisTimer.on('phaseEnd', onPhaseEnd);
    AkisTimer.on('phaseStart', ()=>{ pushState(); });
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
  }
  function onTick(s){
    pushState(s);
    // tik-tak sesi: her yeni saniyede bir
    const sec=Math.floor(s.elapsed);
    if(sec!==lastSec){ lastSec=sec; if(s.running && AkisAudio.current==='tick') AkisAudio.playTickOnce(); }
  }

  function onPhaseEnd(phase){
    chime(phase==='work');
    if(phase==='work'){
      // sabit modda süre doldu → akış sorusu (flow prompt)
      showFlow();
    }else{
      // mola bitti → otomatik çalışmaya geç
      AkisTimer.goNext(true); applyPhaseVisual(); setPlayIcon(true);
    }
  }

  function commitWork(){
    const s=AkisTimer.snapshot();
    const mins=s.elapsed/60;
    if(mins>=1){
      const item=AkisStats.recordFocus(mins);
      if(item) showReward(item);
      refreshPondMini();
    }
  }

  function endSession(){
    AkisTimer.pause();
    AkisVisual.stop();
    AkisAudio.stopAll();
    releaseWakeLock();
    hideFlow(); toggleDrawer(false);
    refreshPondMini();
    show('view-home');
  }

  function applyPhaseVisual(){ pushState(); }

  function setPlayIcon(running){
    $('#ic-pause').classList.toggle('hidden', !running);
    $('#ic-play').classList.toggle('hidden', running);
  }
  function showFlow(){ $('#flow-prompt').classList.remove('hidden'); }
  function hideFlow(){ $('#flow-prompt').classList.add('hidden'); }

  // ========== SES PANELİ ==========
  function initSound(){
    $('#sound-close').addEventListener('click', ()=>toggleDrawer(false));
    document.querySelectorAll('#ambient-chips .chip').forEach(ch=>{
      if(ch.dataset.ambient===settings.ambient) ch.classList.add('active');
      ch.addEventListener('click', ()=>{
        document.querySelectorAll('#ambient-chips .chip').forEach(x=>x.classList.remove('active'));
        ch.classList.add('active'); settings.ambient=ch.dataset.ambient; saveSettings();
        applyAmbient(settings.ambient);
      });
    });
    const av=$('#ambient-vol'); av.value=settings.ambientVol;
    av.addEventListener('input', ()=>{ settings.ambientVol=+av.value; saveSettings(); AkisAudio.setVolume(av.value/100); });

    // müzik kanalı (bağımsız)
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
  }
  function applyAmbient(kind){
    AkisAudio.setVolume(settings.ambientVol/100);
    AkisAudio.setAmbient(kind);
    // aktif çip senkronu
    document.querySelectorAll('#ambient-chips .chip').forEach(x=>x.classList.toggle('active', x.dataset.ambient===kind));
  }
  function toggleDrawer(open){ $('#sound-panel').classList.toggle('open', open); }

  // ========== ÖDÜL BALONU ==========
  let rewardTO=null;
  function showReward(item){
    const box=$('#reward-toast'); if(!box) return;
    $('#reward-emoji').textContent=item.firefly?'✨':item.emoji;
    $('#reward-title').textContent=t('reward_added',{label:t('item_'+item.type)});
    $('#reward-sub').textContent=item.firefly?t('reward_night'):t('reward_done');
    box.classList.add('show');
    clearTimeout(rewardTO); rewardTO=setTimeout(()=>box.classList.remove('show'), 2600);
  }

  // ========== İSTATİSTİK + GÖLET ==========
  function initStats(){
    $('#stats-back').addEventListener('click', ()=>{ AkisGarden.unmount($('#pond-full')); show('view-home'); refreshPondMini(); });
    $('#btn-reset-stats').addEventListener('click', ()=>{
      if(confirm(t('reset_confirm'))){ AkisStats.reset(); openStats(); refreshPondMini(); }
    });
  }
  function openStats(){
    $('#st-today').textContent = AkisStats.todayMinutes();
    $('#st-streak').textContent = AkisStats.streak();
    $('#st-total').textContent = AkisStats.totalHours().toFixed(1);
    const ph=$('#pond-stats-h'); if(ph) ph.textContent='🌊 '+t('pond_stats_title',{n:AkisStats.itemCount()});
    // haftalık grafik (gün adları yerel)
    const wk=AkisStats.last7(AkisI18n.current()); const max=Math.max(30,...wk.map(d=>d.minutes));
    $('#week-chart').innerHTML = wk.map(d=>
      `<div class="week-bar"><div class="bar" style="height:${Math.round(d.minutes/max*100)}%"></div><span class="day">${d.day}</span></div>`
    ).join('');
    show('view-stats');
    requestAnimationFrame(()=>AkisGarden.mount($('#pond-full'), AkisStats.items()));
  }
  function refreshPondMini(){
    const cv=$('#pond-mini'); if(!cv) return;
    AkisGarden.update(cv, AkisStats.items());
    if(!cv._mounted){ AkisGarden.mount(cv, AkisStats.items()); cv._mounted=true; }
    const c=$('#pond-count'); if(c) c.textContent=t('pond_count',{n:AkisStats.itemCount()});
  }

  // ========== yardımcılar ==========
  function fmt(sec){
    sec=Math.max(0,Math.round(sec));
    const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
    const mm=String(m).padStart(2,'0'), ss=String(s).padStart(2,'0');
    return h>0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }
  function chime(down){
    try{
      const AC=window.AudioContext||window.webkitAudioContext; const c=new AC();
      const o=c.createOscillator(), g=c.createGain();
      o.type='sine'; o.frequency.setValueAtTime(down?660:520, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(down?880:392, c.currentTime+0.18);
      g.gain.setValueAtTime(0.0001,c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25,c.currentTime+0.03);
      g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+0.5);
      o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime+0.55);
      setTimeout(()=>c.close(), 800);
    }catch(e){}
  }
  function toggleFullscreen(){
    const el=document.documentElement;
    if(!document.fullscreenElement){ (el.requestFullscreen||el.webkitRequestFullscreen||(()=>{})).call(el); }
    else{ (document.exitFullscreen||document.webkitExitFullscreen||(()=>{})).call(document); }
  }
  async function requestWakeLock(){
    try{ if('wakeLock' in navigator){ wakeLock=await navigator.wakeLock.request('screen'); } }catch(e){}
  }
  function releaseWakeLock(){ try{ if(wakeLock){ wakeLock.release(); wakeLock=null; } }catch(e){} }

  // dikkat engelleme (web): sekme değişince nazik uyarı + sesi kıs
  document.addEventListener('visibilitychange', ()=>{
    if(document.hidden && AkisTimer.running && AkisTimer.phase==='work'){
      // odak sırasında sekmeden çıkıldı — sadece işaretliyoruz (mobilde katı mod eklenecek)
    }
  });

  // ========== DİL SEÇİCİ ==========
  function initLang(){
    $('#btn-lang').addEventListener('click', ()=>{ renderLangList(); $('#lang-panel').classList.add('open'); });
    $('#lang-close').addEventListener('click', ()=>$('#lang-panel').classList.remove('open'));
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
      b.addEventListener('click', ()=>{ AkisI18n.setLang(b.dataset.lang); $('#lang-panel').classList.remove('open'); });
    });
  }
  function onLangChange(){
    refreshPondMini();
    pushState();
    if($('#view-stats').classList.contains('active')) openStats();
  }

  // ========== başlat ==========
  function init(){
    AkisVisual.init($('#visual-canvas'));
    initHome(); initFocus(); initSound(); initStats(); initLang();
    AkisI18n.apply();
    AkisI18n.onChange(onLangChange);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
