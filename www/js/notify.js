/* ===== notify.js — akşam seri-koruma bildirimi (Capacitor Local Notifications) =====
   Sadece native (Android/iOS) çalışır; web'de sessizce atlanır.
   Her gün 21:00'de, kullanıcının dilinde nazik bir hatırlatma planlar.
   Dil değişince yeniden planlanır. Erişim: window.Capacitor.Plugins.LocalNotifications. */
const AkisNotify = (() => {
  const ID = 4021;
  function cap(){ return window.Capacitor; }
  function isNative(){ try{ return !!(cap() && cap().isNativePlatform && cap().isNativePlatform()); }catch(e){ return false; } }
  function LN(){ try{ return cap() && cap().Plugins && cap().Plugins.LocalNotifications; }catch(e){ return null; } }
  const T = (k)=> (window.t ? window.t(k) : k);

  let granted=false;

  async function ensurePerm(){
    const ln=LN(); if(!ln) return false;
    try{
      let p=await ln.checkPermissions();
      if(p.display!=='granted'){ p=await ln.requestPermissions(); }
      return p && p.display==='granted';
    }catch(e){ return false; }
  }

  /* 21:00 hatırlatması — DÜRÜST sürüm (2026-08-08):
     "Bugün henüz odaklanmadın" mesajı, bugün seans YAPMIŞ kullanıcıya gitmesin.
     Tekrarlayan plan yerine tek seferlik plan: bugün odaklanılmadıysa bu akşam 21:00,
     odaklanıldıysa (veya saat geçtiyse) yarın 21:00. Her açılışta ve her seans bitiminde yeniden kurulur. */
  function nextAt(){
    const simdi=new Date();
    const bugunOdaklandi = !!(window.AkisStats && AkisStats.todayMinutes && AkisStats.todayMinutes()>0);
    const hedef=new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate(), 21, 0, 0);
    if(bugunOdaklandi || simdi>=hedef) hedef.setDate(hedef.getDate()+1);
    return hedef;
  }
  async function schedule(){
    const ln=LN(); if(!ln || !granted) return;
    try{
      await ln.cancel({ notifications:[{id:ID}] });
      await ln.schedule({ notifications:[{
        id: ID,
        title: T('notif_title'),
        body:  T('notif_body'),
        schedule: { at: nextAt(), allowWhileIdle:true }
      }]});
    }catch(e){}
  }
  async function onFocusDone(){
    // İZİN BURADA istenir (bağlam: ilk seans bitti, "serini koruyalım" anlamlı) — açılışta değil
    if(!granted) granted = await ensurePerm();
    schedule();   // bugünün "odaklanmadın" bildirimi iptal, yarına kur
  }

  /* ---- SEANS-SONU + KALICI BİLDİRİM (arka planda 25 dk dolunca sessiz kalmasın) ---- */
  const ID_END=4022, ID_ONGOING=4023;
  async function syncSession(s){
    const ln=LN(); if(!ln || !granted || !s) return;
    try{
      await ln.cancel({ notifications:[{id:ID_END},{id:ID_ONGOING}] });
      if(!s.running) return;
      const bitis = s.countUp ? null : new Date(Date.now() + Math.max(1, s.remaining)*1000);
      if(bitis){
        // faz dolduğu anda: çalışmaysa "mola zamanı", molaysa "devam edelim"
        await ln.schedule({ notifications:[{
          id: ID_END,
          title: T('notif_done_title'),
          body:  s.phase==='work' ? T('notif_done_body') : T('notif_break_over'),
          schedule: { at: bitis, allowWhileIdle:true }
        }]});
      }
      // kalıcı satır: kilit ekranında "odak sürüyor · bitiş 14:35" güveni (Android ongoing)
      const saat = bitis ? bitis.toTimeString().slice(0,5) : '';
      await ln.schedule({ notifications:[{
        id: ID_ONGOING,
        title: T('notif_ongoing_title'),
        body:  bitis ? T('notif_ongoing_body').replace('{time}', saat) : T('notif_ongoing_title'),
        ongoing: true, autoCancel: false
      }]});
    }catch(e){}
  }
  async function clearSession(){
    const ln=LN(); if(!ln) return;
    try{ await ln.cancel({ notifications:[{id:ID_END},{id:ID_ONGOING}] }); }catch(e){}
  }

  async function init(){
    if(!isNative()) return;
    // Açılışta izin SORMA (onboarding'i bölüyordu) — sadece verilmiş mi bak
    try{ const ln=LN(); if(ln){ const p=await ln.checkPermissions(); granted = p && p.display==='granted'; } }catch(e){}
    if(granted) await schedule();
    if(window.AkisI18n) AkisI18n.onChange(()=>{ if(granted) schedule(); });
  }

  return { init, schedule, onFocusDone, syncSession, clearSession };
})();
