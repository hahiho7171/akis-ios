/* ============================================================
   AKORA — TAKVİM  (2026-08-28, Aşama D)

   Kullanıcı isteği: "her çalışılan gün tarihiyle görünsün, güne
   dokununca o günün verisi kategori kategori dökülsün —
   matematikten şu kadar çalışmışsın, bu kadar kitap okumuşsun."

   Veri: yalnız AkisStats'ın açık API'sinden okunur.
     dayMinutes(ds)      → o günün toplam dakikası
     sessionsForDate(ds) → o günün seansları ({min, tag, name, ts})
     tagById(id) / tags()→ etiket adı + rengi
     today()             → "günün başlangıç saati" ayarına göre mantıksal bugün
   Yazma YOK — takvim salt okunur bir görünümdür.

   🚨 Gün anahtarı YEREL tarihten üretilir (stats.js ile aynı biçim).
      toISOString() UTC'ye kaydırır ve geceyarısı seansını bir gün
      öteler — KULLANMA.
   ============================================================ */
(function(){
  'use strict';
  const $ = s => document.querySelector(s);

  function T(k, v){
    try{ return (window.AkisI18n && AkisI18n.t) ? AkisI18n.t(k, v) : ''; }catch(e){ return ''; }
  }
  function dil(){
    try{ return (window.AkisI18n && AkisI18n.current) ? AkisI18n.current() : (document.documentElement.lang || 'tr'); }
    catch(e){ return 'tr'; }
  }
  function esc(x){
    return String(x==null?'':x).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /* gün anahtarı: YYYY-MM-DD, yerel saatten (stats.js ile aynı) */
  function anahtar(d){
    return d.getFullYear() + '-' +
           String(d.getMonth()+1).padStart(2,'0') + '-' +
           String(d.getDate()).padStart(2,'0');
  }

  let ay = null;        // gösterilen ayın 1'i
  let secili = null;    // seçili gün anahtarı

  /* 🚨 AkisI18n.t() karşılığı yoksa ANAHTARIN KENDİSİNİ döndürür ("tag_xyz").
     Bu yüzden "|| fallback" işe yaramaz; dönen değer anahtara eşitse yedeğe düşülür.
     Eski kayıtlarda kalmış, artık tanınmayan etiket id'leri böyle yakalanır. */
  function etiketAdi(id){
    try{
      const tg = AkisStats.tagById(id);
      if(tg && tg.ozel) return tg.ad;
    }catch(e){}
    const anah = 'tag_' + (id || 'other');
    const ad = T(anah);
    if(ad && ad !== anah) return ad;
    const yedek = T('tag_other');
    return (yedek && yedek !== 'tag_other') ? yedek : (id || '—');
  }
  function etiketRengi(id){
    try{ const tg = AkisStats.tagById(id); if(tg && tg.renk) return tg.renk; }catch(e){}
    return '#9aa7b4';
  }

  function sureYaz(dk){
    const d = Math.round(dk || 0);
    if(d < 60) return T('tk_dk', {n:d}) || (d + ' dk');
    const s = Math.floor(d/60), k = d % 60;
    return k ? (T('tk_sa_dk', {s:s, d:k}) || (s+' sa '+k+' dk'))
             : (T('tk_sa',   {s:s})       || (s+' sa'));
  }

  /* ---------- gün adları: cihazın diline göre, elle çeviri yok ---------- */
  function gunAdlari(){
    const bic = new Intl.DateTimeFormat(dil(), {weekday:'short'});
    const out = [];
    // 2024-01-01 Pazartesi — hafta pazartesi başlar
    for(let i=0; i<7; i++){
      const d = new Date(2024, 0, 1 + i);
      out.push(bic.format(d));
    }
    return out;
  }
  function ayAdi(d){
    try{ return new Intl.DateTimeFormat(dil(), {month:'long', year:'numeric'}).format(d); }
    catch(e){ return d.getFullYear() + '-' + (d.getMonth()+1); }
  }
  function tamTarih(ds){
    const [y,m,g] = ds.split('-').map(Number);
    try{
      return new Intl.DateTimeFormat(dil(), {day:'numeric', month:'long', weekday:'long'})
              .format(new Date(y, m-1, g));
    }catch(e){ return ds; }
  }

  /* ---------- ızgara ---------- */

  function ciz(){
    if(!ay) ay = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const adBox = $('#tk-ay-ad');
    if(adBox) adBox.textContent = ayAdi(ay);

    const ga = $('#tk-gunadlari');
    if(ga) ga.innerHTML = gunAdlari().map(a => '<span>' + esc(a) + '</span>').join('');

    const izgara = $('#tk-izgara');
    if(!izgara || !window.AkisStats) return;

    const yil = ay.getFullYear(), aySira = ay.getMonth();
    const ilk = new Date(yil, aySira, 1);
    // pazartesi = 0 olacak şekilde kaydır
    const bosluk = (ilk.getDay() + 6) % 7;
    const gunSayisi = new Date(yil, aySira + 1, 0).getDate();

    let bugun = '';
    try{ bugun = AkisStats.today(); }catch(e){}

    // ayın en yoğun günü → yoğunluk ölçeği
    const dk = {};
    let enYuksek = 0;
    for(let g = 1; g <= gunSayisi; g++){
      const ds = anahtar(new Date(yil, aySira, g));
      let m = 0;
      try{ m = AkisStats.dayMinutes(ds) || 0; }catch(e){}
      dk[ds] = m;
      if(m > enYuksek) enYuksek = m;
    }

    let html = '';
    for(let i = 0; i < bosluk; i++) html += '<span class="tk-bos"></span>';
    let ayToplam = 0;

    for(let g = 1; g <= gunSayisi; g++){
      const ds = anahtar(new Date(yil, aySira, g));
      const m = dk[ds];
      ayToplam += m;
      // 4 kademe yoğunluk — renk tek başına anlam taşımasın diye dakika da yazılır
      let kademe = 0;
      if(m > 0) kademe = enYuksek <= 0 ? 1 : Math.min(4, Math.ceil((m / enYuksek) * 4));
      // sadece kitap okunan günler de takvimde bulunabilsin (odak dakikası yoksa bile)
      let sf = 0;
      try{ sf = (window.AkoraKitaplik && AkoraKitaplik.gunSayfa(ds)) || 0; }catch(e){}
      const sinif = ['tk-gun']
        .concat(kademe ? ['y' + kademe] : [])
        .concat(sf > 0 ? ['okuma'] : [])
        .concat(ds === bugun   ? ['bugun']  : [])
        .concat(ds === secili  ? ['secili'] : [])
        .join(' ');
      let etiket = tamTarih(ds);
      if(m > 0)  etiket += ' · ' + sureYaz(m);
      if(sf > 0) etiket += ' · ' + (T('tk_sayfa', {n:sf}) !== 'tk_sayfa' ? T('tk_sayfa', {n:sf}) : (sf + ' sayfa'));
      html += '<button class="' + sinif + '" data-gun="' + ds + '" aria-label="' + esc(etiket) + '">'
            +   '<b>' + g + '</b>'
            +   (m > 0 ? '<i>' + Math.round(m) + '</i>' : '')
            + '</button>';
    }
    izgara.innerHTML = html;

    const t = $('#tk-ay-toplam');
    if(t) t.textContent = ayToplam > 0
      ? (T('tk_ay_toplam', {s: sureYaz(ayToplam)}) || ('Bu ay toplam: ' + sureYaz(ayToplam)))
      : (T('tk_ay_bos') || '');

    izgara.querySelectorAll('[data-gun]').forEach(b => {
      b.addEventListener('click', () => {
        secili = (secili === b.dataset.gun) ? null : b.dataset.gun;
        ciz();
        detay();
      });
    });

    detay();
  }

  /* ---------- seçilen günün kategori kırılımı ---------- */

  function detay(){
    const box = $('#tk-detay');
    if(!box) return;

    if(!secili){
      box.innerHTML = '<p class="tk-ipucu">' + esc(T('tk_ipucu') || 'Bir güne dokun, o günün dökümünü gör.') + '</p>';
      return;
    }

    let seanslar = [];
    try{ seanslar = AkisStats.sessionsForDate(secili) || []; }catch(e){}

    // Kitaplık ayrı depoda; o gün okunan sayfa da güne yazılır
    // (kullanıcı isteği: "şu kadar çalışmışsın, bu kadar kitap okumuşsun")
    let sayfa = 0;
    try{ sayfa = (window.AkoraKitaplik && AkoraKitaplik.gunSayfa(secili)) || 0; }catch(e){}
    const okumaSatiri = sayfa > 0
      ? '<li class="tk-sat tk-okuma">'
        + '<span class="tk-nokta" style="background:#f4a63c"></span>'
        + '<span class="tk-ad">' + esc(T('kt_okuma') !== 'kt_okuma' ? T('kt_okuma') : 'Kitap okuma') + '</span>'
        + '<span class="tk-dk">' + esc(T('tk_sayfa', {n:sayfa}) !== 'tk_sayfa' ? T('tk_sayfa', {n:sayfa}) : (sayfa + ' sayfa')) + '</span>'
        + '</li>'
      : '';

    if(!seanslar.length){
      box.innerHTML = '<div class="tk-detay-kart">'
        + '<h4>' + esc(tamTarih(secili)) + '</h4>'
        + (okumaSatiri
            ? '<ul class="tk-liste">' + okumaSatiri + '</ul>'
            : '<p class="tk-ipucu">' + esc(T('tk_gun_bos') || 'Bu gün odak kaydı yok.') + '</p>')
        + '</div>';
      return;
    }

    // etikete göre topla
    const grup = new Map();
    let toplam = 0;
    seanslar.forEach(it => {
      const k = it.tag || 'other';
      const m = it.min || 0;
      toplam += m;
      const v = grup.get(k) || {dk:0, adet:0};
      v.dk += m; v.adet++;
      grup.set(k, v);
    });
    const sirali = [...grup.entries()].sort((a,b) => b[1].dk - a[1].dk);

    const satirlar = sirali.map(([id, v]) => {
      const yuzde = toplam > 0 ? Math.round((v.dk / toplam) * 100) : 0;
      return '<li class="tk-sat">'
        + '<span class="tk-nokta" style="background:' + esc(etiketRengi(id)) + '"></span>'
        + '<span class="tk-ad">' + esc(etiketAdi(id)) + '</span>'
        + '<span class="tk-dk">' + esc(sureYaz(v.dk)) + '</span>'
        + '<span class="tk-cubuk"><i style="width:' + yuzde + '%;background:' + esc(etiketRengi(id)) + '"></i></span>'
        + '</li>';
    }).join('');

    box.innerHTML = '<div class="tk-detay-kart">'
      + '<h4>' + esc(tamTarih(secili)) + '</h4>'
      + '<p class="tk-gun-toplam">' + esc(sureYaz(toplam)) + ' · '
      +   esc(T('tk_seans', {n: seanslar.length}) || (seanslar.length + ' seans')) + '</p>'
      + '<ul class="tk-liste">' + satirlar + okumaSatiri + '</ul>'
      + '</div>';
  }

  /* ---------- açılış / bağlama ---------- */

  function ac(){
    ay = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let b = '';
    try{ b = AkisStats.today(); }catch(e){}
    secili = b || null;
    ciz();
    gorunum('view-takvim');
  }

  /* app.js'in show() fonksiyonu dışarı açık değil — aynı işi burada yaparız:
     yalnız .view sınıfındaki bölümler arasında geçiş, başka şeye dokunmaz. */
  function gorunum(id){
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
  }

  function kur(){
    if(!$('#view-takvim')) return;

    const geri = $('#takvim-back');
    if(geri) geri.addEventListener('click', () => gorunum('view-home'));

    const g = $('#tk-geri'), i = $('#tk-ileri');
    if(g) g.addEventListener('click', () => { ay = new Date(ay.getFullYear(), ay.getMonth()-1, 1); ciz(); });
    if(i) i.addEventListener('click', () => { ay = new Date(ay.getFullYear(), ay.getMonth()+1, 1); ciz(); });

    const bt = $('#btn-takvim');
    if(bt) bt.addEventListener('click', ac);

    // menüden gelen derin bağlantı
    document.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest('[data-takvim]');
      if(t) setTimeout(ac, 0);
    });

    // dil değişince ay/gün adları ve süre metinleri yeniden yazılsın
    try{ if(window.AkisI18n && AkisI18n.onChange) AkisI18n.onChange(()=>{ if($('#view-takvim').classList.contains('active')) ciz(); }); }catch(e){}
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kur);
  else kur();

  try{ window.AkoraTakvim = { ac, ciz }; }catch(e){}
})();
