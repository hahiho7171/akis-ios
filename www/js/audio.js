/* ===== audio.js — Web Audio ile telifsiz ses üretimi =====
   Ortam sesleri (brown/white/pink noise + yağmur-benzeri + tik-tak) tamamen
   koddan üretilir; hiçbir ses dosyası / telif gerektirmez.
   Müzik (klasik/lo-fi) sonra CC0 dosyalarıyla eklenecek. */
const AkisAudio = (() => {
  let ctx = null;
  let ambientNode = null;   // aktif ortam ses düğümü
  let ambientGain = null;
  let current = 'off';
  let volume = 0.5;
  let tickTimer = null;
  let tickAlt = false;

  function ensure(){
    if(!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    }
    if(ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // ---- Noise buffer üreticileri ----
  function noiseBuffer(type){
    const len = 2 * ctx.sampleRate;           // 2 sn, loop
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    if(type === 'white'){
      for(let i=0;i<len;i++) d[i] = Math.random()*2-1;
    } else if(type === 'brown'){
      let last = 0;
      for(let i=0;i<len;i++){
        const w = Math.random()*2-1;
        last = (last + 0.02*w)/1.02;
        d[i] = last*3.2;
      }
    } else if(type === 'pink'){
      let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
      for(let i=0;i<len;i++){
        const w = Math.random()*2-1;
        b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
        b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
        b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
        d[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11; b6=w*0.115926;
      }
    }
    return buf;
  }

  // ---- Yağmur: filtrelenmiş brown+white noise, hafif dalgalanma ----
  function buildRain(){
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer('brown'); src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=420;
    const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=8500;
    // yağmurun 'nefes alması' için yavaş genlik dalgası
    const lfo = ctx.createOscillator(); lfo.frequency.value=0.12;
    const lfoGain = ctx.createGain(); lfoGain.gain.value=0.12;
    const base = ctx.createGain(); base.gain.value=0.85;
    lfo.connect(lfoGain).connect(base.gain);
    src.connect(hp).connect(lp).connect(base);
    src.start(); lfo.start();
    base._extra = [src, lfo];
    return base;
  }

  // ---- Şömine: lowpass brown-noise yatağı + rastgele çıtırtı patlamaları ----
  let crackleBuf=null;
  function getCrackleBuf(){
    if(!crackleBuf){
      crackleBuf=ctx.createBuffer(1, Math.floor(0.3*ctx.sampleRate), ctx.sampleRate);
      const d=crackleBuf.getChannelData(0);
      for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    }
    return crackleBuf;
  }
  function buildFire(){
    const out=ctx.createGain(); out.gain.value=0.95;
    const src=ctx.createBufferSource(); src.buffer=noiseBuffer('brown'); src.loop=true;
    const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=360;
    const bed=ctx.createGain(); bed.gain.value=0.6;
    src.connect(lp).connect(bed).connect(out); src.start();
    const crackle=()=>{
      if(current!=='fire') return;
      const t=ctx.currentTime;
      const b=ctx.createBufferSource(); b.buffer=getCrackleBuf();
      const bp=ctx.createBiquadFilter(); bp.type='bandpass';
      bp.frequency.value=1100+Math.random()*2600; bp.Q.value=1.6;
      const g=ctx.createGain(); const amp=0.12+Math.random()*0.5;
      g.gain.setValueAtTime(0.0001,t);
      g.gain.exponentialRampToValueAtTime(amp,t+0.004);
      g.gain.exponentialRampToValueAtTime(0.0001,t+0.05+Math.random()*0.09);
      b.connect(bp).connect(g).connect(out);
      b.start(t); b.stop(t+0.25);
      out._t=setTimeout(crackle, 35+Math.random()*260);
    };
    out._extra=[src];
    out._stopCrackle=()=>clearTimeout(out._t);
    crackle();
    return out;
  }

  function buildNoise(type){
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(type); src.loop = true;
    const g = ctx.createGain(); g.gain.value = (type==='white'?0.35:0.7);
    src.connect(g); src.start();
    g._extra = [src];
    return g;
  }

  // ---- Tik-tak: her saniyede kısa klik (app'ten tetiklenir) ----
  function playTickOnce(){
    if(current !== 'tick') return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type='square';
    osc.frequency.value = tickAlt ? 1400 : 1050;   // tik / tak
    tickAlt = !tickAlt;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume*0.5, t+0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t+0.05);
    osc.connect(g).connect(ambientGain);
    osc.start(t); osc.stop(t+0.06);
  }

  function stopAmbientNode(){
    if(tickTimer){ clearInterval(tickTimer); tickTimer=null; }
    if(ambientNode){
      try{
        if(ambientNode._stopCrackle) ambientNode._stopCrackle();
        (ambientNode._extra||[]).forEach(n=>{ try{n.stop();}catch(e){} });
        ambientNode.disconnect();
      }catch(e){}
      ambientNode=null;
    }
  }

  function setAmbient(kind){
    ensure();
    stopAmbientNode();
    current = kind;
    if(!ambientGain){
      ambientGain = ctx.createGain();
      ambientGain.connect(ctx.destination);
    }
    ambientGain.gain.value = volume;
    if(kind==='off') return;
    if(kind==='tick'){
      // tik-tak app tarafından her saniye playTickOnce() ile çalınır
      return;
    }
    let node;
    if(kind==='rain') node = buildRain();
    else if(kind==='fire') node = buildFire();
    else node = buildNoise(kind); // brown/white/pink
    node.connect(ambientGain);
    ambientNode = node;
  }

  function setVolume(v){
    volume = Math.max(0, Math.min(1, v));
    if(ambientGain) ambientGain.gain.value = volume;
  }

  function suspend(){ if(ctx && ctx.state==='running') ctx.suspend(); }
  function resume(){ if(ctx && ctx.state==='suspended') ctx.resume(); }

  // ---- Müzik kanalı (ORTAMDAN BAĞIMSIZ): gerçek CC0/kamu-malı mp3 ----
  const MUSIC={
    classic:['assets/audio/music-classic-1.mp3','assets/audio/music-classic-2.mp3'],
    lofi:['assets/audio/music-lofi-1.mp3','assets/audio/music-lofi-2.mp3']
  };
  let musicEl=null, musicKind='off', musicIdx=0, musicVol=0.4;
  function ensureMusicEl(){
    if(!musicEl){
      musicEl=new Audio(); musicEl.loop=false;
      musicEl.addEventListener('ended', ()=>{
        const list=MUSIC[musicKind]||[]; if(!list.length) return;
        musicIdx=(musicIdx+1)%list.length; musicEl.src=list[musicIdx]; musicEl.play().catch(()=>{});
      });
    }
    return musicEl;
  }
  function setMusic(kind){
    musicKind=kind;
    if(kind==='off'||!MUSIC[kind]){ if(musicEl) musicEl.pause(); return; }
    const el=ensureMusicEl(); const list=MUSIC[kind];
    musicIdx=0; el.volume=musicVol; el.src=list[0]; el.play().catch(()=>{});
  }
  function setMusicVolume(v){ musicVol=Math.max(0,Math.min(1,v)); if(musicEl) musicEl.volume=musicVol; }
  function pauseMusic(){ if(musicEl && !musicEl.paused) musicEl.pause(); }
  function resumeMusic(){ if(musicEl && musicKind!=='off' && musicEl.paused) musicEl.play().catch(()=>{}); }

  return {
    setAmbient, setVolume, playTickOnce,
    setMusic, setMusicVolume, pauseMusic, resumeMusic,
    get current(){return current;},
    get musicKind(){return musicKind;},
    suspend, resume,
    stopAll(){ stopAmbientNode(); current='off'; if(musicEl){musicEl.pause();} musicKind='off'; }
  };
})();
