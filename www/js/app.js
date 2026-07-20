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
    committedWork=false;
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
    $('#btn-back').addEventListener('click', requestExit);
    $('#btn-playpause').addEventListener('click', ()=>{
      AkisTimer.toggle();
      const running=AkisTimer.running; setPlayIcon(running);
      if(running){ AkisAudio.resume(); AkisAudio.resumeMusic(); requestWakeLock(); }
      else { AkisAudio.suspend(); AkisAudio.pauseMusic(); releaseWakeLock(); }
    });
    $('#btn-fullscreen').addEventListener('click', toggleFullscreen);
    $('#btn-sound').addEventListener('click', ()=>toggleDrawer(true));
    $('#btn-extend').addEventListener('click', ()=>{ hideFlow(); AkisTimer.extend(5*60); setPlayIcon(true); });
    $('#btn-tobreak').addEventListener('click', ()=>{ hideFlow(); commitWork(); AkisTimer.goNext(true); applyPhaseVisual(); setPlayIcon(true); });

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
    AkisTimer.on('phaseStart', (phase)=>{ if(phase==='work') committedWork=false; pushState(); });
  }

  function refreshBreakChips(){
    document.querySelectorAll('#bs-chips .chip[data-min]').forEach(ch=>{
      ch.textContent=t('dur_min',{n:+ch.dataset.min});
    });
    $('#bs-min-lbl').textContent=t('dur_min',{n:customBreakMin});
  }
  function openBreakSheet(){ refreshBreakChips(); $('#bs-custom-row').classList.add('hidden'); $('#break-sheet').classList.remove('hidden'); }
  function closeBreakSheet(){ $('#break-sheet').classList.add('hidden'); }
  function pickBreak(min){
    closeBreakSheet();
    if(AkisTimer.phase==='work'){ commitWork(); }
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
  }
  function onTick(s){
    pushState(s);
    const sec=Math.floor(s.elapsed);
    if(sec!==lastSec){ lastSec=sec; if(s.running && AkisAudio.current==='tick') AkisAudio.playTickOnce(); }
  }

  function onPhaseEnd(phase){
    chime(phase==='work');
    if(phase==='work'){
      showFlow();
    }else{
      AkisTimer.goNext(true); applyPhaseVisual(); setPlayIcon(true);
    }
  }

  function commitWork(){
    if(committedWork) return;
    const s=AkisTimer.snapshot();
    const mins=s.elapsed/60;
    if(mins>=1){
      committedWork=true;
      const item=AkisStats.recordFocus(mins, task);
      if(item) showReward(item);
      refreshPondMini();
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
  function doExit(){
    if(AkisTimer.phase==='work' && !committedWork) commitWork();
    AkisTimer.pause();
    AkisVisual.stop();
    AkisAudio.stopAll();
    releaseWakeLock();
    hideFlow(); closeBreakSheet(); toggleDrawer(false);
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
  function applyAmbient(kind){
    AkisAudio.setVolume(settings.ambientVol/100);
    AkisAudio.setAmbient(kind);
    document.querySelectorAll('#ambient-chips .chip').forEach(x=>x.classList.toggle('active', x.dataset.ambient===kind));
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
    $('#reward-emoji').textContent=item.firefly?'✨':item.emoji;
    $('#reward-title').textContent=t('reward_added',{label:t('item_'+item.type)});
    $('#reward-sub').textContent=item.firefly?t('reward_night'):t('reward_done');
    box.classList.add('show');
    clearTimeout(rewardTO); rewardTO=setTimeout(()=>box.classList.remove('show'), 2600);
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
    $('#st-today').textContent = AkisStats.todayMinutes();
    $('#st-streak').textContent = AkisStats.streak();
    $('#st-total').textContent = AkisStats.totalHours().toFixed(1);
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
    if(!cv._mounted){ AkisGarden.mount(cv, AkisStats.items()); cv._mounted=true; }
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

  document.addEventListener('visibilitychange', ()=>{
    if(document.hidden && AkisTimer.running && AkisTimer.phase==='work'){ /* mobilde katı mod eklenecek */ }
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
    pushState();
    if($('#view-stats').classList.contains('active')) openStats();
  }

  // ========== başlat ==========
  function init(){
    AkisVisual.init($('#visual-canvas'));
    initHome(); initFocus(); initSound(); initStats(); initLang(); initModal();
    AkisI18n.apply();
    AkisI18n.onChange(onLangChange);
    refreshBreakChips();
    if(window.AkisNotify) AkisNotify.init();
    window.addEventListener('orientationchange', ()=>{ setTimeout(()=>AkisVisual.resize(), 250); });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
