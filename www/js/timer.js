/* ===== timer.js — esnek zaman motoru =====
   Modlar: pomodoro / fiftytwo / flowtime / custom.
   Sayım zaman damgası (Date.now) tabanlı — arka planda sapmayı azaltır.
   Olaylar: 'tick'(snap) her 200ms · 'phaseEnd'(phase,snap) geri sayım bitince (durur). */
const AkisTimer = (() => {
  let cfg = defaultCfg('pomodoro');
  let phase='work';            // 'work' | 'break' | 'long'
  let running=false;
  let countUp=false;
  let targetSec=0;
  let elapsed=0;               // saniye (kesirli)
  let lastTs=0;
  let completedWork=0;
  let dynBreakSec=300;         // flowtime için hesaplanan mola
  let handle=null;
  const cb={tick:[],phaseEnd:[],phaseStart:[]};

  function defaultCfg(mode){
    switch(mode){
      case 'fiftytwo': return {mode,workSec:52*60,breakSec:17*60,longBreakSec:0,longEvery:0,countUp:false};
      case 'flowtime': return {mode,workSec:0,breakSec:0,longBreakSec:0,longEvery:0,countUp:true};
      case 'custom':   return {mode,workSec:30*60,breakSec:5*60,longBreakSec:15*60,longEvery:4,countUp:false};
      default:         return {mode:'pomodoro',workSec:25*60,breakSec:5*60,longBreakSec:15*60,longEvery:4,countUp:false};
    }
  }
  function on(ev,fn){ if(cb[ev]) cb[ev].push(fn); return AkisTimer; }
  function emit(ev,...a){ (cb[ev]||[]).forEach(f=>f(...a)); }

  function configure(c){ cfg=Object.assign(defaultCfg(c.mode||'pomodoro'), c); reset(); }
  function reset(){ stopLoop(); completedWork=0; setupPhase('work'); }

  function setupPhase(p){
    phase=p; elapsed=0;
    countUp = (p==='work' && cfg.countUp);
    if(p==='work')       targetSec=cfg.workSec;
    else if(p==='long')  targetSec=cfg.longBreakSec||cfg.breakSec;
    else                 targetSec=(cfg.countUp?dynBreakSec:cfg.breakSec);
    emit('phaseStart', phase, snapshot());
  }

  function snapshot(){
    const remaining = countUp ? elapsed : Math.max(0,targetSec-elapsed);
    const frac = countUp ? null : (targetSec>0 ? Math.min(1,elapsed/targetSec) : 0);
    return {phase,running,countUp,elapsed,remaining,targetSec,frac,
            completedWork,longEvery:cfg.longEvery,mode:cfg.mode};
  }

  function loop(){
    const now=Date.now();
    const dt=(now-lastTs)/1000; lastTs=now;
    elapsed+=dt;
    if(!countUp && elapsed>=targetSec){
      elapsed=targetSec; running=false; stopLoop();
      emit('tick', snapshot());
      emit('phaseEnd', phase, snapshot());
      return;
    }
    emit('tick', snapshot());
  }
  function startLoop(){ if(handle) return; lastTs=Date.now(); handle=setInterval(loop,200); }
  function stopLoop(){ if(handle){clearInterval(handle); handle=null;} }

  // --- kontrol ---
  function start(){ running=true; startLoop(); emit('tick',snapshot()); }
  function pause(){ running=false; stopLoop(); emit('tick',snapshot()); }
  function resume(){ if(running) return; running=true; startLoop(); }
  function toggle(){ running?pause():start(); }

  /* Çalışma fazını bitirir (flow prompt / molaya geçiş için).
     phaseEnd olayını tetikler ama otomatik ilerlemez — app karar verir. */
  function finishCurrent(){
    running=false; stopLoop();
    if(!countUp) elapsed=Math.min(elapsed,targetSec);
    emit('phaseEnd', phase, snapshot());
  }

  /* Bir sonraki faza geç. work→break/long, break→work. autoStart=true ise başlatır. */
  function goNext(autoStart){
    if(phase==='work'){
      completedWork++;
      if(cfg.countUp){ // flowtime: molayı çalışmanın ~1/5'i yap (3–20 dk)
        dynBreakSec = Math.max(180, Math.min(1200, Math.round(elapsed/5)));
      }
      const isLong = cfg.longEvery>0 && completedWork%cfg.longEvery===0;
      setupPhase(isLong?'long':'break');
    } else {
      setupPhase('work');
    }
    if(autoStart) start(); else emit('tick',snapshot());
  }

  function extend(sec){        // "Akıştaysan +5 dk"
    if(countUp) return;
    targetSec+=sec; running=true; startLoop();
  }

  return { on, configure, reset, start, pause, resume, toggle,
           finishCurrent, goNext, extend, snapshot,
           get phase(){return phase;}, get running(){return running;} };
})();
