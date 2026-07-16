/* ===== stats.js — istatistik + streak + gölet öğeleri (localStorage) ===== */
const AkisStats = (() => {
  const KEY='akis.stats.v1';
  let data = load();

  function load(){
    try{
      const d=JSON.parse(localStorage.getItem(KEY));
      if(d && d.sessions) return d;
    }catch(e){}
    return {sessions:{}, items:[], totalMinutes:0, streakFreezes:2};
  }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(data)); }catch(e){} }

  function dstr(d){
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function today(){ return dstr(new Date()); }

  // odak türüne göre gölet öğesi
  function itemForMinutes(min){
    if(min>=50) return {type:'koi',   emoji:'🐟'};
    if(min>=30) return {type:'lily',  emoji:'🪷'};
    if(min>=10) return {type:'reed',  emoji:'🌿'};
    return {type:'pebble', emoji:'⚪'};
  }

  /* Tamamlanan odak seansını kaydet. Dönen: kazanılan öğe (ödül balonu için) */
  function recordFocus(minutes){
    minutes=Math.round(minutes);
    if(minutes<1) return null;
    const t=today();
    if(!data.sessions[t]) data.sessions[t]={minutes:0,count:0};
    data.sessions[t].minutes+=minutes;
    data.sessions[t].count+=1;
    data.totalMinutes+=minutes;
    const item=itemForMinutes(minutes);
    // gece + 3+ seri → ateşböceği bonusu
    const isNight = new Date().getHours()>=20 || new Date().getHours()<6;
    if(isNight && streak()>=3) item.firefly=true;
    data.items.push({type:item.type, min:minutes, date:t, firefly:!!item.firefly});
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
      const s=data.sessions[dstr(d)];
      out.push({day:fmt.format(d), minutes:s?s.minutes:0});
    }
    return out;
  }

  function items(){ return data.items; }
  function itemCount(){ return data.items.length; }
  function reset(){ data={sessions:{},items:[],totalMinutes:0,streakFreezes:2}; save(); }

  return { recordFocus, todayMinutes, totalHours, streak, last7, items, itemCount,
           itemForMinutes, reset };
})();
