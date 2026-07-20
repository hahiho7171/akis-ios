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
        return d;
      }
    }catch(e){}
    return {sessions:{}, items:[], totalMinutes:0, streakFreezes:2};
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
  function recordFocus(minutes, name){
    minutes=Math.round(minutes);
    if(minutes<1) return null;
    const t=today();
    if(!data.sessions[t]) data.sessions[t]={minutes:0,count:0};
    data.sessions[t].minutes+=minutes;
    data.sessions[t].count+=1;
    data.totalMinutes+=minutes;
    const item=itemForMinutes(minutes);
    // gece + 3+ seri → ateşböceği bonusu (ormanda gece ışıltısı)
    const h=new Date().getHours();
    const isNight = h>=20 || h<6;
    if(isNight && streak()>=3) item.firefly=true;
    data.items.push({
      type:item.type, min:minutes, date:t,
      name:(name||'').slice(0,40), ts:Date.now(), firefly:!!item.firefly
    });
    save();
    return item;
  }

  function todayMinutes(){ const s=data.sessions[today()]; return s?s.minutes:0; }
  function totalHours(){ return (data.totalMinutes/60); }

  function streak(){
    let n=0; const d=new Date();
    // bugün 0 ise dünden geriye bak (bugünü henüz kırmasın)
    if(!(data.sessions[dstr(d)]&&data.sessions[dstr(d)].minutes>0)) d.setDate(d.getDate()-1);
    while(true){
      const s=data.sessions[dstr(d)];
      if(s && s.minutes>0){ n++; d.setDate(d.getDate()-1); }
      else break;
    }
    return n;
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
  function reset(){ data={sessions:{},items:[],totalMinutes:0,streakFreezes:2}; save(); }

  return { recordFocus, todayMinutes, totalHours, streak, last7,
           sessionsForDate, todaySessions, dayMinutes,
           items, itemCount, itemForMinutes, reset, today };
})();
