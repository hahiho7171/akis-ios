/* ===== stats.js — istatistik + streak + orman ağaçları (localStorage) =====
   Her tamamlanan/yarıda kesilen (>=1 dk) odak seansı:
   - günlük toplama (data.sessions[date]) eklenir  (streak/haftalık için)
   - ayrı bir kayıt (data.items[]) olarak saklanır (isim + süre + saat + ağaç tipi)
   Eski "gölet" kayıtları (pebble/reed/lily/koi) korunur; garden.js onları ağaca eşler. */
const AkisStats = (() => {
  const KEY='akis.stats.v1';
  let data = load();

  function load(){
    try{
      const d=JSON.parse(localStorage.getItem(KEY));
      if(d && d.sessions){
        if(!d.items) d.items=[];
        if(d.totalMinutes==null) d.totalMinutes=0;
        if(d.coins==null) d.coins=0;          // 2026-08-27: jeton ekonomisi
        if(!d.decos) d.decos=[];              // satın alınan süsler
        if(d.plotN==null) d.plotN=7;          // bahçe ada kenarı (jetonla büyür)
        if(!d.grounds) d.grounds=['grass'];   // sahip olunan zemin desenleri
        if(!d.ground) d.ground='grass';       // aktif zemin
        if(!d.palettes) d.palettes=['forest'];// sahip olunan ağaç renkleri
        if(!d.trees)    d.trees=['klasik'];   // sahip olunan ağaç TÜRLERİ (2026-08-29)
        if(!d.tree)     d.tree='klasik';
        if(!d.palette) d.palette='forest';    // aktif ağaç rengi
        if(!d.weathers) d.weathers=['clear'];  // sahip olunan hava efektleri
        if(!d.weather) d.weather='clear';      // aktif hava
        if(!d.sounds) d.sounds=[];             // 2026-08-28: jetonla açılan ek sesler
        /* 2026-08-29: `cafe` (kafe uğultusu) kaldırıldı — sentezdi, diğerleriyle
           aynı sesti. Jetonunu ona vermiş kullanıcı kayba uğramasın: yerine
           `stream` (akarsu) hesabına geçer. */
        if(d.sounds.indexOf('cafe')>=0 && d.sounds.indexOf('stream')<0) d.sounds.push('stream');
        if(!d.customTags) d.customTags=[];     // kullanıcının kendi etiketleri
        if(d.activeTag==null) d.activeTag='study';
        if(d.dayStart==null) d.dayStart=0;     // günün başlangıç saati
        if(!d.checkin) d.checkin={son:null, seri:0};
        return d;
      }
    }catch(e){}
    return {sessions:{}, items:[], totalMinutes:0, streakFreezes:2, coins:0, decos:[],
            plotN:7, grounds:['grass'], ground:'grass', palettes:['forest'], palette:'forest',
            trees:['klasik'], tree:'klasik',
            weathers:['clear'], weather:'clear',
            sounds:[], customTags:[], activeTag:'study', dayStart:0, checkin:{son:null,seri:0}};
  }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(data)); }catch(e){} }

  function dstr(d){
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  /* ---- ⑩ GÜNÜN BAŞLANGIÇ SAATİ (2026-08-28) ----
     Gece 01:00'de çalışan biri için o seans hâlâ "dün"e ait olmalı; yoksa seri kırılır ve
     istatistik iki güne bölünür. `dayStart` (0-23, varsayılan 0) saatinden ÖNCEsi bir önceki güne yazılır.
     Rakip (Forest) bu ayarı "Günün başlangıç zamanı" adıyla veriyor. */
  function dayStart(){ const v = data.dayStart; return (v==null || v<0 || v>23) ? 0 : v|0; }
  function setDayStart(h){ h=Math.max(0,Math.min(23, h|0)); data.dayStart=h; save(); return h; }
  function mantikGun(d){
    const x = new Date(d.getTime());
    if(x.getHours() < dayStart()) x.setDate(x.getDate()-1);
    return x;
  }
  function today(){ return dstr(mantikGun(new Date())); }

  // odak süresine göre ağaç büyüme evresi
  function itemForMinutes(min){
    if(min>=50) return {type:'bigtree', emoji:'🌳'};
    if(min>=30) return {type:'tree',    emoji:'🌲'};
    if(min>=10) return {type:'sapling', emoji:'🌿'};
    return {type:'sprout', emoji:'🌱'};
  }

  /* Tamamlanan/kesilen odak seansını kaydet. name = oturum adı (opsiyonel).
     Dönen: kazanılan ağaç öğesi (ödül balonu için) veya null. */
  function recordFocus(minutes, name, pale, etiket){
    minutes=Math.round(minutes);
    if(minutes<1) return null;
    const t=today();
    if(!data.sessions[t]) data.sessions[t]={minutes:0,count:0};
    data.sessions[t].minutes+=minutes;
    data.sessions[t].count+=1;
    data.totalMinutes+=minutes;
    data.coins=(data.coins||0)+minutes;      // her odak dakikasi 1 jeton
    const item=itemForMinutes(minutes);
    // gece + 3+ seri → ateşböceği bonusu (ormanda gece ışıltısı)
    const h=new Date().getHours();
    const isNight = h>=20 || h<6;
    if(isNight && streak()>=3 && !pale) item.firefly=true;
    if(pale) item.pale=true;               // "Derin Odak" bozuldu → ağaç soluk dikilir (ceza yok, görsel fark var)
    data.items.push({
      type:item.type, min:minutes, date:t,
      name:(name||'').slice(0,40), ts:Date.now(), firefly:!!item.firefly, pale:!!pale,
      tag: etiket || data.activeTag || null            // ③ etiket sistemi
    });
    gorevIlerlet(minutes);                              // ② günlük görevler
    save();
    return item;
  }

  /* ---- ③ ETİKETLER (2026-08-28) ----
     Seansı kategoriye ayır ("zamanım nereye gidiyor" sorusunun cevabı).
     7 hazır etiket kod tarafında (i18n anahtarlarıyla), kullanıcı kendi etiketini de ekleyebilir. */
  const HAZIR_ETIKET = [
    {id:'study', renk:'#e879a6'}, {id:'work',   renk:'#6ef0d6'}, {id:'read', renk:'#f4cd76'},
    {id:'sport', renk:'#7bd88f'}, {id:'social', renk:'#9d8df1'}, {id:'rest', renk:'#5ec2f0'},
    /* 2026-08-29: uyku etiketi — seçilince arka plan kendiliğinden şömineye döner
       (anaekran.js › ETIKET_ARKAPLAN). */
    {id:'sleep', renk:'#8f7bd6'},
    {id:'other', renk:'#9aa7b4'}
  ];
  function tags(){
    const ozel = (data.customTags||[]).map(t=>({id:t.id, ad:t.ad, renk:t.renk, ozel:true}));
    return HAZIR_ETIKET.map(t=>({id:t.id, renk:t.renk, ozel:false})).concat(ozel);
  }
  function tagById(id){ return tags().find(t=>t.id===id) || null; }
  function activeTag(){ return data.activeTag || 'study'; }
  function setActiveTag(id){ data.activeTag = id || null; save(); return data.activeTag; }
  function addTag(ad, renk){
    ad = String(ad||'').trim().slice(0,20);
    if(!ad) return null;
    if(!data.customTags) data.customTags=[];
    if(data.customTags.length>=12) return null;         // sınırsız etiket listeyi çöplüğe çevirir
    const id = 'ozel_' + Date.now().toString(36);
    const t = {id, ad, renk: renk || '#6ef0d6'};
    data.customTags.push(t); save();
    return t;
  }
  function removeTag(id){
    if(!data.customTags) return false;
    const n = data.customTags.length;
    data.customTags = data.customTags.filter(t=>t.id!==id);
    if(data.activeTag===id) data.activeTag='study';
    if(data.customTags.length!==n){ save(); return true; }
    return false;
  }
  /* Etikete göre dakika dağılımı (gün sayısı verilirse son N gün). */
  function tagBreakdown(gunSayisi){
    const sinir = gunSayisi ? dstr(new Date(Date.now() - (gunSayisi-1)*86400000)) : null;
    const toplam = new Map();
    data.items.forEach(it=>{
      if(!it.min) return;
      if(sinir && it.date < sinir) return;
      const k = it.tag || 'other';
      toplam.set(k, (toplam.get(k)||0) + it.min);
    });
    return [...toplam.entries()].map(([id,dk])=>({id, dk})).sort((a,b)=>b.dk-a.dk);
  }

  function todayMinutes(){ const s=data.sessions[today()]; return s?s.minutes:0; }
  function totalHours(){ return (data.totalMinutes/60); }

  function aktifGun(s){ return !!(s && (s.minutes>0 || s.frozen)); }   // dondurulmuş gün seriyi KIRMAZ
  function streak(){
    let n=0; const d=mantikGun(new Date());   // ⑩ günün başlangıç saati: gece 01:00 hâlâ "dün"
    // bugün 0 ise dünden geriye bak (bugünü henüz kırmasın)
    if(!aktifGun(data.sessions[dstr(d)])) d.setDate(d.getDate()-1);
    while(true){
      const s=data.sessions[dstr(d)];
      if(aktifGun(s)){ if(s.minutes>0) n++; d.setDate(d.getDate()-1); }
      else break;
    }
    return n;
  }

  /* ---- SERİ DONDURMA: haftada 1 hak (yenilenir). Dün boşsa ve önceki gün doluysa hakkı otomatik kullan. ---- */
  function haftaKey(d){ const x=new Date(d); x.setDate(x.getDate()-x.getDay()); return dstr(x); }
  function applyFreeze(){
    try{
      // haftalık yenileme (en fazla 1 hakka tamamla; başlangıç stoku 2 korunur)
      const hk=haftaKey(new Date());
      if(data.lastFreezeWeek!==hk){ data.lastFreezeWeek=hk; if((data.streakFreezes||0)<1) data.streakFreezes=1; save(); }
      const dun=mantikGun(new Date()); dun.setDate(dun.getDate()-1);
      const evvel=mantikGun(new Date()); evvel.setDate(evvel.getDate()-2);
      const sDun=data.sessions[dstr(dun)], sEvvel=data.sessions[dstr(evvel)];
      if(!aktifGun(sDun) && aktifGun(sEvvel) && (data.streakFreezes||0)>0){
        data.sessions[dstr(dun)]={minutes:0,count:0,frozen:true};
        data.streakFreezes--; save();
        return true;   // hak kullanıldı (istenirse arayüz bilgi verir)
      }
    }catch(e){}
    return false;
  }
  function freezesLeft(){ return data.streakFreezes||0; }

  /* ---- BAŞARIMLAR (rozetler) — localStorage verisinden hesaplanır, ayrı kayıt gerektirmez ---- */
  function badges(){
    const its=data.items, tot=data.totalMinutes, st=streak();
    const saat=(h)=>its.some(it=>{ if(!it.ts) return false; const x=new Date(it.ts).getHours(); return h(x); });
    return [
      {id:'b_first', emoji:'🌱', on: its.length>=1},
      {id:'b_s3',    emoji:'🔥', on: st>=3},
      {id:'b_s7',    emoji:'🔥', on: st>=7},
      {id:'b_s30',   emoji:'🏆', on: st>=30},
      {id:'b_h10',   emoji:'⏳', on: tot>=600},
      {id:'b_h50',   emoji:'⌛', on: tot>=3000},
      {id:'b_h100',  emoji:'💎', on: tot>=6000},
      {id:'b_t25',   emoji:'🌲', on: its.length>=25},
      {id:'b_t100',  emoji:'🌳', on: its.length>=100},
      {id:'b_night', emoji:'🌙', on: saat(x=>x>=22||x<4)},
      {id:'b_early', emoji:'🌅', on: saat(x=>x>=5&&x<8)},
      {id:'b_deep',  emoji:'🚀', on: its.some(it=>(it.min||0)>=52)}
    ];
  }

  /* ================= ② GÜNLÜK CHECK-IN + GÜNLÜK GÖREVLER (2026-08-28) =================
     Rakipte (Forest) her gün geri dönüş sebebi bu. Bizde hiç yoktu.
     Check-in: günde bir kez, jeton verir; üst üste günlerde artan ödül (1.gün 10 → 7.gün 40).
     Görevler: her gün 3 görev, ilerlemesi otomatik işlenir, tamamlanınca jeton.
     🚨 Hepsi CİHAZDA hesaplanır — hesapsız felsefeyi bozmaz. */
  const CHECKIN_ODUL = [10, 12, 15, 20, 25, 30, 40];   // 1..7. gün (7+ hep 40)
  function checkinDurum(){
    const t=today();
    const c = data.checkin || {son:null, seri:0};
    return { alindiMi: c.son===t, seri: c.seri||0, odul: CHECKIN_ODUL[Math.min(6, (c.son===t? (c.seri||1) : (c.seri||0)))] };
  }
  function checkinAl(){
    const t=today();
    const c = data.checkin || {son:null, seri:0};
    if(c.son===t) return {ok:false, reason:'alindi'};
    const dun=new Date(); dun.setDate(dun.getDate()-1);
    c.seri = (c.son===dstr(mantikGun(dun))) ? (c.seri||0)+1 : 1;   // gün atlarsa seri sıfırlanır
    c.son = t;
    const odul = CHECKIN_ODUL[Math.min(6, c.seri-1)];
    data.checkin = c;
    data.coins = (data.coins||0) + odul;
    save();
    return {ok:true, odul, seri:c.seri};
  }

  /* Günlük görev havuzu — her gün tarihe göre 3 tanesi deterministik seçilir (rastgele değil ki
     uygulama kapatılıp açılınca görev değişmesin). hedef alanları dakikadır. */
  const GOREV_HAVUZ = [
    {id:'g_odak25',  hedef:25,  odul:15, tur:'dakika'},
    {id:'g_odak50',  hedef:50,  odul:25, tur:'dakika'},
    {id:'g_odak90',  hedef:90,  odul:40, tur:'dakika'},
    {id:'g_seans2',  hedef:2,   odul:15, tur:'seans'},
    {id:'g_seans3',  hedef:3,   odul:25, tur:'seans'},
    {id:'g_uzun',    hedef:45,  odul:30, tur:'tekseans'},   // tek seansta 45 dk
    {id:'g_sabah',   hedef:1,   odul:20, tur:'sabah'},      // 05:00-10:00 arası seans
    {id:'g_aksam',   hedef:1,   odul:20, tur:'aksam'}       // 20:00 sonrası seans
  ];
  function gunSayisi(ds){ // tarihten deterministik sayı (görev seçimi için)
    let h=0; for(let i=0;i<ds.length;i++) h=(h*31+ds.charCodeAt(i))>>>0; return h;
  }
  function gunlukGorevler(){
    const t=today();
    if(!data.gorev || data.gorev.gun!==t){
      const h=gunSayisi(t), n=GOREV_HAVUZ.length, sec=[];
      for(let i=0;i<3;i++){
        let idx=(h+i*7)%n;
        while(sec.indexOf(idx)>=0) idx=(idx+1)%n;
        sec.push(idx);
      }
      data.gorev = {gun:t, liste: sec.map(i=>({id:GOREV_HAVUZ[i].id, ilerleme:0, alindi:false}))};
      save();
    }
    return data.gorev.liste.map(g=>{
      const tanim = GOREV_HAVUZ.find(x=>x.id===g.id);
      return {id:g.id, hedef:tanim.hedef, odul:tanim.odul, tur:tanim.tur,
              ilerleme:Math.min(g.ilerleme, tanim.hedef), bitti:g.ilerleme>=tanim.hedef, alindi:g.alindi};
    });
  }
  function gorevIlerlet(dakika){
    gunlukGorevler();                       // bugünün listesi kurulsun
    const saat = new Date().getHours();
    data.gorev.liste.forEach(g=>{
      const tanim = GOREV_HAVUZ.find(x=>x.id===g.id);
      if(!tanim) return;
      if(tanim.tur==='dakika')        g.ilerleme += dakika;
      else if(tanim.tur==='seans')    g.ilerleme += 1;
      else if(tanim.tur==='tekseans') g.ilerleme = Math.max(g.ilerleme, dakika);
      else if(tanim.tur==='sabah' && saat>=5 && saat<10)  g.ilerleme = 1;
      else if(tanim.tur==='aksam' && saat>=20)            g.ilerleme = 1;
    });
    // save() çağıran tarafta (recordFocus) yapılıyor
  }
  function gorevOdulAl(id){
    gunlukGorevler();
    const g = data.gorev.liste.find(x=>x.id===id);
    const tanim = GOREV_HAVUZ.find(x=>x.id===id);
    if(!g || !tanim) return {ok:false};
    if(g.alindi) return {ok:false, reason:'alindi'};
    if(g.ilerleme < tanim.hedef) return {ok:false, reason:'bitmedi'};
    g.alindi=true; data.coins=(data.coins||0)+tanim.odul; save();
    return {ok:true, odul:tanim.odul};
  }

  /* ================= ⑦ AYLIK MÜCADELE (2026-08-28) =================
     Bu ay kaç gün odaklandın? Hedefe ulaşınca büyük jeton ödülü. Ay değişince kendini sıfırlar. */
  const AYLIK_HEDEF = 20, AYLIK_ODUL = 300;
  function ayKey(){ const d=mantikGun(new Date()); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
  function aylikMucadele(){
    const ay=ayKey();
    let gun=0;
    for(const ds in data.sessions){ if(ds.slice(0,7)===ay && data.sessions[ds].minutes>0) gun++; }
    const alindi = (data.aylikAlinan===ay);
    return {ay, gun, hedef:AYLIK_HEDEF, odul:AYLIK_ODUL, bitti:gun>=AYLIK_HEDEF, alindi};
  }
  function aylikOdulAl(){
    const m=aylikMucadele();
    if(!m.bitti) return {ok:false, reason:'bitmedi'};
    if(m.alindi) return {ok:false, reason:'alindi'};
    data.aylikAlinan=m.ay; data.coins=(data.coins||0)+AYLIK_ODUL; save();
    return {ok:true, odul:AYLIK_ODUL};
  }

  /* ================= ④ DÖNEM İSTATİSTİKLERİ (2026-08-28) =================
     Rakipte Gün/Hafta/Ay/Yıl + saat bazlı dağılım var; bizde yalnız 7 günlük çubuk vardı. */
  function saatDagilimi(gunSayisi){
    const sinir = gunSayisi ? dstr(new Date(Date.now() - (gunSayisi-1)*86400000)) : null;
    const saat = new Array(24).fill(0);
    data.items.forEach(it=>{
      if(!it.min || !it.ts) return;
      if(sinir && it.date < sinir) return;
      saat[new Date(it.ts).getHours()] += it.min;
    });
    return saat;
  }
  /* donem: 'gun' | 'hafta' | 'ay' | 'yil' → {etiket, dk} dizisi (grafik için) */
  function donemSerisi(donem, locale){
    const out=[]; const simdi=mantikGun(new Date());
    const fmt=(opts)=>{ try{ return new Intl.DateTimeFormat(locale||'en',opts); }catch(e){ return new Intl.DateTimeFormat('en',opts); } };
    if(donem==='gun'){
      const saat=saatDagilimi(1);
      for(let h=0;h<24;h++) out.push({etiket:String(h).padStart(2,'0'), dk:saat[h]});
    } else if(donem==='ay'){
      const f=fmt({day:'numeric'});
      for(let i=29;i>=0;i--){ const d=new Date(simdi); d.setDate(d.getDate()-i);
        const s=data.sessions[dstr(d)]; out.push({etiket:f.format(d), dk:s?s.minutes:0}); }
    } else if(donem==='yil'){
      const f=fmt({month:'short'});
      for(let i=11;i>=0;i--){
        const d=new Date(simdi.getFullYear(), simdi.getMonth()-i, 1);
        const ay=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
        let dk=0; for(const ds in data.sessions){ if(ds.slice(0,7)===ay) dk+=data.sessions[ds].minutes; }
        out.push({etiket:f.format(d), dk});
      }
    } else { // hafta
      const f=fmt({weekday:'short'});
      for(let i=6;i>=0;i--){ const d=new Date(simdi); d.setDate(d.getDate()-i);
        const s=data.sessions[dstr(d)]; out.push({etiket:f.format(d), dk:s?s.minutes:0}); }
    }
    return out;
  }
  function donemToplam(donem){
    return donemSerisi(donem).reduce((t,x)=>t+x.dk,0);
  }

  /* ---- YEDEK: dışa/içe aktarma (hesapsız felsefe — veri kullanıcının elinde) ---- */
  function exportData(){
    return JSON.stringify({app:'akis', v:1, exported:new Date().toISOString(), stats:data});
  }
  function importData(objOrStr){
    try{
      const o = typeof objOrStr==='string' ? JSON.parse(objOrStr) : objOrStr;
      const s = (o && o.app==='akis' && o.stats) ? o.stats : (o && o.sessions ? o : null);
      if(!s || typeof s.sessions!=='object' || !Array.isArray(s.items)) return false;
      data = { sessions:s.sessions||{}, items:s.items||[],
               totalMinutes:+s.totalMinutes||0, streakFreezes:(s.streakFreezes!=null?+s.streakFreezes:2),
               lastFreezeWeek:s.lastFreezeWeek,
               coins:+s.coins||0, decos:s.decos||[], plotN:+s.plotN||7,
               grounds:s.grounds||['grass'], ground:s.ground||'grass',
               palettes:s.palettes||['forest'], palette:s.palette||'forest',
               trees:s.trees||['klasik'], tree:s.tree||'klasik',
               weathers:s.weathers||['clear'], weather:s.weather||'clear',
               sounds:s.sounds||[], customTags:s.customTags||[], activeTag:s.activeTag||'study',
               dayStart:(s.dayStart!=null?+s.dayStart:0), checkin:s.checkin||{son:null,seri:0},
               gorev:s.gorev, aylikAlinan:s.aylikAlinan };
      save();
      return true;
    }catch(e){ return false; }
  }

  function last7(locale){
    const out=[]; let fmt;
    try{ fmt=new Intl.DateTimeFormat(locale||'en',{weekday:'short'}); }
    catch(e){ fmt=new Intl.DateTimeFormat('en',{weekday:'short'}); }
    for(let i=6;i>=0;i--){
      const d=mantikGun(new Date()); d.setDate(d.getDate()-i);
      const ds=dstr(d);
      const s=data.sessions[ds];
      out.push({day:fmt.format(d), minutes:s?s.minutes:0, count:s?s.count:0, date:ds});
    }
    return out;
  }

  // belirli bir günün oturum kayıtları (yeni→eski)
  function sessionsForDate(ds){
    return data.items.filter(it=>it.date===ds && it.min!=null)
                     .slice().sort((a,b)=>(b.ts||0)-(a.ts||0));
  }
  function todaySessions(){ return sessionsForDate(today()); }
  function dayMinutes(ds){ const s=data.sessions[ds]; return s?s.minutes:0; }

  function items(){ return data.items; }
  function itemCount(){ return data.items.length; }

  /* ---- Zaman Tuneli: tum seanslar, gune gore gruplu, yeniden eskiye ----
     (rakiplerde vardi, bizde yalnizca "bugunun seanslari" vardi) */
  function timeline(gunLimit){
    const gun=new Map();
    data.items.filter(it=>it.min!=null && it.date).forEach(it=>{
      if(!gun.has(it.date)) gun.set(it.date,[]);
      gun.get(it.date).push(it);
    });
    return [...gun.entries()]
      .sort((a,b)=>a[0]<b[0]?1:-1)
      .slice(0, gunLimit||30)
      .map(([date,list])=>({
        date,
        list: list.slice().sort((a,b)=>(b.ts||0)-(a.ts||0)),
        minutes: list.reduce((t,x)=>t+(x.min||0),0)
      }));
  }

  /* ---- jeton ekonomisi ---- */
  function coins(){ return data.coins||0; }
  function ownedDecos(){ return (data.decos||[]).slice(); }
  function hasDeco(id){ return (data.decos||[]).indexOf(id)>=0; }
  function buyDeco(id, price){
    if(hasDeco(id)) return {ok:false, reason:'owned'};
    if((data.coins||0) < price) return {ok:false, reason:'poor'};
    data.coins-=price; data.decos.push(id); save();
    return {ok:true, coins:data.coins};
  }

  /* ---- bahçe: ada boyutu · zemin · ağaç rengi (hepsi jetonla) ---- */
  /* 2026-08-29 kullanıcı kararı: bahçeye ÜST SINIR YOK — istediği kadar büyütsün.
     Eski 16×16 sınırı kaldırıldı; fiyat artışı zaten doğal fren. */
  function plotSize(){ return Math.max(7, data.plotN || 7); }
  /* Fiyat artışı doğal fren; ama sınır kalkınca sonsuza gitmesin diye TAVAN var.
     Ölçüm (2026-08-29): 1 odak dakikası = 1 jeton. Tavan 2500 ⇒ en pahalı
     genişletme ~42 saat odak. Rakip Forest'ta en ucuz AĞAÇ bile ~33 saat. */
  function expandPrice(){ const k = plotSize() - 7; return Math.min(2500, 300 + k * 250); }
  function canExpand(){ return true; }
  function expandPlot(){
    if(!canExpand()) return {ok:false, reason:'max'};
    const f = expandPrice();
    if((data.coins||0) < f) return {ok:false, reason:'poor'};
    data.coins -= f; data.plotN = plotSize() + 1; save();
    return {ok:true, n:data.plotN, coins:data.coins};
  }

  function ownedGrounds(){ return (data.grounds||['grass']).slice(); }
  function activeGround(){ return data.ground || 'grass'; }
  function buyGround(id, price){
    if((data.grounds||[]).indexOf(id)>=0) return {ok:false, reason:'owned'};
    if((data.coins||0) < price) return {ok:false, reason:'poor'};
    data.coins -= price; data.grounds.push(id); data.ground = id; save();
    return {ok:true, coins:data.coins};
  }
  function setGround(id){ if((data.grounds||[]).indexOf(id)>=0){ data.ground=id; save(); return true; } return false; }

  /* ---- ağaç TÜRÜ (2026-08-29): renkten farklı — gövde/taç biçimi değişir ---- */
  function ownedTrees(){ return (data.trees||['klasik']).slice(); }
  function activeTree(){ return data.tree || 'klasik'; }
  function buyTree(id, price){
    if((data.trees||[]).indexOf(id)>=0) return {ok:false, reason:'owned'};
    if((data.coins||0) < price) return {ok:false, reason:'poor'};
    data.coins -= price; if(!data.trees) data.trees=['klasik'];
    data.trees.push(id); data.tree = id; save();
    return {ok:true, coins:data.coins};
  }
  function setTree(id){ if((data.trees||[]).indexOf(id)>=0){ data.tree=id; save(); return true; } return false; }

  function ownedPalettes(){ return (data.palettes||['forest']).slice(); }
  function activePalette(){ return data.palette || 'forest'; }
  function buyPalette(id, price){
    if((data.palettes||[]).indexOf(id)>=0) return {ok:false, reason:'owned'};
    if((data.coins||0) < price) return {ok:false, reason:'poor'};
    data.coins -= price; data.palettes.push(id); data.palette = id; save();
    return {ok:true, coins:data.coins};
  }
  function setPalette(id){ if((data.palettes||[]).indexOf(id)>=0){ data.palette=id; save(); return true; } return false; }

  function ownedWeathers(){ return (data.weathers||['clear']).slice(); }
  function activeWeather(){ return data.weather || 'clear'; }
  function buyWeather(id, price){
    if((data.weathers||[]).indexOf(id)>=0) return {ok:false, reason:'owned'};
    if((data.coins||0) < price) return {ok:false, reason:'poor'};
    data.coins-=price; data.weathers.push(id); data.weather=id; save();
    return {ok:true, coins:data.coins};
  }
  function setWeather(id){ if((data.weathers||[]).indexOf(id)>=0){ data.weather=id; save(); return true; } return false; }

  /* ---- ⑨ SESLER JETONLA (2026-08-28) ----
     Rakip sesleri 800–1200 jetona satıyor; bizde hepsi bedavaydı, jetonun harcanacak yeri azdı.
     KURAL: var olan hiçbir ses KİLİTLENMEDİ — bedava olanlar bedava kaldı, kilitliler EK olanlar.
     (Kural 1: mevcut kullanıcıdan bir şey geri alınmaz.) */
  /* 2026-08-29: brown/white/pink noise kaldırıldı (koddan üretiliyorlardı,
     hepsi aynı sesti). Bedava kalanlar: yağmur, şömine, kuş, orman, tik-tak. */
  const BEDAVA_SES = ['off','rain','tick','birds','forest','fire'];
  function ownedSounds(){ return (data.sounds||[]).slice(); }
  function hasSound(id){ return BEDAVA_SES.indexOf(id)>=0 || (data.sounds||[]).indexOf(id)>=0; }
  function buySound(id, price){
    if(hasSound(id)) return {ok:false, reason:'owned'};
    /* 🚨 Fiyata ÇAĞIRANIN verdiği değere güvenme — `buySound(id,0)` ile bedavaya açılabiliyordu.
       Gerçek fiyat tek kaynakta (audio.js PREMIUM_SES); burada ondan doğrulanır. */
    let gercek = 0;
    try{ gercek = (window.AkisAudio && AkisAudio.premiumFiyat) ? AkisAudio.premiumFiyat(id) : 0; }catch(e){}
    if(!gercek) return {ok:false, reason:'yok'};          // tanımsız ses satın alınamaz
    if((data.coins||0) < gercek) return {ok:false, reason:'poor'};
    if(!data.sounds) data.sounds=[];
    data.coins-=gercek; data.sounds.push(id); save();
    return {ok:true, coins:data.coins};
  }

  function reset(){ data={sessions:{},items:[],totalMinutes:0,streakFreezes:2,coins:0,decos:[],
                          plotN:7,grounds:['grass'],ground:'grass',palettes:['forest'],palette:'forest',
                          weathers:['clear'],weather:'clear',
                          sounds:[],customTags:[],activeTag:'study',dayStart:0,checkin:{son:null,seri:0}}; save(); }

  applyFreeze();   // açılışta: dün kaçtıysa ve hak varsa seriyi otomatik koru

  return { recordFocus, todayMinutes, totalHours, streak, last7,
           sessionsForDate, todaySessions, dayMinutes,
           items, itemCount, itemForMinutes, reset, today,
           timeline, coins, ownedDecos, hasDeco, buyDeco,
           plotSize, expandPrice, canExpand, expandPlot,
           ownedGrounds, activeGround, buyGround, setGround,
           ownedPalettes, activePalette, buyPalette, setPalette,
           ownedTrees, activeTree, buyTree, setTree,
           ownedWeathers, activeWeather, buyWeather, setWeather,
           badges, freezesLeft, exportData, importData, applyFreeze,
           /* 2026-08-28 eklenenler */
           dayStart, setDayStart,
           tags, tagById, activeTag, setActiveTag, addTag, removeTag, tagBreakdown,
           checkinDurum, checkinAl, gunlukGorevler, gorevOdulAl,
           aylikMucadele, aylikOdulAl,
           saatDagilimi, donemSerisi, donemToplam,
           ownedSounds, hasSound, buySound };
})();

/* `const` ile tanımlanan modül global nesneye YAZILMAZ (yalnız `var`/fonksiyon yazar).
   Kodun her yerinde `window.AkisStats && ...` biçiminde kontroller var; bu bağlama olmadan
   hepsi sessizce false dönüyordu (2026-08-27'de ölçülerek bulundu). */
try{ window.AkisStats = AkisStats; }catch(e){}
