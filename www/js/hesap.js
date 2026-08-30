/* ============================================================
   AKORA — HESAP ve BULUT YEDEK  (2026-08-29)

   Kullanıcı isteği: e-posta+şifre, Google ile giriş, Apple ile giriş;
   veriler bulutta dursun ki telefon değişince kaybolmasın.

   🚨 TEMEL KURAL: HESAP ZORUNLU DEĞİL.
      Uygulamanın tamamı hesapsız çalışmaya devam eder — bu ürünün
      rakipten (Forest hesapsızken "Sınırlı Mod"a düşüyor) ayrıştığı
      yer. Giriş YALNIZ buluta yedekleme içindir.

   🚨 Neden native eklenti, neden web SDK değil:
      Google, gömülü WebView içinde OAuth girişini ENGELLİYOR.
      Firebase web SDK ile "Google ile Giriş" bir WebView'de hiç
      çalışmaz. Bu yüzden @capacitor-firebase/authentication (native)
      kullanılıyor.

   Bulut düzeni (firebase/firestore.rules ile birebir uyumlu):
      kullanicilar/{uid}            → profil + sonGoruldu (push için)
      kullanicilar/{uid}/veri/yedek → istatistik + kitaplık anlık görüntüsü

   ⚠️ Yedek TEK BELGE. Firestore belge sınırı 1 MB; kurallarda 900 KB
      üst sınır var. Yıllar sonra veri büyürse parçalamak gerekir —
      `yedekBoyutu()` bunu ölçüp uyarır.
   ============================================================ */
(function(){
  'use strict';
  const $ = s => document.querySelector(s);

  function T(k, v){
    try{ return (window.AkisI18n && AkisI18n.t) ? AkisI18n.t(k, v) : ''; }catch(e){ return ''; }
  }
  /* t() karşılığı yoksa ANAHTARI döndürür — yedeğe düşmek için eşitlik bakılır */
  function M(k, yedek, v){ const s = T(k, v); return (s && s !== k) ? s : yedek; }
  function esc(x){
    return String(x==null?'':x).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  const Auth = () => { try{ return Capacitor.Plugins.FirebaseAuthentication || null; }catch(e){ return null; } };
  const DB   = () => { try{ return Capacitor.Plugins.FirebaseFirestore || null; }catch(e){ return null; } };
  function yerli(){
    try{ return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); }
    catch(e){ return false; }
  }
  function iOS(){
    try{ return (window.Capacitor && Capacitor.getPlatform && Capacitor.getPlatform() === 'ios'); }
    catch(e){ return false; }
  }

  let kullanici = null;      // {uid, email, displayName} | null
  let mesgul = false;

  /* ---------------- ZAMAN AŞIMI (2026-08-30) ----------------
     🚨 2.8.1 KUSURU: sar() bir sözü sonsuza kadar bekliyordu. Native hesap
        seçici kaydırılarak kapatıldığında signInWithGoogle() sözü HİÇ çözülmüyor;
        `mesgul` true takılı kalıyor ve paneldeki HER düğme sessizce ölüyordu.
        Kullanıcı bunu "ayarlarda hesabıma tıklayınca Google tıklanmıyor" diye
        bildirdi. Artık her işlemin bir süresi var; süre dolunca panel açılır.
     ℹ️ Zaman aşımı native işlemi İPTAL ETMEZ, yalnız paneli serbest bırakır.
        Giriş geç de olsa tamamlanırsa `authStateChange` dinleyicisi ekranı tazeler. */
  const SURE_GIRIS = 45000;   // native hesap seçici açıkken kullanıcı da bekletir
  const SURE_AG    = 25000;   // yalnız ağ işlemi (yedekle / geri yükle / şifre)
  function sureli(fn, ms){
    return Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, ret) => setTimeout(() => ret({ code:'akora/zaman-asimi' }), ms))
    ]);
  }

  /* ---------------- İLK AÇILIŞ MÜHRÜ (2026-08-30) ----------------
     🚨 KULLANICI BİLDİRİMİ: "Google çıkmadan otomatikman giriş yaptı."
        İki ayrı sebebi vardı:
        · Android: Auto Backup, Firebase oturumunu (SharedPreferences) geri
          yüklüyordu → android/app/src/main/res/xml/yedek_kurallari.xml ile kapatıldı.
        · iOS: Keychain uygulama SİLİNSE BİLE telefonda kalır; yeniden kurunca
          oturum aynen geri gelir. Orada yedek kuralı yoktur — çözüm burada olmalı.
     ✅ KURAL: uygulama verisi TERTEMİZ (yeni kurulum) ama native tarafta oturum
        duruyorsa, o oturum bu kurulumun değildir → kapatılır, kullanıcı hesabını
        kendi seçer. Güncellemede (veri var, mühür yok) hiçbir şey yapılmaz. */
  const MUHUR = 'akora.kurulum';
  function yerelVeriVarMi(){
    try{
      const anahtarlar = ['akis.stats.v1','akis.settings.v1','akora.plot.v1','akis.kitap.v1','akis.lang'];
      for(let i=0;i<anahtarlar.length;i++) if(localStorage.getItem(anahtarlar[i])) return true;
      return false;
    }catch(e){ return true; }   // okuyamıyorsak riskli iş yapma: oturuma dokunma
  }
  async function muhurKontrol(){
    let m = null;
    try{ m = localStorage.getItem(MUHUR); }catch(e){ return; }
    if(m) return;                                  // bu kurulum daha önce mühürlendi
    const temizKurulum = !yerelVeriVarMi();
    try{ localStorage.setItem(MUHUR, new Date().toISOString()); }catch(e){}
    if(!temizKurulum) return;                      // güncelleme — girişli kullanıcı girişli kalsın
    try{ const a = Auth(); if(a) await sureli(() => a.signOut(), 8000); }catch(e){}
  }

  /* ---------------- yedek verisi ---------------- */

  /* Yedeğin içeriği artık TEK YERDE: js/yedek.js › AkoraYedek.
     Panoya aktarma (app.js) ve bulut yedeği aynı gerçeği paylaşır — eskiden
     ikisi ayrı kuruluyordu ve ikisinde de Bahçem yerleşimi + ayarlar eksikti. */
  function yedekTopla(){
    try{ return AkoraYedek.topla(); }catch(e){ return {app:'akis', v:1}; }
  }
  function yedekBoyutu(o){
    try{ return new Blob([JSON.stringify(o)]).size; }catch(e){ return JSON.stringify(o).length; }
  }
  function yedekUygula(o){
    try{ return AkoraYedek.uygula(o); }catch(e){ return false; }
  }

  /* ---------------- bulut ---------------- */

  function yol(uid){ return 'kullanicilar/' + uid; }

  async function bulutaYaz(){
    const db = DB(); if(!db || !kullanici) return {ok:false, sebep:'girissiz'};
    const veri = yedekTopla();
    const boyut = yedekBoyutu(veri);
    if(boyut > 850000){
      // Kurallardaki 900 KB sınırına yaklaşıldı — sessizce başarısız olmasın
      return {ok:false, sebep:'buyuk', boyut};
    }
    try{
      await db.setDocument({
        reference: yol(kullanici.uid),
        data: {
          email: kullanici.email || '',
          ad: kullanici.displayName || '',
          sonGoruldu: new Date().toISOString(),
          /* push bildirimi "kaç gündür çalışmadı" hesabı bunu okuyacak */
          sonOdakGunu: (function(){ try{ return AkisStats.today(); }catch(e){ return ''; } })()
        },
        merge: true
      });
      await db.setDocument({
        reference: yol(kullanici.uid) + '/veri/yedek',
        data: { json: JSON.stringify(veri), guncellendi: new Date().toISOString(), boyut },
        merge: false
      });
      try{ localStorage.setItem('akora.sonYedek', new Date().toISOString()); }catch(e){}
      return {ok:true, boyut};
    }catch(e){
      return {ok:false, sebep:'ag', mesaj: e && e.message};
    }
  }

  async function buluttanOku(){
    const db = DB(); if(!db || !kullanici) return {ok:false, sebep:'girissiz'};
    try{
      const r = await db.getDocument({ reference: yol(kullanici.uid) + '/veri/yedek' });
      const d = r && r.snapshot && r.snapshot.data;
      if(!d || !d.json) return {ok:false, sebep:'yok'};
      const o = JSON.parse(d.json);
      return {ok:true, veri:o, guncellendi: d.guncellendi};
    }catch(e){
      return {ok:false, sebep:'ag', mesaj: e && e.message};
    }
  }

  /* ---------------- giriş ---------------- */

  function hataMetni(e){
    const m = String((e && (e.message || e.code)) || '');
    if(/zaman-asimi/.test(m)) return M('h_zaman_asimi','İşlem uzun sürdü. İnternetini kontrol edip tekrar dene.');
    if(/password.*invalid|wrong-password|INVALID_LOGIN/i.test(m)) return M('h_hata_sifre','E-posta veya şifre yanlış.');
    if(/user-not-found|EMAIL_NOT_FOUND/i.test(m))                 return M('h_hata_yok','Bu e-postayla kayıtlı hesap yok.');
    if(/email-already-in-use|EMAIL_EXISTS/i.test(m))              return M('h_hata_kayitli','Bu e-posta zaten kayıtlı. Giriş yap.');
    if(/weak-password|WEAK_PASSWORD/i.test(m))                    return M('h_hata_zayif','Şifre en az 6 karakter olmalı.');
    if(/invalid-email/i.test(m))                                  return M('h_hata_eposta','E-posta adresi geçersiz.');
    if(/network|timeout|UNAVAILABLE/i.test(m))                    return M('h_hata_ag','İnternet bağlantısı yok gibi. Sonra dene.');
    if(/canceled|cancelled|12501|user-cancel/i.test(m))           return '';   // kullanıcı vazgeçti — hata gösterme
    return M('h_hata_genel','Bir şeyler ters gitti. Sonra dene.');
  }

  async function kullaniciTazele(){
    const a = Auth(); if(!a) return null;
    try{
      const r = await a.getCurrentUser();
      kullanici = (r && r.user) ? { uid:r.user.uid, email:r.user.email, displayName:r.user.displayName } : null;
    }catch(e){ kullanici = null; }
    ciz();
    return kullanici;
  }

  async function girisEposta(kayitMi){
    const a = Auth(); if(!a) return uyar(M('h_yalniz_uygulama','Bu özellik yalnız uygulamada çalışır.'));
    const e = ($('#h-eposta')||{}).value || '';
    const s = ($('#h-sifre')||{}).value || '';
    if(!e.trim() || !s) return uyar(M('h_bos','E-posta ve şifreyi doldur.'));
    if(kayitMi && s.length < 6) return uyar(M('h_hata_zayif','Şifre en az 6 karakter olmalı.'));
    await sar(async () => {
      if(kayitMi) await a.createUserWithEmailAndPassword({ email:e.trim(), password:s });
      else        await a.signInWithEmailAndPassword({ email:e.trim(), password:s });
      await kullaniciTazele();
      await girisSonrasi();
    });
  }

  /* 🚨 CREDENTIAL MANAGER KULLANILMIYOR (2026-08-30, cihazda görüldü)
     Eklentinin Android varsayılanı `useCredentialManager: true` → Google'ın yeni
     Credential Manager API'si. Kullanıcının telefonunda bu çağrı hesap seçiciyi
     HİÇ AÇMADI, ne `onResult` ne `onError` döndü ve ekran tamamen kilitlendi:
     panelin çarpısı bile çalışmıyordu, 45 sn'lik JS zaman aşımı da devreye giremedi
     (arayüz bloke olunca setTimeout da ateşlenemiyor).
     `useCredentialManager: false` eklentiyi klasik `GoogleSignInClient` yoluna
     sokar: hesap seçici ayrı bir Activity olarak açılır, kullanıcı iptal etse bile
     sonuç DÖNER, arayüz kilitlenmez.
     Ölçümle elenenler (tekrar deneme): APK imzası Firebase'de kayıtlı ·
     googleid sınıfları (116) pakette · `default_web_client_id` APK'da doğru. */
  /* HESAP SEÇİCİYİ GERİ GETİR (2026-08-30)
     Klasik GoogleSignInClient yolunda Android son kullanılan hesabı hatırlıyor ve
     seçiciyi atlıyor. Eklentinin signOut()'u yalnız Credential Manager durumunu
     temizlediği için işe yaramıyor. Yerel `GoogleHesap` eklentisi (proje kaynağında,
     android/app/src/main/java/.../GoogleHesapPlugin.java) doğrudan
     GoogleSignInClient.signOut() çağırıyor → seçici tekrar açılıyor.
     ⚠️ Bu adım girişin ÖNÜNÜ TIKAMAZ: eklenti yoksa (iOS/tarayıcı) atlanır,
     asılırsa 6 sn sonra yine de girişe devam edilir. */
  const SURE_HESAP_UNUT = 6000;
  function GH(){ try{ return Capacitor.Plugins.GoogleHesap || null; }catch(e){ return null; } }
  async function googleHesabiUnut(){
    const g = GH(); if(!g || !g.unut) return;
    try{
      await Promise.race([
        g.unut(),
        new Promise(cz => setTimeout(cz, SURE_HESAP_UNUT))
      ]);
    }catch(e){}
  }

  async function girisGoogle(){
    const a = Auth(); if(!a) return uyar(M('h_yalniz_uygulama','Bu özellik yalnız uygulamada çalışır.'));
    await sar(async () => {
      await googleHesabiUnut();
      await a.signInWithGoogle({ useCredentialManager:false });
      await kullaniciTazele();
      await girisSonrasi();
    }, SURE_GIRIS);
  }

  async function girisApple(){
    const a = Auth(); if(!a) return uyar(M('h_yalniz_uygulama','Bu özellik yalnız uygulamada çalışır.'));
    await sar(async () => {
      await a.signInWithApple();
      await kullaniciTazele();
      await girisSonrasi();
    }, SURE_GIRIS);
  }

  async function cikis(){
    const a = Auth(); if(!a) return;
    await sar(async () => {
      /* Çıkarken son hâli buluta yaz — kullanıcı emeğini kaybetmesin */
      try{ await bulutaYaz(); }catch(e){}
      await a.signOut();
      kullanici = null;
      ciz();
    });
  }

  /* ---------- HESABI SİL ----------
     🚨 ZORUNLU: Google Play ve Apple, hesap açtıran uygulamalarda hem
        uygulama içinden hem de web'den hesap silme yolu şart koşuyor
        (Play: "Data deletion", Apple: 5.1.1(v)). Bu düğme olmadan sürüm
        reddedilir.

     Ne silinir: buluttaki kullanıcı belgesi + tüm alt koleksiyonlar
     (yedek, cihaz kayıtları) ve Firebase kimliği.
     Ne KALIR: telefonun kendi içindeki veriler. Çünkü hesap zaten
     zorunlu değil; kullanıcı "hesabımı sil" derken "ormanımı sil"
     demiyor. Bunu ekranda da açıkça yazıyoruz.

     🪤 Firebase, kimliği silmeden önce YAKIN ZAMANDA giriş yapılmış
        olmasını ister (auth/requires-recent-login). O hataya düşersek
        kullanıcıdan tekrar giriş yapmasını isteriz — sessizce başarısız
        olmak, "sildim sandım ama silinmedi" demektir. */
  async function hesabiSil(){
    const a = Auth(); if(!a || !kullanici) return;
    const u1 = M('h_sil_onay1','Hesabın ve buluttaki yedeğin KALICI olarak silinecek. Bu telefondaki ormanın ve kayıtların SİLİNMEZ, burada kalır. Devam edilsin mi?');
    if(!window.confirm(u1)) return;
    const u2 = M('h_sil_onay2','Son kez soruyoruz: bu işlem geri alınamaz. Hesabı sil?');
    if(!window.confirm(u2)) return;

    await sar(async () => {
      const uid = kullanici && kullanici.uid;
      const db = DB();

      /* 🚨 29 Ağu 2026 — ÖNCE TAZELİK KONTROLÜ.
         Firebase, hesap silmek için "yakın zamanda giriş" şartı koyuyor
         (~5 dk). Eski hâli önce buluttaki belgeleri siliyor, SONRA kimliği
         silmeye çalışıp `requires-recent-login` yiyordu. Sonuç: kullanıcının
         hesabı duruyor ama YEDEĞİ ÇOKTAN SİLİNMİŞ oluyordu. Emülatörde
         birebir yaşandı. Artık hiçbir şeye dokunmadan önce bakıyoruz. */
      try{
        const tk = await a.getIdTokenResult({ forceRefresh: true });
        const yas = Date.now() - ((tk && tk.authTime) || 0);
        if(tk && tk.authTime && yas > 4 * 60 * 1000){
          uyar(M('h_sil_tekrar_giris','Güvenlik için tekrar giriş yapman gerekiyor. Çıkış yapıp yeniden gir, sonra silmeyi dene.'));
          return;
        }
      }catch(e){ /* eski eklenti sürümü: kontrol yapılamadı, aşağıdaki yakalama devrede */ }

      /* Önce bulut verisi, sonra kimlik. Ters sırada yapılırsa kimlik
         silindikten sonra güvenlik kuralları yazmayı reddeder ve veri
         sahipsiz kalır. */
      if(uid && db){
        for(const yol of ['kullanicilar/' + uid + '/veri/yedek', 'kullanicilar/' + uid]){
          try{ await db.deleteDocument({ reference: yol }); }catch(e){}
        }
        try{
          const tk = localStorage.getItem('akora.push.token') || '';
          if(tk) await db.deleteDocument({ reference: 'kullanicilar/' + uid + '/cihazlar/' + tk.slice(0,60) });
        }catch(e){}
      }
      try{
        await a.deleteUser();
      }catch(e){
        const kod = (e && (e.code || e.message) || '') + '';
        if(/recent-login|requires-recent/i.test(kod)){
          uyar(M('h_sil_tekrar_giris','Güvenlik için tekrar giriş yapman gerekiyor. Çıkış yapıp yeniden gir, sonra silmeyi dene.'));
          return;
        }
        throw e;
      }
      try{ localStorage.removeItem('akora.sonYedek'); }catch(e){}
      try{ localStorage.removeItem('akora.push.token'); }catch(e){}
      kullanici = null;
      ciz();
      uyar(M('h_sil_bitti','Hesabın ve buluttaki yedeğin silindi. Uygulama bu telefonda hesapsız çalışmaya devam ediyor.'), true);
    }, SURE_GIRIS);
  }

  async function sifreSifirla(){
    const a = Auth(); if(!a) return;
    const e = ($('#h-eposta')||{}).value || '';
    if(!e.trim()) return uyar(M('h_sifirla_eposta','Önce e-postanı yaz.'));
    await sar(async () => {
      await a.sendPasswordResetEmail({ email: e.trim() });
      uyar(M('h_sifirla_gitti','Şifre sıfırlama bağlantısı e-postana gönderildi.'), true);
    });
  }

  /* Girişten sonra: buluttaki yedek cihazdakinden YENİYSE sor.
     🚨 Sessizce üzerine yazma — kullanıcının aylarca biriktirdiği
        ormanı ve kitap geçmişini uyarmadan silmek kabul edilemez. */
  async function girisSonrasi(){
    /* Push cihaz kaydı ancak uid varken yazılabiliyor; token uygulama
       açılışında (girişten ÖNCE) geliyor. Girişten sonra bir kez tazelenmezse
       `kullanicilar/{uid}/cihazlar` belgesi hiç oluşmuyor. */
    try{ if(window.AkoraPush && AkoraPush.tokenTazele) AkoraPush.tokenTazele(); }catch(e){}
    try{ if(window.AkoraPush && AkoraPush.esitle) AkoraPush.esitle(); }catch(e){}

    const r = await buluttanOku();
    if(!r.ok){
      // bulutta yedek yoksa ilk yüklemeyi yap
      await bulutaYaz();
      uyar(M('h_yedeklendi','Verilerin buluta yedeklendi.'), true);
      return;
    }
    const yerelDk = (function(){ try{ return AkisStats.totalHours() * 60; }catch(e){ return 0; } })();
    const bulutDk = (function(){
      try{ return (r.veri.stats && r.veri.stats.totalMinutes) || 0; }catch(e){ return 0; }
    })();

    if(bulutDk > yerelDk + 1){
      const onay = window.confirm(
        M('h_geri_sor','Bulutta daha fazla veri var ({b} dakika), bu cihazda {y} dakika. Buluttaki veriyi yükleyelim mi?')
          .replace('{b}', Math.round(bulutDk)).replace('{y}', Math.round(yerelDk))
      );
      if(onay){
        yedekUygula(r.veri);
        uyar(M('h_geri_yuklendi','Buluttaki verin yüklendi.'), true);
        setTimeout(() => location.reload(), 800);
        return;
      }
    }
    await bulutaYaz();
    uyar(M('h_yedeklendi','Verilerin buluta yedeklendi.'), true);
  }

  /* ---------------- yardımcılar ---------------- */

  function uyar(metin, iyi){
    const k = $('#h-mesaj');
    if(!k) return;
    if(!metin){ k.textContent = ''; k.className = 'h-mesaj'; return; }
    k.textContent = metin;
    k.className = 'h-mesaj' + (iyi ? ' iyi' : ' kotu');
  }

  async function sar(fn, ms){
    if(mesgul) return;
    mesgul = true;
    ciz();                                   // "bekleniyor" hâli de burada çiziliyor
    try{ await sureli(fn, ms || SURE_AG); uyar(''); }
    catch(e){ const m = hataMetni(e); if(m) uyar(m); }
    finally{ mesgul = false; ciz(); }
  }

  /* ---------------- ekran ---------------- */

  /* ciz() = gövdeyi çiz + işlem sürüyorsa GÖRÜNÜR bekleme hâli.
     🚨 2.8.1 KUSURU: işlem sırasında ekranda hiçbir şey değişmiyordu; kullanıcı
        basıyor, hiçbir şey olmuyor sanıp "tıklanmıyor" diyordu. */
  function ciz(){
    cizGovde();
    const box = $('#h-govde');
    if(!box) return;
    box.classList.toggle('h-mesgul', !!mesgul);
    if(mesgul){
      box.insertAdjacentHTML('beforeend',
        '<div class="h-bekle"><span class="h-donen" aria-hidden="true"></span>' +
        esc(M('h_bekle','Bekleniyor…')) + '</div>');
    }
  }

  function cizGovde(){
    const box = $('#h-govde');
    if(!box) return;

    if(!yerli()){
      box.innerHTML = '<p class="h-not">' +
        esc(M('h_yalniz_uygulama','Bu özellik yalnız uygulamada çalışır.')) + '</p>';
      return;
    }

    if(kullanici){
      let son = '';
      try{ son = localStorage.getItem('akora.sonYedek') || ''; }catch(e){}
      box.innerHTML =
        '<div class="h-kimlik">' +
          '<span class="h-avatar">' + esc((kullanici.email || '?').charAt(0).toUpperCase()) + '</span>' +
          '<span class="h-bilgi"><b>' + esc(kullanici.displayName || M('h_hesabim','Hesabım')) + '</b>' +
          '<i>' + esc(kullanici.email || '') + '</i></span>' +
        '</div>' +
        (son ? '<p class="h-not">' + esc(M('h_son_yedek','Son yedek: {t}').replace('{t}', new Date(son).toLocaleString())) + '</p>' : '') +
        '<button class="kt-birincil" id="h-yedekle">' + esc(M('h_yedekle','Şimdi yedekle')) + '</button>' +
        '<button class="h-ikincil" id="h-getir">' + esc(M('h_getir','Buluttan geri yükle')) + '</button>' +
        '<p class="h-mesaj" id="h-mesaj"></p>' +
        '<button class="text-btn" id="h-cikis">' + esc(M('h_cikis','Çıkış yap')) + '</button>' +
        '<button class="text-btn h-sil" id="h-sil">' + esc(M('h_sil','Hesabımı sil')) + '</button>' +
        '<p class="h-not h-sil-not">' + esc(M('h_sil_aciklama','Hesabını silmek buluttaki yedeğini siler. Bu telefondaki ormanın ve kayıtların yerinde kalır.')) + '</p>';

      const y = $('#h-yedekle');
      if(y) y.addEventListener('click', () => sar(async () => {
        const r = await bulutaYaz();
        if(r.ok) uyar(M('h_yedeklendi','Verilerin buluta yedeklendi.'), true);
        else if(r.sebep === 'buyuk') uyar(M('h_cok_buyuk','Verin bulut sınırına yaklaştı. Bize haber ver.'));
        else uyar(M('h_hata_ag','İnternet bağlantısı yok gibi. Sonra dene.'));
        ciz();
      }));
      const g = $('#h-getir');
      if(g) g.addEventListener('click', () => sar(async () => {
        const r = await buluttanOku();
        if(!r.ok) return uyar(r.sebep === 'yok'
          ? M('h_bulut_bos','Bulutta yedek yok.')
          : M('h_hata_ag','İnternet bağlantısı yok gibi. Sonra dene.'));
        if(!window.confirm(M('h_getir_onay','Bu cihazdaki veri buluttakiyle DEĞİŞTİRİLECEK. Devam edilsin mi?'))) return;
        yedekUygula(r.veri);
        uyar(M('h_geri_yuklendi','Buluttaki verin yüklendi.'), true);
        setTimeout(() => location.reload(), 800);
      }));
      const c = $('#h-cikis');
      if(c) c.addEventListener('click', cikis);
      const sl = $('#h-sil');
      if(sl) sl.addEventListener('click', hesabiSil);
      return;
    }

    /* --- giriş yapılmamış --- */
    box.innerHTML =
      '<p class="h-not">' + esc(M('h_tanitim','Hesap ZORUNLU DEĞİL. Uygulamanın tamamı hesapsız çalışır. Giriş yaparsan verilerin buluta yedeklenir ve telefon değişince kaybolmaz.')) + '</p>' +
      '<label class="kt-alan"><span>' + esc(M('h_eposta','E-posta')) + '</span>' +
        '<input id="h-eposta" class="giris" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false"></label>' +
      '<label class="kt-alan"><span>' + esc(M('h_sifre','Şifre')) + '</span>' +
        '<input id="h-sifre" class="giris" type="password" autocomplete="current-password"></label>' +
      '<p class="h-mesaj" id="h-mesaj"></p>' +
      '<button class="kt-birincil" id="h-giris">' + esc(M('h_giris','Giriş yap')) + '</button>' +
      '<button class="h-ikincil" id="h-kayit">' + esc(M('h_kayit','Hesap oluştur')) + '</button>' +
      '<button class="text-btn h-unut" id="h-unuttum">' + esc(M('h_unuttum','Şifremi unuttum')) + '</button>' +
      '<div class="h-ayrac"><span>' + esc(M('h_veya','veya')) + '</span></div>' +
      '<button class="h-saglayici" id="h-google">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.4 3-4.1 5.6-4.1z"/></svg>' +
        esc(M('h_google','Google ile devam et')) + '</button>' +
      (iOS()
        ? '<button class="h-saglayici h-apple" id="h-apple">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.3 12.8c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.2 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.5zM14 5.4c.6-.8 1-1.9.9-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-.9 2.9 1 .1 2-.5 2.7-1.3z"/></svg>' +
            esc(M('h_apple','Apple ile devam et')) + '</button>'
        : '');

    const gi = $('#h-giris');   if(gi) gi.addEventListener('click', () => girisEposta(false));
    const ka = $('#h-kayit');   if(ka) ka.addEventListener('click', () => girisEposta(true));
    const un = $('#h-unuttum'); if(un) un.addEventListener('click', sifreSifirla);
    const go = $('#h-google');  if(go) go.addEventListener('click', girisGoogle);
    const ap = $('#h-apple');   if(ap) ap.addEventListener('click', girisApple);
    const sf = $('#h-sifre');
    if(sf) sf.addEventListener('keydown', e => { if(e.key === 'Enter') girisEposta(false); });
  }

  /* ================= HESAP TEKLİF KARTI (2026-08-30) =================
     Kullanıcı İLK odak seansını bitirip ana ekrana döndüğünde BİR KEZ çıkar.
     "Şimdilik geç" denirse bir daha ÇIKMAZ.

     🚨 NEDEN AÇILIŞTA DEĞİL: Apple 5.1.1(v) "kullanıcıya özel olmayan içerik
        ve özellikler için kayıt zorunlu tutulamaz" diyor; bu uygulama Apple'dan
        zaten iki kez ret yedi. Ayrıca 20 dilin mağaza metni ve panelin kendi
        tanıtımı "hesapsız çalışır" diyor — açılışta duvar koymak o vaadi bozar.
        Rakipler de böyle: Forest, Focus To-Do ve Flora'nın hiçbiri açılışta
        giriş istemiyor, hesabı eşitleme gerektiğinde teklif ediyor.
     Doğru an: kaybedilecek bir şey OLUŞTUĞU an — ilk ağaç dikildiğinde. */
  const TEKLIF_MUHUR = 'akora.hesapTeklifi';

  function teklifGoster(){
    if(document.getElementById('hesap-kapi')) return;

    const k = document.createElement('div');
    k.id = 'hesap-kapi';
    k.className = 'hesap-kapi';
    k.innerHTML =
      '<div class="hk-kart">' +
        '<div class="hk-ic" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24"><path d="M7 18a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.5-1.5A3.75 3.75 0 0 1 18 18z"/>' +
          '<path d="M12 21v-6M9.5 17.5 12 15l2.5 2.5"/></svg>' +
        '</div>' +
        '<h3>' + esc(M('hk_baslik','Bu kayıt yalnız bu telefonda')) + '</h3>' +
        '<p class="hk-not">' + esc(M('hk_govde','Ormanın, serilerin ve jetonların şu an sadece bu cihazda duruyor. Telefonunu değiştirir ya da uygulamayı silersen kaybolur. Ücretsiz bir hesapla buluta yedekleyebilirsin — zorunlu değil.')) + '</p>' +
        '<button class="h-saglayici" id="hk-google">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.4 3-4.1 5.6-4.1z"/></svg>' +
          esc(M('h_google','Google ile devam et')) + '</button>' +
        '<button class="h-ikincil hk-eposta" id="hk-eposta">' + esc(M('h_kayit','Hesap oluştur')) + '</button>' +
        '<button class="hk-gec" id="hk-gec">' + esc(M('hk_gec','Şimdilik geç')) + '</button>' +
      '</div>';
    document.body.appendChild(k);

    /* Hangi düğmeye basılırsa basılsın kart bir daha çıkmaz: kullanıcı kararını
       verdi. Girişi yarıda bıraksa bile "Hesabım" menüde duruyor. */
    function kapat(){ try{ localStorage.setItem(TEKLIF_MUHUR, '1'); }catch(e){} k.remove(); }

    const g = k.querySelector('#hk-google');
    if(g) g.addEventListener('click', () => { kapat(); girisGoogle(); });

    /* E-posta yolu kartta değil PANELDE: alanlar, "şifremi unuttum" ve hata
       metinleri orada zaten var — ikinci bir form yazmak iki ayrı gerçek olurdu. */
    const e = k.querySelector('#hk-eposta');
    if(e) e.addEventListener('click', () => {
      kapat();
      try{ if(window.AkoraAna && AkoraAna.sheetAc) AkoraAna.sheetAc('hesap'); }catch(x){}
    });

    const gc = k.querySelector('#hk-gec');
    if(gc) gc.addEventListener('click', kapat);
  }

  /* app.js seans bitip ana ekrana dönünce çağırır. Gösterdiyse true döner —
     aynı anda puanlama penceresi de açılmasın diye. */
  function teklifEt(){
    if(!yerli()) return false;                 // tarayıcıda hesap zaten çalışmıyor
    if(kullanici) return false;                // zaten girişli
    try{ if(localStorage.getItem(TEKLIF_MUHUR)) return false; }catch(e){ return false; }
    let dk = 0;
    try{ dk = AkisStats.totalHours() * 60; }catch(e){ return false; }
    if(dk < 1) return false;                   // henüz kaybedilecek bir şey yok
    teklifGoster();
    return true;
  }

  /* ---------------- bağlama ---------------- */

  function kur(){
    if(!$('#h-govde')) return;
    ciz();
    if(!yerli()) return;

    /* Önce ilk-açılış mührü (temiz kurulumda bayat oturumu kapatır), SONRA tazele.
       Sırası önemli: tazeleme önce koşarsa panel bir an girişli görünür. */
    muhurKontrol().then(kullaniciTazele, kullaniciTazele);

    /* Oturum durumu değişince ekranı tazele (başka yerden çıkış olabilir) */
    try{
      const a = Auth();
      if(a && a.addListener) a.addListener('authStateChange', () => kullaniciTazele());
    }catch(e){}

    /* Uygulama arka plana alınırken sessizce yedekle — kullanıcı elle
       basmayı unutsa bile emeği kaybolmasın. */
    try{
      const App = Capacitor.Plugins.App;
      if(App && App.addListener){
        App.addListener('appStateChange', st => {
          if(!st.isActive && kullanici) bulutaYaz();
        });
      }
    }catch(e){}

    try{ if(window.AkisI18n && AkisI18n.onChange) AkisI18n.onChange(ciz); }catch(e){}
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kur);
  else kur();

  /* 🪤 `uid` DIŞA AÇIK olmak zorunda: push.js, FCM token'ını
     `kullanicilar/{uid}/cihazlar/...` altına yazmak için bunu çağırıyor.
     Yoksa token hiç kaydedilmez ve hata da vermez — sessiz kayıp. */
  try{ window.AkoraHesap = {
      sil: hesabiSil, ciz, bulutaYaz, buluttanOku, teklifEt,
      kullanici: () => kullanici,
      uid: () => (kullanici && kullanici.uid) || '' }; }catch(e){}
})();
