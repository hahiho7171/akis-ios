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

  async function schedule(){
    const ln=LN(); if(!ln || !granted) return;
    try{
      await ln.cancel({ notifications:[{id:ID}] });
      await ln.schedule({ notifications:[{
        id: ID,
        title: T('notif_title'),
        body:  T('notif_body'),
        schedule: { on: { hour:21, minute:0 }, allowWhileIdle:true }
      }]});
    }catch(e){}
  }

  async function init(){
    if(!isNative()) return;
    granted = await ensurePerm();
    await schedule();
    if(window.AkisI18n) AkisI18n.onChange(()=>{ schedule(); });
  }

  return { init, schedule };
})();
