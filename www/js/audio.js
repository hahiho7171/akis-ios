/* ===== audio.js — ORTAM SESİ MİXER'İ =====
   Her ortam sesi bağımsız bir "kanal": kendi ses çubuğu, aynı anda birden fazlası çalar.
   - Doğa sesleri (yağmur/şömine/kuş/orman/tik-tak) = gerçek CC0 kayıt, kusursuz loop mp3 (assets/audio/amb-*.mp3)
   - brown/white/pink noise = koddan üretilir (Web Audio)
   Müzik kanalı ayrıdır (klasik/lo-fi), kendi çubuğuyla.
   Vol değeri 0..1; 0 = o kanal kapalı. */
const AkisAudio = (() => {
  let ctx = null;
  function ensureCtx(){
    if(!ctx){ const AC = window.AudioContext || window.webkitAudioContext; ctx = new AC(); }
    if(ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // ---- Noise buffer üreticileri (brown/white/pink) ----
  function noiseBuffer(type){
    const c = ensureCtx();
    const len = 2 * c.sampleRate;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    if(type === 'white'){
      for(let i=0;i<len;i++) d[i] = Math.random()*2-1;
    } else if(type === 'brown'){
      let last = 0;
      for(let i=0;i<len;i++){ const w=Math.random()*2-1; last=(last+0.02*w)/1.02; d[i]=last*3.2; }
    } else { // pink
      let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
      for(let i=0;i<len;i++){
        const w=Math.random()*2-1;
        b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
        b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
        b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
        d[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11; b6=w*0.115926;
      }
    }
    return buf;
  }

  // ---- Kanallar ----
  // Gerçek kayıt dosyaları (kusursuz loop). tick artık gerçek saat kaydı.
  const FILES = {
    rain:  'assets/audio/amb-rain.mp3',
    fire:  'assets/audio/amb-fire.mp3',
    birds: 'assets/audio/amb-birds.mp3',
    forest:'assets/audio/amb-forest.mp3',
    tick:  'assets/audio/amb-tick.mp3'
  };
  const NOISES = ['brown','white','pink'];
  const NOISE_ATTEN = { brown:0.85, white:0.35, pink:0.7 };
  const ALL_KEYS = Object.keys(FILES).concat(NOISES);

  const tracks = {};  // key -> {type, vol, on, el?, src?, gain?}
  function track(key){
    if(!tracks[key]){
      if(NOISES.includes(key)) tracks[key] = { type:'noise', vol:0, on:false, src:null, gain:null };
      else { const el=new Audio(); el.loop=true; el.preload='auto'; el.src=FILES[key]; tracks[key] = { type:'file', vol:0, on:false, el }; }
    }
    return tracks[key];
  }

  function startTrack(key){
    const t = track(key);
    if(t.on) return;
    if(t.type==='noise'){
      const c=ensureCtx();
      const src=c.createBufferSource(); src.buffer=noiseBuffer(key); src.loop=true;
      const g=c.createGain(); g.gain.value=t.vol*(NOISE_ATTEN[key]||0.7);
      src.connect(g).connect(c.destination); src.start();
      t.src=src; t.gain=g;
    } else {
      t.el.volume=t.vol; const p=t.el.play(); if(p&&p.catch) p.catch(()=>{});
    }
    t.on=true;
  }
  function stopTrack(key){
    const t=tracks[key]; if(!t||!t.on) return;
    if(t.type==='noise'){ try{ t.src.stop(); t.src.disconnect(); t.gain.disconnect(); }catch(e){} t.src=null; t.gain=null; }
    else { try{ t.el.pause(); }catch(e){} }
    t.on=false;
  }

  // Bir kanalın sesini ayarla (0 = kapat). Canlı çalışır.
  function setTrackVolume(key, vol){
    vol=Math.max(0, Math.min(1, vol));
    const t=track(key); t.vol=vol;
    if(vol<=0.001){ stopTrack(key); return; }
    if(!t.on) startTrack(key);
    else if(t.type==='file') t.el.volume=vol;
    else if(t.gain) t.gain.gain.value=vol*(NOISE_ATTEN[key]||0.7);
  }
  function getTrackVolume(key){ return tracks[key] ? tracks[key].vol : 0; }

  // Kayıtlı karışımı uygula (mix = {rain:0.4, birds:0.2, ...})
  function applyMix(mix){ mix=mix||{}; for(const k of ALL_KEYS) setTrackVolume(k, +mix[k]||0); }

  // Zamanlayıcı duraklat/devam: çalanları duraklat, geri al
  function suspendAll(){
    if(ctx && ctx.state==='running'){ try{ctx.suspend();}catch(e){} }
    for(const k in tracks){ const t=tracks[k]; if(t.type==='file'&&t.on){ try{t.el.pause();}catch(e){} } }
  }
  function resumeAll(){
    if(ctx && ctx.state==='suspended'){ try{ctx.resume();}catch(e){} }
    for(const k in tracks){ const t=tracks[k]; if(t.type==='file'&&t.on&&t.vol>0){ try{ const p=t.el.play(); if(p&&p.catch)p.catch(()=>{}); }catch(e){} } }
  }

  // ---- Müzik kanalı (ayrı): gerçek CC0/kamu-malı mp3 ----
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
    keys: ALL_KEYS.slice(),
    fileKeys: Object.keys(FILES),
    noiseKeys: NOISES.slice(),
    setTrackVolume, getTrackVolume, applyMix,
    suspendAll, resumeAll,
    setMusic, setMusicVolume, pauseMusic, resumeMusic,
    get musicKind(){return musicKind;},
    // eski API uyumu (kullanılmıyor ama güvenli):
    suspend:suspendAll, resume:resumeAll,
    stopAll(){ for(const k in tracks) stopTrack(k); if(musicEl){musicEl.pause();} musicKind='off'; }
  };
})();
