/* ============================================================
   AKORA — ANA EKRAN + MENÜ ÇEKMECESİ  (2026-08-28 yeniden tasarım)

   Bu dosya app.js'e DOKUNMAZ. app.js'in bağladığı bütün id'ler
   yerinde durur (#mode-grid .mode-card, #btn-start, #task-input,
   #visual-picker, #bg-chips, #tag-row, #fav-row, #custom-setup,
   #btn-lang, #btn-stats, #premium-cta, #set-* , #btn-backup …);
   burada yalnız YENİ kabuk yönetilir:
     · ufuk çizgisindeki ön-izleme sayacı
     · gökyüzündeki etiket çubuğu ve jeton
     · menü çekmecesi + alt sayfalar (sheet)
     · manzaraya göre dönen --gok-h tonu
     · orman canvas'ının menü açıkken bağlanması (pil)

   🚨 Orman canvas'ının id'si BİLEREK #orman-mini — app.js'in
      #pond-mini araması boşa düşsün, mount/unmount'u burası
      yönetsin diye. Değiştirme.
   ============================================================ */
(function(){
  'use strict';
  const $ = s => document.querySelector(s);

  function T(k, v){
    try{ return (window.AkisI18n && AkisI18n.t) ? AkisI18n.t(k, v) : ''; }catch(e){ return ''; }
  }

  /* ---------- ufuk çizgisindeki ön-izleme sayacı ---------- */

  const MOD_DK = { pomodoro:25, fiftytwo:52, flowtime:0 };

  function sureMetni(dk){
    const d = Math.max(0, Math.round(dk));
    return d + ':00';
  }

  function aktifMod(){
    const el = $('#mode-grid .mode-card.active');
    return (el && el.dataset.mode) || 'pomodoro';
  }

  function onizlemeYenile(){
    const s = $('#on-sure'), a = $('#on-sure-alt');
    if(!s) return;
    const m = aktifMod();

    if(m === 'custom'){
      const w = parseInt(($('#work-min')||{}).textContent, 10) || 30;
      const b = parseInt(($('#break-min')||{}).textContent, 10) || 5;
      s.textContent = sureMetni(w);
      if(a) a.textContent = T('custom_work') + ' ' + w + ' · ' + T('custom_break') + ' ' + b;
      return;
    }

    s.textContent = sureMetni(MOD_DK[m] != null ? MOD_DK[m] : 25);
    const kart = $('#mode-grid .mode-card.active');
    const d = kart && kart.querySelector('.mode-desc');
    if(a) a.textContent = d ? d.textContent : '';
  }

  /* ---------- gökyüzündeki etiket çubuğu ---------- */

  function etiketYenile(){
    const ad = $('#etiket-ad'), nokta = $('#etiket-nokta');
    if(!ad || !window.AkisStats) return;
    try{
      const id = AkisStats.activeTag();
      const tg = AkisStats.tagById(id);
      nokta.style.background = (tg && tg.renk) || '#9aa7b4';
      if(!bayrak(ETIKET_DOKUNULDU)){
        const b = T('tag_bar');
        ad.textContent = (b && b !== 'tag_bar') ? b : 'Etiket';
        nokta.style.background = 'hsl(196 16% 72%)';
        return;
      }
      const anah = 'tag_' + (id || 'other');
      const cev = T(anah);
      const temel = (tg && tg.ozel) ? tg.ad : ((cev && cev !== anah) ? cev : (id || '—'));
      ad.textContent = temel + etiketEkYazi();
    }catch(e){}
  }

  function jetonYenile(){
    const el = $('#jeton-n');
    if(!el || !window.AkisStats) return;
    try{ el.textContent = AkisStats.coins(); }catch(e){}
  }

  /* ---------- ağacın evresi: orman büyüdükçe ana görsel büyür ---------- */

  /* 🚨 2026-08-29 KULLANICI KARARI: ana ekranda HEP dolgun ağaç durur.
     Önce orman büyüklüğüne göre filiz→fidan→ağaç diye evriliyordu; boş ormanda
     ekrana çamur yığını gibi bir filiz geliyordu ve kullanıcı bunu reddetti.
     Filiz/fidan görselleri ormanda (garden.js) kullanılmaya devam ediyor. */
  const EVRELER = [
    { esik:  0, dosya:'tree.webp',    sinif:'e-tree'    },
    { esik: 30, dosya:'bigtree.webp', sinif:'e-bigtree' }
  ];
  function agacYenile(){
    const img = $('#ana-agac');
    if(!img || !window.AkisStats) return;

    /* 🚨 2026-08-29 KULLANICI KARARI: ANA EKRANDAKİ AĞAÇ HEP STANDART.
       Dükkândan alınan ağaç türü YALNIZ Bahçem'deki/ormandaki dikili ağaçları
       değiştirir; giriş ekranındaki ağaç hiç değişmez. (Kış dalı seçilince
       ana ekrana çıplak dal geliyordu.) */
    let n = 0;
    try{ n = AkisStats.itemCount() || 0; }catch(e){}
    let sec = EVRELER[0];
    for(const e of EVRELER){ if(n >= e.esik) sec = e; }
    if(!img.src.endsWith(sec.dosya)) img.src = 'assets/agac/' + sec.dosya;
    if(img.dataset.evre !== sec.sinif){
      EVRELER.forEach(e => img.classList.remove(e.sinif));
      img.classList.add(sec.sinif);
      img.dataset.evre = sec.sinif;
    }
  }

  /* ---------- manzaraya göre gökyüzü tonu ---------- */

  const MANZARA_TON = {
    none:     [186, 82],
    akvaryum: [196, 78],
    koi:      [168, 62],
    sualti:   [205, 74],
    okyanus:  [200, 76],
    selale:   [172, 58],
    orman:    [152, 52],
    yagmur:   [210, 46],
    somine:   [ 26, 72]
  };
  function tonYenile(){
    const el = $('#bg-chips .chip.active');
    const bg = (el && el.dataset.bg) || 'none';
    const t = MANZARA_TON[bg] || MANZARA_TON.none;
    const r = document.documentElement;
    r.style.setProperty('--gok-h', t[0]);
    r.style.setProperty('--gok-s', t[1] + '%');
    const meta = document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute('content', 'hsl(' + t[0] + ' ' + t[1] + '% 74%)');
  }

  /* ---------- çekmece + alt sayfalar ---------- */

  const perde = () => $('#ak-perde');

  function perdeEsitle(){
    const acikVar = !!document.querySelector('.ak-menu.open, .ak-sheet.open');
    const p = perde();
    if(p) p.classList.toggle('open', acikVar);
  }

  function sheetKapatHepsi(){
    document.querySelectorAll('.ak-sheet.open').forEach(s => s.classList.remove('open'));
  }

  function menuAc(){
    const m = $('#ak-menu'); if(!m) return;
    m.classList.add('open');
    perdeEsitle();
    ormanBagla();
    jetonYenile();
  }
  function menuKapat(){
    const m = $('#ak-menu'); if(!m) return;
    m.classList.remove('open');
    ormanCoz();
    perdeEsitle();
  }

  function sheetAc(ad){
    const s = document.querySelector('.ak-sheet[data-sheet="' + ad + '"]');
    if(!s) return;
    sheetKapatHepsi();
    s.classList.add('open');
    perdeEsitle();
  }
  function sheetKapat(){ sheetKapatHepsi(); perdeEsitle(); }

  function hepsiKapat(){
    sheetKapatHepsi();
    const m = $('#ak-menu');
    if(m && m.classList.contains('open')){ m.classList.remove('open'); ormanCoz(); }
    perdeEsitle();
  }

  /* ---------- orman canvas'ı: yalnız menü açıkken çizsin (pil) ---------- */

  function ormanBagla(){
    const cv = $('#orman-mini');
    if(!cv || !window.AkisGarden || !window.AkisStats) return;
    try{
      const w = cv.clientWidth || 300, h = cv.clientHeight || 104;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      AkisGarden.update(cv, AkisStats.items());
      if(!cv._akMounted){ AkisGarden.mount(cv, AkisStats.items()); cv._akMounted = true; }
      const c = $('#orman-sayi');
      if(c) c.textContent = T('forest_count', { n: AkisStats.itemCount() });
    }catch(e){}
  }
  function ormanCoz(){
    const cv = $('#orman-mini');
    if(!cv || !window.AkisGarden) return;
    try{ if(cv._akMounted){ AkisGarden.unmount(cv); cv._akMounted = false; } }catch(e){}
  }


  /* ---------- istatistik bölümleri (Aşama C) ----------
     Tüm bölümler DOM'da kalır ki app.js'in openStats() tazelemesi
     hepsini bulsun; yalnız biri görünür olur. */

  function bolumGoster(ad){
    document.querySelectorAll('.ist-bolum').forEach(b => b.classList.toggle('on', b.dataset.bolum === ad));
    document.querySelectorAll('.isek').forEach(b => b.classList.toggle('on', b.dataset.bolum === ad));
    const gv = document.querySelector('#view-stats .stats-body');
    if(gv) gv.scrollTop = 0;
    ormanTamSenkron(ad);
  }

  /* Büyük orman canvas'ı yalnız "Ormanım" bölümü açıkken çizsin.
     app.js openStats() içinde onu koşulsuz mount ediyor; biz iki rAF
     sonra devralıp gereksizse çözüyoruz (gizli canvas 60fps pil yakar). */
  function ormanTamSenkron(ad){
    const cv = $('#pond-full');
    if(!cv || !window.AkisGarden || !window.AkisStats) return;
    const gerek = ad === 'orman' && $('#view-stats').classList.contains('active');
    try{
      if(gerek){ AkisGarden.update(cv, AkisStats.items()); AkisGarden.mount(cv, AkisStats.items()); }
      else AkisGarden.unmount(cv);
    }catch(e){}
  }

  function ikiKare(fn){ requestAnimationFrame(() => requestAnimationFrame(fn)); }

  function bolumKur(){
    document.querySelectorAll('.isek').forEach(b => {
      b.addEventListener('click', () => bolumGoster(b.dataset.bolum));
    });
    document.querySelectorAll('.ak-satir[data-ist]').forEach(b => {
      b.addEventListener('click', () => {
        if(b.id !== 'btn-stats'){ const st = $('#btn-stats'); if(st) st.click(); }
        ikiKare(() => bolumGoster(b.dataset.ist));
      });
    });
    // istatistik ekranı doğrudan açıldığında da özet bölümüne dön
    const st = $('#btn-stats');
    if(st) st.addEventListener('click', () => ikiKare(() => bolumGoster('ozet')));
  }


  /* ---------- Ayarlardaki "✓ / —" göstergesini gerçek anahtara çevir ----------
     app.js metni yazmaya devam eder (dokunulmadı); burada yalnız o metin
     okunup satıra durum sınıfı verilir, görünüşü CSS çizer. Böylece
     kullanıcı açık/kapalı olduğunu tek bakışta görür. */
  const ANAHTARLAR = [['#set-overtime', '#set-overtime-v'], ['#set-dnd', '#set-dnd-v']];

  function anahtarYenile(){
    ANAHTARLAR.forEach(([satirSec, degerSec]) => {
      const satir = $(satirSec), deger = $(degerSec);
      if(!satir || !deger) return;
      const acik = deger.textContent.trim() === '✓';
      satir.classList.add('anahtar');
      satir.classList.toggle('anahtar-acik', acik);
      satir.setAttribute('role', 'switch');
      satir.setAttribute('aria-checked', acik ? 'true' : 'false');
      deger.setAttribute('aria-hidden', 'true');
    });
  }


  /* ============================================================
     ÜSTTEKİ İKİ AÇILIR ÇUBUK  (2026-08-29 kullanıcı isteği)
       [● Etiket ▾]  [🖼 Arka plan ▾]
     Etiket sayfasında "Okuma" seçiliyse KİTAP LİSTESİ açılır;
     bir kitaba dokununca o kitap seansın adı olur (#task-input).
     Kitap yoksa "Kitap ekle" düğmesi çıkar → kitap ekleme sayfası.
     ============================================================ */

  const OKUMA_ETIKET = 'read';   // stats.js › HAZIR_ETIKET

  const BG_AD = {
    none:'bg_none', akvaryum:'bg_akvaryum', koi:'bg_koi', sualti:'bg_sualti',
    okyanus:'bg_okyanus', selale:'bg_selale', orman:'bg_orman',
    yagmur:'bg_yagmur', somine:'bg_somine'
  };

  /* Poster kartlarındaki metin CSS ::after ile perdenin üstüne yazılıyor;
     içerik data-ad'dan geliyor. Dil değişince de tazelenmeli. */
  function bgKartAdlari(){
    document.querySelectorAll('#bg-chips .chip').forEach(c => {
      // app.js i18n uygularken çipin metnini değiştiriyor; sarmalayıcı
      // kaybolursa yeniden kurulur.
      if(c.children.length === 1 && c.firstElementChild.classList.contains('bg-ad')) return;
      const m = (c.textContent || '').trim();
      if(!m) return;
      c.innerHTML = '';
      const sp = document.createElement('span');
      sp.className = 'bg-ad';
      sp.textContent = m;
      c.appendChild(sp);
    });
  }

  function arkaplanYenile(){
    bgKartAdlari();
    const ad = $('#arkaplan-ad');
    if(!ad) return;
    const el = $('#bg-chips .chip.active');
    const bg = (el && el.dataset.bg) || 'none';
    // kullanıcı hiç dokunmadıysa çubuk kendi adını yazar
    const anah = (!bayrak(BG_DOKUNULDU) || bg === 'none') ? 'label_bg' : (BG_AD[bg] || 'bg_none');
    const yazi = T(anah);
    ad.textContent = (yazi && yazi !== anah) ? yazi : bg;
  }

  /* --- etiket sayfasındaki kitap bölümü --- */
  function kitapBolumu(){
    const box = $('#etiket-kitaplar');
    if(!box) return;

    let aktif = '';
    try{ aktif = AkisStats.activeTag(); }catch(e){}
    if(aktif !== OKUMA_ETIKET){ box.innerHTML = ''; box.classList.remove('acik'); return; }
    box.classList.add('acik');

    let liste = [];
    try{ liste = (window.AkoraKitaplik && AkoraKitaplik.kitaplar()) || []; }catch(e){}
    const okunan = liste.filter(k => !k.bitirdi);

    const bas = '<span class="picker-label">' + kac(T('kt_okuyorum'), 'kt_okuyorum', 'Okuyorum') + '</span>';

    if(!okunan.length){
      box.innerHTML = bas
        + '<p class="ek-bos">' + kac(T('kt_bos'), 'kt_bos', 'Henüz kitap yok.') + '</p>'
        + '<button class="ek-kitap-ekle" id="ek-kitap-ekle">+ '
        +   kac(T('kt_ekle'), 'kt_ekle', 'Kitap ekle') + '</button>';
    }else{
      box.innerHTML = bas
        + '<div class="ek-kitaplar">' + okunan.map(k => {
            const yuzde = k.toplam ? Math.min(100, Math.round((k.sayfa / k.toplam) * 100)) : 0;
            return '<button class="ek-kitap" data-ekitap="' + kacar(k.id) + '">'
              + '<span class="ek-ad">' + kacar(k.ad) + '</span>'
              + '<span class="ek-sayfa">' + k.sayfa + ' / ' + k.toplam + '</span>'
              + '<span class="ek-cubuk"><i style="width:' + yuzde + '%"></i></span>'
              + '</button>';
          }).join('') + '</div>'
        + '<button class="ek-kitap-ekle" id="ek-kitap-ekle">+ '
        +   kac(T('kt_ekle'), 'kt_ekle', 'Kitap ekle') + '</button>';
    }

    box.querySelectorAll('[data-ekitap]').forEach(b => {
      b.addEventListener('click', () => kitapSec(b.dataset.ekitap));
    });
    const e = $('#ek-kitap-ekle');
    if(e) e.addEventListener('click', () => {
      sheetKapatHepsi();
      setTimeout(() => {
        try{ if(window.AkoraKitaplik && AkoraKitaplik.ekleAc) return AkoraKitaplik.ekleAc(); }catch(e){}
        sheetAc('kitap-ekle');
      }, 60);
    });
  }

  /* t() karşılık yoksa anahtarı döndürür — yedeğe düşmek için eşitlik bakılır */
  function kac(deger, anahtar, yedek){ return kacar((deger && deger !== anahtar) ? deger : yedek); }
  function kacar(x){
    return String(x == null ? '' : x).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /* Kitap seçilince seansın adı o kitap olur — app.js `task` değişkenini
     #task-input'un input olayından okuyor, o yüzden olayı elle tetikliyoruz. */
  function kitapSec(id){
    let k = null;
    try{ k = (AkoraKitaplik.kitaplar() || []).find(x => x.id === id); }catch(e){}
    if(!k) return;
    const g = $('#task-input');
    if(g){
      g.value = k.ad;
      g.dispatchEvent(new Event('input', {bubbles:true}));
    }
    try{ localStorage.setItem('akora.sonkitap', k.id); }catch(e){}
    sheetKapat();
    etiketYenile();
  }

  /* Etiket çubuğunun yazısı: "Ders" ya da "Ders · Matematik".
     Seansa isim verildiyse HANGİ etiket olursa olsun yazılır (2026-08-29). */
  function etiketEkYazi(){
    const g = $('#task-input');
    const v = g && g.value ? g.value.trim() : '';
    if(!v) return '';
    return ' · ' + (v.length > 18 ? v.slice(0, 17) + '…' : v);
  }


  /* ============================================================
     ÇUBUK VARSAYILANLARI + OTOMATİK EŞLEŞMELER (2026-08-29)

     · Kullanıcı hiç dokunmadıysa çubuklar kendi adını yazar
       ("Etiket" / "Arka plan") — seçim yapılınca gerçek ad geçer.
     · "Uyku" seçilince arka plan kendiliğinden ŞÖMİNE olur.
     · "Okuma" seçilince mod kendiliğinden FLOWTIME (ucu açık) olur —
       kitap okurken sayaç dayatmasın; kullanıcı isterse Pomodoro'ya çevirir.
     · Hiç arka plan seçmeden "Başla" denirse RASTGELE manzara açılır.
     ============================================================ */

  const ETIKET_DOKUNULDU = 'akora.etiketSecildi';
  const BG_DOKUNULDU     = 'akora.bgSecildi';

  /* etiket → kendiliğinden uygulanacak ayarlar */
  const ETIKET_ARKAPLAN = { sleep: 'somine' };
  const ETIKET_MOD      = { read: 'flowtime', sleep: 'custom' };
  const ETIKET_SURE     = { sleep: {calisma:30, mola:5} };   // uyku: 30 dk geri sayım

  const MANZARALAR = ['akvaryum','koi','sualti','okyanus','selale','orman','yagmur','somine'];

  function bayrak(k){ try{ return localStorage.getItem(k) === '1'; }catch(e){ return false; } }
  function bayrakKur(k){ try{ localStorage.setItem(k, '1'); }catch(e){} }

  function bgSec(id){
    const c = document.querySelector('#bg-chips .chip[data-bg="' + id + '"]');
    if(c){ c.click(); return true; }
    return false;
  }
  function modSec(id){
    const c = document.querySelector('#mode-grid .mode-card[data-mode="' + id + '"]');
    if(c && !c.classList.contains('active')){ c.click(); return true; }
    return false;
  }

  /* Etiket seçilince eşleşen ayarları uygula (yalnız BİR kez, seçim anında) */
  let sonEtiket = null;
  function etiketEslesme(){
    let a = '';
    try{ a = AkisStats.activeTag(); }catch(e){}
    if(!a || a === sonEtiket) return;
    const ilkTur = sonEtiket === null;
    sonEtiket = a;
    if(ilkTur) return;              // açılışta kayıtlı etiket için tetikleme

    bayrakKur(ETIKET_DOKUNULDU);
    const bg = ETIKET_ARKAPLAN[a];
    if(bg && bgSec(bg)) bayrakKur(BG_DOKUNULDU);
    const sr = ETIKET_SURE[a];
    if(sr){ try{ window.AkoraAyar && AkoraAyar.sureAyarla(sr.calisma, sr.mola); }catch(e){} }
    const md = ETIKET_MOD[a];
    if(md) modSec(md);
    modGorunurluk();
  }

  /* Uyku seçiliyken Pomodoro/Flowtime anlamsız — yalnız "Kendin Ayarla" kalır. */
  function modGorunurluk(){
    let a = '';
    try{ a = AkisStats.activeTag(); }catch(e){}
    const uyku = (a === 'sleep');
    document.querySelectorAll('#mode-grid .mode-card').forEach(c => {
      const gizle = uyku && c.dataset.mode !== 'custom';
      c.classList.toggle('mod-gizli', gizle);
    });
  }


  /* ---------- SESSİZ çubuğu (2026-08-29) ----------
     Ayarlardaki "Seansta sessizlik" (#set-dnd) anahtarının ana ekrandaki kapısı.
     Kullanıcı seansı başlatmadan önce tek dokunuşla açıp kapatabilsin.
     ⚠️ Yalnız BİLDİRİMLER susar — aramalar Rahatsız Etme'nin kendi kuralına
     bağlıdır, uygulama aramaları kapatmaz. */
  function sessizAcikMi(){
    const v = $('#set-dnd-v');
    return !!(v && v.textContent.trim() === '✓');
  }
  function sessizYenile(){
    const b = $('#sessiz-bar');
    if(!b) return;
    const acik = sessizAcikMi();
    b.classList.toggle('acik', acik);
    b.setAttribute('aria-checked', acik ? 'true' : 'false');
  }

  /* ---------- topluca tazele ---------- */

  /* Premium satırı gizliyse "Uygulama" başlığı da gizlensin — boş başlık kalmasın */
  function grupYenile(){
    const g = $('#ak-uygulama'), c = $('#premium-cta');
    if(g && c) g.style.display = c.classList.contains('hidden') ? 'none' : '';
  }

  function yenile(){
    onizlemeYenile();
    grupYenile();
    anahtarYenile();
    arkaplanYenile();
    sessizYenile();
    etiketEslesme();
    modGorunurluk();
    // etiket sayfası açıkken kitap bölümünü seçili etiketle eşitle
    const es = document.querySelector('.ak-sheet[data-sheet="etiket"].open');
    if(es) kitapBolumu();
    etiketYenile();
    jetonYenile();
    agacYenile();
    tonYenile();
  }

  /* ---------- bağlama ---------- */

  function kur(){
    if(!$('#view-home')) return;

    const menuBtn = $('#btn-menu');
    if(menuBtn) menuBtn.addEventListener('click', menuAc);

    const kapat = $('#ak-menu-x');
    if(kapat) kapat.addEventListener('click', menuKapat);

    const p = perde();
    if(p) p.addEventListener('click', hepsiKapat);

    // etiket çubuğu → etiket sayfası (kitap bölümüyle birlikte)
    const eb = $('#etiket-bar');
    if(eb) eb.addEventListener('click', () => { sheetAc('etiket'); setTimeout(kitapBolumu, 0); });

    // arka plan çubuğu → manzara sayfası
    const ab = $('#arkaplan-bar');
    if(ab) ab.addEventListener('click', () => sheetAc('arkaplan'));

    // sessiz çubuğu → ayarlardaki anahtarı tetikler (tek kaynak orada kalsın)
    const sb = $('#sessiz-bar');
    if(sb) sb.addEventListener('click', () => {
      const s2 = $('#set-dnd');
      if(s2) s2.click();
      setTimeout(sessizYenile, 80);
    });

    // seans adını onayla → sayfayı kapat (yarım kalmış hissi vermesin)
    const et = $('#etiket-tamam');
    if(et) et.addEventListener('click', () => {
      const g = $('#task-input');
      if(g){ g.dispatchEvent(new Event('input', {bubbles:true})); g.blur(); }
      sheetKapat();
      etiketYenile();
    });
    const gi = $('#task-input');
    if(gi) gi.addEventListener('keydown', e => {
      if(e.key === 'Enter'){ e.preventDefault(); const b = $('#etiket-tamam'); if(b) b.click(); }
    });

    // arka plan seçilince sayfa kapansın — kullanıcı tek dokunuşla dönsün
    document.addEventListener('click', e => {
      if(e.target.closest && e.target.closest('#bg-chips .chip')){
        bayrakKur(BG_DOKUNULDU);
        setTimeout(() => { arkaplanYenile(); sheetKapat(); }, 120);
      }
    });

    // etiket seçimi kaydedilsin (çubuk artık gerçek adı yazsın)
    document.addEventListener('click', e => {
      if(e.target.closest && e.target.closest('[data-tag]')) bayrakKur(ETIKET_DOKUNULDU);
    }, true);

    // menüdeki orman kartı → kendi ağaç alanın (Bahçem)
    const ok = document.querySelector('.ak-orman');
    if(ok){
      ok.setAttribute('role','button');
      ok.setAttribute('tabindex','0');
      ok.addEventListener('click', () => {
        try{ window.__akoraPlotEve = true; }catch(e){}
        hepsiKapat();
        setTimeout(() => { const b = $('#btn-plot'); if(b) b.click(); }, 80);
      });
    }

    // jeton → dükkân (istatistik ekranındaki dükkân düğmesini tetikler)
    const jb = $('#btn-jeton');
    if(jb) jb.addEventListener('click', () => {
      hepsiKapat();
      const st = $('#btn-stats'); if(st) st.click();
    });

    // data-sheet taşıyan her düğme ilgili alt sayfayı açar
    document.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest('[data-sheet]:not(.ak-sheet)');
      if(t){ sheetAc(t.dataset.sheet); return; }
      const k = e.target.closest && e.target.closest('[data-sheet-kapat]');
      if(k){ sheetKapat(); }
    });

    // menü içindeki bir satır başka ekrana götürüyorsa çekmece kapansın
    document.querySelectorAll('.ak-satir[data-kapat]').forEach(b => {
      b.addEventListener('click', () => setTimeout(hepsiKapat, 0));
    });

    // "Kendin ayarla" seçilince süre sayfası açılsın
    document.querySelectorAll('#mode-grid .mode-card').forEach(c => {
      c.addEventListener('click', () => {
        if(c.dataset.mode === 'custom') setTimeout(() => sheetAc('sure'), 0);
        setTimeout(onizlemeYenile, 0);
      });
    });

    /* 🪤 "Süre" sayfası app.js'te mod 'custom' değilken #custom-setup'ı gizliyordu
       → sayfa BOMBOŞ açılıyordu. Sayfayı açmak zaten "kendi sürem" demek: modu geçir. */
    document.querySelectorAll('[data-sheet="sure"]').forEach(b => {
      if(b.classList.contains('ak-sheet')) return;
      b.addEventListener('click', () => setTimeout(() => { modSec('custom'); onizlemeYenile(); }, 0));
    });

    /* Hiç manzara seçmeden "Başla" → rastgele bir manzarayla açılsın */
    const bs2 = $('#btn-start');
    if(bs2) bs2.addEventListener('click', () => {
      if(bayrak(BG_DOKUNULDU)) return;
      const r = MANZARALAR[Math.floor(Math.random() * MANZARALAR.length)];
      bgSec(r);
    }, true);

    // başlat: açık panel varsa önce kapansın
    const bs = $('#btn-start');
    if(bs) bs.addEventListener('click', hepsiKapat, true);

    // herhangi bir tıklamadan sonra kabuğu tazele (mod, etiket, dil, jeton, arka plan)
    document.addEventListener('click', () => setTimeout(yenile, 0), true);

    // geri tuşu / ESC açık paneli kapatsın
    document.addEventListener('keydown', e => {
      if(e.key === 'Escape') hepsiKapat();
    });

    bolumKur();
    yenile();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kur);
  else kur();

  try{ window.AkoraAna = { yenile, menuAc, menuKapat, sheetAc, sheetKapat, hepsiKapat, bolumGoster }; }catch(e){}
})();
