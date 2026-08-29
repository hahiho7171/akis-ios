/* ===== notify.js — akşam seri-koruma bildirimi + seans bildirimleri (Capacitor Local Notifications) =====
   Sadece native (Android/iOS) çalışır; web'de sessizce atlanır.
   Erişim: window.Capacitor.Plugins.LocalNotifications.

   İKİ İŞ VAR:
   1) Akşam 21:00 "serini koruyalım" hatırlatması (aşağıda schedule/nextAt).
   2) SEANS BİLDİRİMLERİ: faz dolunca çalan uyarı + bildirim çubuğunda duran KALICI satır.

   🪤 2026-08-28'de düzeltilen üç tuzak (kullanıcı bildirdi: "süre yanlış / satır kayboluyor"):
      a) Kalıcı satır DEFAULT kanaldan gidiyordu → her tazelemede ses çıkarırdı.
         Artık ayrı, sessiz (IMPORTANCE_LOW) kanal: sessizce yerinde güncellenir.
      b) `phaseStart` olayı `start()`ten ÖNCE tetiklendiği için snapshot `running:false` geliyor,
         bu da satırı İPTAL ediyordu → mola/çalışma geçişinden sonra satır bir daha hiç görünmüyordu.
         Artık duraklatmada satır SİLİNMEZ, "Duraklatıldı" yazar; yalnız seans bitince silinir.
      c) iOS'ta kalıcı satır diye bir şey yok — her tazeleme yeni bir bildirim balonu demek.
         Bu yüzden iOS'ta satır YALNIZ uygulama arka plana geçerken bir kez yazılır. */
const AkisNotify = (() => {
  const ID = 4021;
  function cap(){ return window.Capacitor; }
  function isNative(){ try{ return !!(cap() && cap().isNativePlatform && cap().isNativePlatform()); }catch(e){ return false; } }
  function LN(){ try{ return cap() && cap().Plugins && cap().Plugins.LocalNotifications; }catch(e){ return null; } }
  function plat(){ try{ return (cap() && cap().getPlatform && cap().getPlatform()) || 'web'; }catch(e){ return 'web'; } }
  /* Ön plan servisi köprüsü (android/app/src/main/java/.../OdakBildirimPlugin.java).
     Yoksa null döner ve eski LocalNotifications yöntemi devreye girer. */
  function FGS(){ try{ return cap() && cap().Plugins && cap().Plugins.OdakBildirim; }catch(e){ return null; } }
  function sureKisa(s){
    const sn = s.countUp ? Math.round(s.elapsed||0) : Math.max(0, Math.round(s.remaining||0));
    const dk = Math.floor(sn/60), kalan = sn%60;
    return (dk<10?'0':'')+dk+':'+(kalan<10?'0':'')+kalan;
  }
  const T = (k,v)=> (window.t ? window.t(k,v) : k);

  let granted=false;

  async function ensurePerm(){
    const ln=LN(); if(!ln) return false;
    try{
      let p=await ln.checkPermissions();
      if(p.display!=='granted'){ p=await ln.requestPermissions(); }
      return p && p.display==='granted';
    }catch(e){ return false; }
  }

  /* İzni DIŞARIDAN istemek için (app.js ilk seans başlarken çağırır).
     Açılışta sorulmuyor — onboarding'i bölüyordu; ilk seans anı doğru bağlam:
     "süre dolunca haber vereceğiz". */
  async function ask(){
    if(granted) return true;
    granted = await ensurePerm();
    if(granted){
      schedule();
      /* İzin ANCAK burada alınıyor; push.js açılışta izinsiz olduğu için
         token alamamış olabilir. Şimdi tekrar dene. */
      try{ if(window.AkoraPush && AkoraPush.baslat) AkoraPush.baslat(); }catch(e){}
    }
    return granted;
  }

  /* ---- Kalıcı satır için SESSİZ kanal (Android 8+) ----
     IMPORTANCE_LOW (2) = bildirim çubuğunda görünür, ses/titreşim YOK.
     Satır her durum değişiminde yeniden yazıldığı için bu şart; yoksa her
     duraklat/devam et telefonu "ding" ettirirdi. */
  const KANAL_ODAK='akora_odak';
  let kanalHazir=false;
  async function ensureKanal(){
    if(kanalHazir) return;
    if(plat()!=='android'){ kanalHazir=true; return; }
    const ln=LN(); if(!ln || !ln.createChannel){ kanalHazir=true; return; }
    try{
      await ln.createChannel({
        id: KANAL_ODAK,
        name: T('notif_ongoing_title'),
        importance: 2,        // IMPORTANCE_LOW → sessiz
        visibility: 1,        // VISIBILITY_PUBLIC → kilit ekranında da görünsün
        vibration: false
      });
    }catch(e){}
    kanalHazir=true;
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
  /* ---- GERİ KAZANMA MERDİVENİ (2026-08-29) ----
     Kullanıcı isteği: "kullanıcıların çalışmadığı günlerde bildirim gönder."

     Tek bir akşam hatırlatması yetmiyordu: kullanıcı bir kez görmezden
     gelince bir daha hiç dokunulmuyordu. Şimdi ileriye doğru DÖRT bildirim
     birden kuruluyor — 1, 3, 7 ve 14 gün sonrası. Kullanıcı odaklandığı an
     dördü birden iptal edilip bugünden yeniden kurulur; yani bu bildirimler
     yalnız GERÇEKTEN uzaklaşan kişiye ulaşır.

     💸 Neden yerel (push değil): sunucu, hesap ve internet gerekmez,
        hesapsız kullanan HERKESE ulaşır ve bize hiçbir şeye mal olmaz.
        Push (`push.js`) yalnız BİZİM duyurularımız için.

     ⚠️ Android bekleyen alarm sınırı cömert değil; 4 tane güvenli sayı.
        Metin arttıkça bu listeyi büyütme, MERDIVEN'e satır ekle. */
  const MERDIVEN = [
    { id: ID,    gun: 0,  saat: 21, bas: 'notif_title',    gov: 'notif_body'    },
    { id: 4031,  gun: 3,  saat: 19, bas: 'notif_geri3_b',  gov: 'notif_geri3_g' },
    { id: 4032,  gun: 7,  saat: 19, bas: 'notif_geri7_b',  gov: 'notif_geri7_g' },
    { id: 4033,  gun: 14, saat: 19, bas: 'notif_geri14_b', gov: 'notif_geri14_g'}
  ];

  /* n gün sonrasının verilen saati. gun=0 ise nextAt() mantığı:
     bugün odaklanıldıysa ya da saat geçtiyse yarına at. */
  function merdivenZaman(m){
    if(m.gun === 0) return nextAt();
    const s = new Date();
    const h = new Date(s.getFullYear(), s.getMonth(), s.getDate() + m.gun, m.saat, 0, 0);
    return h;
  }

  async function schedule(){
    const ln=LN(); if(!ln || !granted) return;
    try{
      await ln.cancel({ notifications: MERDIVEN.map(m => ({ id: m.id })) });
      const liste = MERDIVEN.map(m => ({
        id: m.id,
        title: T(m.bas),
        body:  T(m.gov),
        schedule: { at: merdivenZaman(m), allowWhileIdle:true }
      }));
      await ln.schedule({ notifications: liste });
    }catch(e){}
  }
  async function onFocusDone(){
    if(!granted) granted = await ensurePerm();
    schedule();   // merdivenin tamamı iptal, bugünden yeniden kurulur
    /* Push konuları da tazelensin: kullanıcı geri döndüyse "uyuyan"dan çıksın,
       yoksa geri kazanma mesajını bir daha alır. */
    try{ if(window.AkoraPush && AkoraPush.esitle) AkoraPush.esitle(); }catch(e){}
  }

  /* ---- SEANS-SONU UYARISI + KALICI SATIR ---- */
  const ID_END=4022, ID_ONGOING=4023;

  function ikiHane(n){ return (n<10?'0':'')+n; }
  function saatMetni(d){ return ikiHane(d.getHours())+':'+ikiHane(d.getMinutes()); }

  /* Kalıcı satırın o anki metni. Sayaç durumuna göre üç hâl:
       çalışıyor + geri sayım → "Odak/Mola sürüyor" · "Bitiş: 14:35"
       çalışıyor + yukarı sayım (Flowtime) → "Odak sürüyor" (bitiş yok)
       duraklatılmış → "Duraklatıldı" · "Kalan 12 dk · devam etmek için dokun" */
  /* 🚨 29 Ağu 2026 — "BİTTİ" ile "DURAKLATILDI" birbirine karışıyordu.
     Seans arka planda dolduğunda sayaç duruyor (running=false, remaining=0) ve
     kalıcı satır "Duraklatıldı · 0 dk kaldı · devam etmek için dokun" yazıyordu.
     Cebinden telefonu çıkaran kullanıcı seansın bittiğini değil, kazara
     duraklattığını sanıyordu. Üstelik zamanlanmış "Süre doldu" bildirimi de
     tam o anda iptal ediliyor (JS canlı olduğu için) → tek uyarı yanlış metin
     kalıyordu. Emülatörde ölçülerek bulundu. */
  function bittiMi(s){
    return !s.running && !s.countUp && (s.remaining||0) <= 0 && (s.elapsed||0) > 0;
  }
  function bittiMetni(s){
    return { title: T('notif_done_title'),
             body:  (s.phase==='work') ? T('notif_done_body') : T('notif_break_over') };
  }

  function satirMetni(s){
    const molada = (s.phase!=='work');
    if(bittiMi(s)) return bittiMetni(s);
    if(!s.running){
      const kalanDk = s.countUp ? Math.floor(s.elapsed/60) : Math.max(0, Math.ceil(s.remaining/60));
      return { title: T('notif_paused'), body: T('notif_paused_body', {n:kalanDk}) };
    }
    const title = molada ? T('notif_ongoing_break') : T('notif_ongoing_title');
    if(s.countUp) return { title, body: title };
    const bitis = new Date(Date.now() + Math.max(1, s.remaining)*1000);
    return { title, body: T('notif_ongoing_body').replace('{time}', saatMetni(bitis)) };
  }

  /* Sayaç durumunu bildirimlere yansıtır.
     opts.arkaPlan=true → uygulama arka plana geçiyor (iOS'ta satır YALNIZ o an yazılır). */
  async function syncSession(s, opts){
    const ln=LN(); if(!ln || !granted || !s) return;
    const android = (plat()==='android');
    await ensureKanal();

    // 1) FAZ DOLUNCA ÇALAN UYARI — yalnız sayaç işlerken ve geri sayımlıyken anlamlı
    try{ await ln.cancel({ notifications:[{id:ID_END}] }); }catch(e){}
    if(s.running && !s.countUp && s.remaining>0){
      const bitis = new Date(Date.now() + Math.max(1, s.remaining)*1000);
      try{
        await ln.schedule({ notifications:[{
          id: ID_END,
          title: T('notif_done_title'),
          body:  s.phase==='work' ? T('notif_done_body') : T('notif_break_over'),
          schedule: { at: bitis, allowWhileIdle:true }
        }]});
      }catch(e){}
    }

    // 2) KALICI SATIR
    /* 🥇 ÖNCE ÖN PLAN SERVİSİ (Android): kalan süreyi SANİYE SANİYE canlı yazar.
       Rakip denetiminden (28 Ağu) çıkan sonuç: bildirimi zamanla güncellemenin tek yolu bu;
       WebView arka planda donduğu için JS tazeleyemiyor. Servis yoksa aşağıdaki eski yönteme düşer. */
    if(android && FGS()){
      const molada = (s.phase!=='work');
      try{
        await FGS().baslat({
          calisiyor:   !!s.running,
          yukariSayim: !!s.countUp,
          kalanSn:     Math.max(0, Math.round(s.remaining||0)),
          gecenSn:     Math.max(0, Math.round(s.elapsed||0)),
          baslik:      bittiMi(s) ? bittiMetni(s).title
                        : (s.running ? (molada ? T('notif_ongoing_break') : T('notif_ongoing_title'))
                                     : T('notif_paused')),
          duraklat:    bittiMi(s) ? bittiMetni(s).body
                        : T('notif_paused_body', {n: s.countUp ? Math.floor((s.elapsed||0)/60) : Math.max(0, Math.ceil((s.remaining||0)/60))}),
          bitisEki:    T('notif_left')      // "{sure} kaldı"
        });
        return;                              // servis üstlendi, ikinci bir satır yazma
      }catch(e){ /* servis açılamadı → eski yönteme düş */ }
    }

    // ↓ Eski yöntem (iOS + ön plan servisi çalışmayan Android). Duraklatmada da DURUR.
    if(!android && !(opts && opts.arkaPlan)) return;   // iOS: yalnız arka plana geçerken tazele
    const m = satirMetni(s);
    try{
      await ln.schedule({ notifications:[{
        id: ID_ONGOING,
        title: m.title,
        body:  m.body,
        channelId: android ? KANAL_ODAK : undefined,
        ongoing: true,        // Android: kaydırıp atılamaz
        autoCancel: false,    // dokununca kaybolmaz — uygulama açılır, satır kalır
        silent: true          // iOS: uygulama öndeyken balon çıkarmasın
      }]});
    }catch(e){}
  }

  async function clearSession(){
    try{ if(FGS()) await FGS().durdur(); }catch(e){}     // ön plan servisini kapat
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

  return { init, schedule, ask, onFocusDone, syncSession, clearSession, izinVarMi:()=>granted };
})();

/* `const` ile tanımlanan modül global nesneye YAZILMAZ (yalnız `var`/fonksiyon yazar).
   Kodun her yerinde `window.AkisNotify && ...` biçiminde kontroller var; bu bağlama olmadan
   hepsi sessizce false dönüyordu (2026-08-27'de ölçülerek bulundu). */
try{ window.AkisNotify = AkisNotify; }catch(e){}
