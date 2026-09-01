/* ===== audio.js — ORTAM SESİ MİXER'İ =====
   Her ortam sesi bağımsız bir "kanal": kendi ses çubuğu, aynı anda birden fazlası çalar.
   - HEPSİ gerçek kayıt (assets/audio/amb-*.mp3). 2026-08-29: koddan üretilen
     brown/white/pink noise ve wave/wind/night/cafe sentezi KALDIRILDI — hepsi
     aynı gürültü üretecinden geliyordu, kullanıcı "farklı isim aynı ses" dedi.
   - Döngü dikişsiz: iki oynatıcı çapraz geçişle karışır (aşağıda GECIS_SN).
   Müzik kanalı ayrıdır (klasik/lo-fi), kendi çubuğuyla.
   Vol değeri 0..1; 0 = o kanal kapalı. */
const AkisAudio = (() => {
  /* Web Audio bağlamı artık gerekmiyor: sentezlenen ses kalmadı,
     her kanal gerçek kayıt dosyası çalıyor. */

  /* ================= ORTAM SESİ KANALLARI =================
     Hepsi GERÇEK KAYIT (Pixabay Content License). 2026-08-29'a kadar
     wave/wind/night/cafe ve brown/white/pink noise koddan üretiliyordu;
     kullanıcı haklı olarak "farklı isimler ama hep aynı ses" dedi —
     çünkü hepsi tek bir gürültü üretecinin filtresi değiştirilmiş hâliydi.
     Sentez tamamen kaldırıldı. `cafe` ve gürültüler listeden çıktı. */
  /* 🚨 SES DOSYALARINA DA SÜRÜM DAMGASI ŞART.
     index.html'deki ?v= damgası yalnız js/css'i tazeliyor; ses dosyalarının
     yolu burada, damgasızdı. 2026-08-29'da ölçülerek görüldü: yağmur dosyası
     değiştirildiği hâlde tarayıcı 23 sn'lik ESKİ kaydı önbellekten veriyordu —
     güncelleyen kullanıcı yeni sesi hiç duymayacaktı.
     ⚠️ Bir ses dosyasını her değiştirdiğinde bu damgayı da yükselt. */
  const SES_SURUM = '2.8.1';
  const d = (yol) => yol + '?v=' + SES_SURUM;

  const FILES = {
    rain: d('assets/audio/amb-rain.mp3'),    // cam yağmuru — tiz hışırtısı az olan kayıt
    fire: d('assets/audio/amb-fire.mp3'),
    birds: d('assets/audio/amb-birds.mp3'),
    forest: d('assets/audio/amb-forest.mp3'),
    tick: d('assets/audio/amb-tick.mp3'),
    wave: d('assets/audio/amb-wave.mp3'),    // kıyıya vuran dalga
    wind: d('assets/audio/amb-wind.mp3'),    // uluyan kış rüzgârı
    night: d('assets/audio/amb-night.mp3'),   // cırcır böcekli gece
    stream: d('assets/audio/amb-stream.mp3')   // akarsu
  };

  /* Jetonla açılan kanallar. Fiyatlar korundu; `cafe` kaldırıldığı için
     yerine `stream` geldi (bkz. stats.js — cafe sahipleri stream alır). */
  const PREMIUM_SES = { wave:400, wind:400, night:600, stream:600 };
  const PREMIUM_KEYS = Object.keys(PREMIUM_SES);
  const ALL_KEYS = Object.keys(FILES);

  /* ---- KUSURSUZ DÖNGÜ ----
     🚨 <audio loop> ile mp3 döngüsü ASLA dikişsiz olmaz: mp3 kodlayıcısı
        her dosyanın başına ~26 ms gecikme, sonuna dolgu ekler. Başa dönerken
        o boşluk duyulur ("bitip yeniden başlıyormuş gibi").
     ✅ Çözüm: her kanal İKİ oynatıcı tutar. Önde giden bitmeden ikincisi
        baştan başlatılır ve GECIS_SN boyunca eşit-güçle karışırlar
        (cos/sin — toplam güç sabit, ortada ses çukuru olmaz).
     🛡️ Emniyet: her iki oynatıcıda da `loop=true` açık. Zamanlayıcı arka
        planda kısılırsa geçiş pürüzsüz olmaz ama ses ASLA kesilmez —
        en kötü ihtimalle eski davranışa döner. */
  const GECIS_SN = 1.2;

  function yeniOynatici(src){
    const el = new Audio();
    el.src = src; el.loop = true; el.preload = 'auto'; el.volume = 0;
    return el;
  }

  const tracks = {};  // key -> {vol,on,a,b,onde,zaman,geciste}
  function track(key){
    if(!tracks[key]){
      tracks[key] = { vol:0, on:false, a:null, b:null, onde:null, zaman:null, geciste:false };
    }
    return tracks[key];
  }

  function hazirla(key){
    const t = track(key);
    if(!t.a){ t.a = yeniOynatici(FILES[key]); t.b = yeniOynatici(FILES[key]); t.onde = t.a; }
    return t;
  }

  /* Önde giden sona yaklaştıysa geçişi BAŞLAT; sürüyorsa İLERLET.
     🚨 Rampa duvar saatinden hesaplanır, requestAnimationFrame ile DEĞİL:
        rAF uygulama arka plandayken hiç çalışmaz ve ses tek oynatıcıda
        takılı kalırdı (2026-08-29'da ölçülerek bulundu). Böylece tik
        gecikse bile ses seviyesi doğru yerde olur. */
  function gecisDenetle(key){
    const t = tracks[key];
    if(!t || !t.on) return;
    const onde = t.onde, arka = (onde === t.a) ? t.b : t.a;

    if(t.geciste){
      const o = Math.min(1, (Date.now() - t.gecisBas) / (GECIS_SN * 1000));
      /* eşit güç: giren sin, çıkan cos → sin²+cos²=1, ortada ses çukuru olmaz */
      arka.volume = Math.max(0, Math.min(1, t.vol * Math.sin(o * Math.PI / 2)));
      onde.volume = Math.max(0, Math.min(1, t.vol * Math.cos(o * Math.PI / 2)));
      if(o >= 1){
        try{ onde.pause(); onde.currentTime = 0; }catch(e){}
        onde.volume = 0;
        arka.volume = t.vol;
        t.onde = arka;
        t.geciste = false;
      }
      return;
    }

    const sure = onde.duration;
    if(!sure || !isFinite(sure)) return;                 // meta henüz gelmedi
    const kalan = sure - onde.currentTime;
    if(kalan > GECIS_SN || kalan < 0) return;

    t.geciste = true;
    t.gecisBas = Date.now();
    try{ arka.currentTime = 0; }catch(e){}
    arka.volume = 0;
    const p = arka.play(); if(p && p.catch) p.catch(()=>{});
  }

  /* Zamanlayıcı: tek bir tikleyici tüm kanalları denetler.
     `timeupdate` olayı da bağlanır — arka planda setInterval kısılsa bile
     medya iş parçacığından gelen bu olay çoğu zaman çalışmayı sürdürür. */
  let tikleyici = null;
  function tikleyiciKur(){
    if(tikleyici) return;
    tikleyici = setInterval(() => {
      for(const k in tracks) if(tracks[k].on) gecisDenetle(k);
    }, 100);
  }

  function startTrack(key){
    const t = hazirla(key);
    if(t.on) return;
    t.onde.volume = t.vol;
    const p = t.onde.play(); if(p && p.catch) p.catch(()=>{});
    if(!t.a._bagli){
      t.a._bagli = t.b._bagli = true;
      const el = () => gecisDenetle(key);
      t.a.addEventListener('timeupdate', el);
      t.b.addEventListener('timeupdate', el);
    }
    t.on = true;
    tikleyiciKur();
  }

  function stopTrack(key){
    const t = tracks[key]; if(!t || !t.on) return;
    [t.a, t.b].forEach(el => { if(el){ try{ el.pause(); el.currentTime = 0; }catch(e){} el.volume = 0; } });
    t.onde = t.a; t.geciste = false; t.on = false;
  }

  // Bir kanalın sesini ayarla (0 = kapat). Canlı çalışır.
  function setTrackVolume(key, vol){
    vol = Math.max(0, Math.min(1, vol));
    if(!FILES[key]) return;                     // kaldırılan eski kanal (noise/cafe)
    const t = track(key); t.vol = vol;
    if(vol <= 0.001){ stopTrack(key); return; }
    if(!t.on){ startTrack(key); return; }
    // Geçiş sürerken ses seviyesini EZME — rampa kendi hesabını yapıyor.
    if(!t.geciste && t.onde) t.onde.volume = vol;
  }
  function getTrackVolume(key){ return tracks[key] ? tracks[key].vol : 0; }

  // Kayıtlı karışımı uygula (mix = {rain:0.4, birds:0.2, ...})
  function applyMix(mix){ mix=mix||{}; for(const k of ALL_KEYS) setTrackVolume(k, +mix[k]||0); }

  // Zamanlayıcı duraklat/devam: çalanları duraklat, geri al
  function suspendAll(){
    for(const k in tracks){ const t=tracks[k]; if(!t.on) continue;
      [t.a,t.b].forEach(el=>{ if(el){ try{ el.pause(); }catch(e){} } }); }
  }
  function resumeAll(){
    for(const k in tracks){ const t=tracks[k]; if(!t.on || t.vol<=0) continue;
      // Yalnız ÖNDE gideni sürdür; geçiş yarıda kaldıysa tikleyici toparlar.
      try{ const p=t.onde.play(); if(p&&p.catch)p.catch(()=>{}); }catch(e){} }
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
    noiseKeys: [],                                  // gürültü üreteçleri kaldırıldı
    premiumKeys: PREMIUM_KEYS.slice(),
    premiumFiyat: (k)=> PREMIUM_SES[k] || 0,
    setTrackVolume, getTrackVolume, applyMix,
    /* Tanılama: müzik oynatıcısı `new Audio()` ile üretiliyor, DOM'da yok →
       denetim betikleri göremiyordu. Salt okur. (1 Eyl 2026) */
    muzikTanilama(){
      return { tur: musicKind, ses: +musicVol.toFixed(3),
               kaynak: musicEl ? String(musicEl.src||'').split('/').pop().split('?')[0] : null,
               duraklamis: musicEl ? musicEl.paused : null };
    },
    /* Tanılama: döngü geçişini DIŞARIDAN ölçebilmek için. Oynatıcılar
       `new Audio()` ile üretiliyor ve DOM'da olmadıkları için denetim
       betikleri onları göremiyordu. Sadece okur, hiçbir şeyi değiştirmez. */
    tanilama(key){
      const t = tracks[key]; if(!t) return null;
      const par = el => el ? { duraklamis: el.paused, ses: +el.volume.toFixed(3),
                               an: +(el.currentTime||0).toFixed(2),
                               sure: isFinite(el.duration) ? +el.duration.toFixed(2) : null } : null;
      return { acik:t.on, hedefSes:t.vol, geciste:t.geciste,
               onde: (t.onde===t.a?'a':'b'), a:par(t.a), b:par(t.b) };
    },
    /* Testte geçişi beklemeden tetiklemek için: önde gideni sona yaklaştırır. */
    _sonaAtla(key, kala){
      const t = tracks[key]; if(!t||!t.on||!t.onde) return false;
      const d = t.onde.duration; if(!isFinite(d)) return false;
      try{ t.onde.currentTime = Math.max(0, d - (kala||1.6)); }catch(e){ return false; }
      return true;
    },
    suspendAll, resumeAll,
    setMusic, setMusicVolume, pauseMusic, resumeMusic,
    get musicKind(){return musicKind;},
    // eski API uyumu (kullanılmıyor ama güvenli):
    suspend:suspendAll, resume:resumeAll,
    stopAll(){ for(const k in tracks) stopTrack(k); if(musicEl){musicEl.pause();} musicKind='off';
      if(tikleyici){ clearInterval(tikleyici); tikleyici=null; } }
  };
})();

/* `const` ile tanımlanan modül global nesneye YAZILMAZ (yalnız `var`/fonksiyon yazar).
   Kodun her yerinde `window.AkisAudio && ...` biçiminde kontroller var; bu bağlama olmadan
   hepsi sessizce false dönüyordu (2026-08-27'de ölçülerek bulundu). */
try{ window.AkisAudio = AkisAudio; }catch(e){}
