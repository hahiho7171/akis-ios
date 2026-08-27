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
        if(!d.decos) d.decos=[];              // satin alinan susler
        return d;
      }
    }catch(e){}
    return {sessions:{}, items:[], totalMinutes:0, streakFreezes:2, coins:0, decos:[]};
  }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(data)); }catch(e){} }

  function dstr(d){
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function today(){ return dstr(new Date()); }

  // odak süresine göre ağaç büyüme evresi
  function itemForMinutes(min){
    if(min>=50) return {type:'bigtree', emoji:'🌳'};
    if(min>=30) return {type:'tree',    emoji:'🌲'};
    if(min>=10) return {type:'sapling', emoji:'🌿'};
    return {type:'sprout', emoji:'🌱'};
  }

  /* Tamamlanan/kesilen odak seansını kaydet. name = oturum adı (opsiyonel).
     Dönen: kazanılan ağaç öğesi (ödül balonu için) veya null. */
  function recordFocus(minutes, name, pale){
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
      name:(name||'').slice(0,40), ts:Date.now(), firefly:!!item.firefly, pale:!!pale
    });
    save();
    return item;
  }

  function todayMinutes(){ const s=data.sessions[today()]; return s?s.minutes:0; }
  function totalHours(){ return (data.totalMinutes/60); }

  function aktifGun(s){ return !!(s && (s.minutes>0 || s.frozen)); }   // dondurulmuş gün seriyi KIRMAZ
  function streak(){
    let n=0; const d=new Date();
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
      const dun=new Date(); dun.setDate(dun.getDate()-1);
      const evvel=new Date(); evvel.setDate(evvel.getDate()-2);
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
               lastFreezeWeek:s.lastFreezeWeek };
      save();
      return true;
    }catch(e){ return false; }
  }

  function last7(locale){
    const out=[]; let fmt;
    try{ fmt=new Intl.DateTimeFormat(locale||'en',{weekday:'short'}); }
    catch(e){ fmt=new Intl.DateTimeFormat('en',{weekday:'short'}); }
    for(let i=6;i>=0;i--){
      const d=new Date(); d.setDate(d.getDate()-i);
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

  function reset(){ data={sessions:{},items:[],totalMinutes:0,streakFreezes:2,coins:0,decos:[]}; save(); }

  applyFreeze();   // açılışta: dün kaçtıysa ve hak varsa seriyi otomatik koru

  return { recordFocus, todayMinutes, totalHours, streak, last7,
           sessionsForDate, todaySessions, dayMinutes,
           items, itemCount, itemForMinutes, reset, today,
           timeline, coins, ownedDecos, hasDeco, buyDeco,
           badges, freezesLeft, exportData, importData, applyFreeze };
})();
