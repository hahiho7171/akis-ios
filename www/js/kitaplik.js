/* ============================================================
   AKORA — KİTAPLIĞIM  (2026-08-29, Aşama E)

   Kullanıcı isteği: "kaldığı kitaba devam etsin, sayfa numarasını
   girsin, okuduğu toplam veri tutulsun, kitap listesi tarihleriyle
   görünsün — insan bir ömür boyu bu sisteme bağlı kalıp okuduğu
   kitapların listesini görebilsin."

   Bu yüzden veri modeli ÖMÜRLÜK düşünüldü:
     · Kayıt yalnız EKLENİR, hiçbir zaman ezilmez.
     · Her kitabın günlük okuma kaydı `gunluk[YYYY-MM-DD] = sayfa`
       olarak durur → takvim bunu okuyup güne yazabiliyor.
     · Dışa/içe aktarma app.js'in mevcut yedek akışına bağlandı;
       telefon değişince kitaplık da geliyor.

   🚨 Gün anahtarı YEREL tarihten üretilir (stats.js/takvim.js ile aynı).
      toISOString() UTC'ye kaydırır ve gece okumasını bir gün öteler.
   ============================================================ */
(function(){
  'use strict';
  const $ = s => document.querySelector(s);
  const KEY = 'akis.kitap.v1';

  function T(k, v){
    try{ return (window.AkisI18n && AkisI18n.t) ? AkisI18n.t(k, v) : ''; }catch(e){ return ''; }
  }
  /* t() karşılık yoksa anahtarın kendisini döndürür — yedeğe düşmek için eşitlik bakılır */
  function M(k, v, yedek){
    const s = T(k, v);
    return (s && s !== k) ? s : yedek;
  }
  function esc(x){
    return String(x==null?'':x).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function dil(){
    try{ return (window.AkisI18n && AkisI18n.current) ? AkisI18n.current() : 'tr'; }catch(e){ return 'tr'; }
  }
  function bugun(){
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function tarihYaz(ds){
    if(!ds) return '';
    const [y,m,g] = ds.split('-').map(Number);
    try{ return new Intl.DateTimeFormat(dil(), {day:'numeric', month:'long', year:'numeric'}).format(new Date(y, m-1, g)); }
    catch(e){ return ds; }
  }

  /* ---------------- veri ---------------- */

  let veri = { v:1, kitaplar:[] };

  function oku(){
    try{
      const d = JSON.parse(localStorage.getItem(KEY));
      if(d && Array.isArray(d.kitaplar)) veri = d;
    }catch(e){}
    return veri;
  }
  function yaz(){ try{ localStorage.setItem(KEY, JSON.stringify(veri)); }catch(e){} }

  function kitaplar(){ return veri.kitaplar.slice(); }

  function ekle(ad, yazar, toplam){
    ad = String(ad||'').trim().slice(0,80);
    yazar = String(yazar||'').trim().slice(0,60);
    toplam = Math.max(1, Math.min(20000, parseInt(toplam,10) || 0));
    if(!ad || !toplam) return null;
    const k = {
      id: 'k' + Date.now().toString(36) + Math.floor(Math.random()*1e4).toString(36),
      ad, yazar, toplam, sayfa: 0,
      basladi: bugun(), bitirdi: null,
      gunluk: {}
    };
    veri.kitaplar.unshift(k);
    yaz();
    return k;
  }

  function bul(id){ return veri.kitaplar.find(k => k.id === id) || null; }

  function sil(id){
    const i = veri.kitaplar.findIndex(k => k.id === id);
    if(i < 0) return false;
    veri.kitaplar.splice(i, 1);
    yaz();
    return true;
  }

  /* Sayfa güncelle: FARK kadar o güne yazılır.
     Geri alma (yanlış girdiyi düzeltme) da desteklenir — fark eksi olursa
     o günün kaydından düşülür, ama gün kaydı eksiye inmez. */
  function sayfaGuncelle(id, yeni){
    const k = bul(id);
    if(!k) return null;
    yeni = Math.max(0, Math.min(k.toplam, parseInt(yeni,10) || 0));
    const fark = yeni - k.sayfa;
    if(fark !== 0){
      const g = bugun();
      k.gunluk[g] = Math.max(0, (k.gunluk[g] || 0) + fark);
      if(!k.gunluk[g]) delete k.gunluk[g];
    }
    k.sayfa = yeni;
    if(yeni >= k.toplam){ if(!k.bitirdi) k.bitirdi = bugun(); }
    else k.bitirdi = null;
    yaz();
    return k;
  }

  /* takvim buradan besleniyor: o gün kaç sayfa okunmuş */
  function gunSayfa(ds){
    let t = 0;
    veri.kitaplar.forEach(k => { t += (k.gunluk && k.gunluk[ds]) || 0; });
    return t;
  }

  function ozet(){
    const yil = String(new Date().getFullYear());
    let toplamSayfa = 0, biten = 0, yilSayfa = 0, yilKitap = 0;
    veri.kitaplar.forEach(k => {
      toplamSayfa += k.sayfa;
      if(k.bitirdi){
        biten++;
        if(k.bitirdi.slice(0,4) === yil) yilKitap++;
      }
      for(const g in (k.gunluk||{})) if(g.slice(0,4) === yil) yilSayfa += k.gunluk[g];
    });
    return { kitap: veri.kitaplar.length, biten, toplamSayfa, yilKitap, yilSayfa };
  }

  /* ---------------- ekran ---------------- */

  let acikKitap = null;

  function gorunum(id){
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
  }

  function ciz(){
    const box = $('#kt-govde');
    if(!box) return;

    const o = ozet();
    const liste = kitaplar();
    const okunan = liste.filter(k => !k.bitirdi);
    const bitenler = liste.filter(k => k.bitirdi)
                          .sort((a,b) => (b.bitirdi||'') < (a.bitirdi||'') ? -1 : 1);

    let html = '';

    /* ömürlük birikim — kullanıcının asıl istediği şey bu */
    html += '<div class="stat-cards kt-ozet">'
      + '<div class="stat-card"><span class="stat-num">' + o.biten + '</span>'
      +   '<span class="stat-lbl">' + esc(M('kt_ozet_kitap', null, 'Bitirdiğin kitap')) + '</span></div>'
      + '<div class="stat-card"><span class="stat-num">' + o.toplamSayfa + '</span>'
      +   '<span class="stat-lbl">' + esc(M('kt_ozet_sayfa', null, 'Toplam sayfa')) + '</span></div>'
      + '<div class="stat-card"><span class="stat-num">' + o.yilSayfa + '</span>'
      +   '<span class="stat-lbl">' + esc(M('kt_ozet_yil', null, 'Bu yıl sayfa')) + '</span></div>'
      + '</div>';

    if(!liste.length){
      html += '<div class="kt-bos">'
        + '<span class="kt-bos-ic" aria-hidden="true">\u{1F4D6}</span>'
        + '<p>' + esc(M('kt_bos', null, 'Henüz kitap yok. İlk kitabını ekle — okuduğun her sayfa bir ömür boyu burada birikir.')) + '</p>'
        + '</div>';
    }

    if(okunan.length){
      html += '<h4 class="stats-h">' + esc(M('kt_okuyorum', null, 'Okuyorum')) + '</h4>';
      html += '<div class="kt-liste">' + okunan.map(satir).join('') + '</div>';
    }
    if(bitenler.length){
      html += '<h4 class="stats-h">' + esc(M('kt_bitenler', null, 'Bitirdiklerim')) + '</h4>';
      html += '<div class="kt-liste">' + bitenler.map(satir).join('') + '</div>';
    }

    html += '<button class="kt-ekle-btn" id="kt-ekle-btn">'
      + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
      + esc(M('kt_ekle', null, 'Kitap ekle')) + '</button>';

    box.innerHTML = html;

    box.querySelectorAll('[data-kitap]').forEach(b => {
      b.addEventListener('click', () => detayAc(b.dataset.kitap));
    });
    const e = $('#kt-ekle-btn');
    if(e) e.addEventListener('click', ekleAc);
  }

  function satir(k){
    const yuzde = k.toplam ? Math.min(100, Math.round((k.sayfa / k.toplam) * 100)) : 0;
    const altSatir = k.bitirdi
      ? M('kt_bitirdin', {t: tarihYaz(k.bitirdi)}, tarihYaz(k.bitirdi) + ' tarihinde bitirdin')
      : M('kt_sayfa', {a: k.sayfa, b: k.toplam}, k.sayfa + ' / ' + k.toplam + ' sayfa');
    return '<button class="kt-sat' + (k.bitirdi ? ' bitti' : '') + '" data-kitap="' + esc(k.id) + '">'
      + '<span class="kt-kapak" aria-hidden="true">' + (k.bitirdi ? '\u{2713}' : '\u{1F4D5}') + '</span>'
      + '<span class="kt-bilgi">'
      +   '<b>' + esc(k.ad) + '</b>'
      +   (k.yazar ? '<i>' + esc(k.yazar) + '</i>' : '')
      +   '<span class="kt-alt">' + esc(altSatir) + '</span>'
      +   '<span class="kt-cubuk"><i style="width:' + yuzde + '%"></i></span>'
      + '</span>'
      + '<span class="kt-yuzde">%' + yuzde + '</span>'
      + '</button>';
  }

  /* ---------------- alt sayfalar ---------------- */

  function sheetAc(ad){
    try{ if(window.AkoraAna && AkoraAna.sheetAc) return AkoraAna.sheetAc(ad); }catch(e){}
    const s = document.querySelector('.ak-sheet[data-sheet="' + ad + '"]');
    if(s) s.classList.add('open');
  }
  function sheetKapat(){
    try{ if(window.AkoraAna && AkoraAna.sheetKapat) return AkoraAna.sheetKapat(); }catch(e){}
    document.querySelectorAll('.ak-sheet.open').forEach(s => s.classList.remove('open'));
  }

  function ekleAc(){
    const a = $('#kt-ad'), y = $('#kt-yazar'), t = $('#kt-toplam'), h = $('#kt-ekle-hata');
    if(a) a.value = ''; if(y) y.value = ''; if(t) t.value = '';
    if(h) h.textContent = '';
    sheetAc('kitap-ekle');
    setTimeout(() => { if(a) a.focus(); }, 260);
  }

  function ekleKaydet(){
    const ad = ($('#kt-ad')||{}).value || '';
    const yazar = ($('#kt-yazar')||{}).value || '';
    const toplam = ($('#kt-toplam')||{}).value || '';
    const h = $('#kt-ekle-hata');
    const n = parseInt(toplam, 10);
    if(!String(ad).trim()){
      if(h) h.textContent = M('kt_hata_ad', null, 'Kitabın adını yaz.');
      return;
    }
    if(!n || n < 1 || n > 20000){
      if(h) h.textContent = M('kt_hata_sayfa', {n:20000}, 'Toplam sayfa 1 ile 20000 arasında olmalı.');
      return;
    }
    ekle(ad, yazar, n);
    sheetKapat();
    ciz();
  }

  function detayAc(id){
    const k = bul(id);
    if(!k) return;
    acikKitap = id;
    const b = $('#kt-detay-baslik'), s = $('#kt-detay-alt'), g = $('#kt-sayfa-giris'), h = $('#kt-detay-hata');
    if(b) b.textContent = k.ad;
    if(s) s.textContent = (k.yazar ? k.yazar + ' · ' : '')
      + M('kt_basladin', {t: tarihYaz(k.basladi)}, tarihYaz(k.basladi) + ' tarihinde başladın');
    if(g){ g.value = k.sayfa || ''; g.max = k.toplam; g.placeholder = '1 – ' + k.toplam; }
    if(h) h.textContent = '';
    sheetAc('kitap-detay');
    setTimeout(() => { if(g){ g.focus(); g.select(); } }, 260);
  }

  function detayKaydet(){
    const k = bul(acikKitap);
    if(!k) return;
    const g = $('#kt-sayfa-giris'), h = $('#kt-detay-hata');
    const n = parseInt((g||{}).value, 10);
    if(isNaN(n) || n < 0 || n > k.toplam){
      if(h) h.textContent = M('kt_hata_aralik', {n: k.toplam}, '0 ile ' + k.toplam + ' arasında bir sayfa yaz.');
      return;
    }
    sayfaGuncelle(k.id, n);
    sheetKapat();
    ciz();
  }

  function detaySil(){
    const k = bul(acikKitap);
    if(!k) return;
    if(!window.confirm(M('kt_sil_onay', null, 'Bu kitap ve okuma geçmişi silinsin mi?'))) return;
    sil(k.id);
    sheetKapat();
    ciz();
  }

  /* ---------------- bağlama ---------------- */

  function ac(){ oku(); ciz(); gorunum('view-kitaplik'); }

  function kur(){
    if(!$('#view-kitaplik')) return;
    oku();

    const geri = $('#kitaplik-back');
    if(geri) geri.addEventListener('click', () => gorunum('view-home'));

    const ek = $('#kt-ekle-kaydet');   if(ek) ek.addEventListener('click', ekleKaydet);
    const dk = $('#kt-detay-kaydet');  if(dk) dk.addEventListener('click', detayKaydet);
    const ds = $('#kt-detay-sil');     if(ds) ds.addEventListener('click', detaySil);

    // Enter ile kaydet — telefonda "bitti" tuşu
    const g = $('#kt-sayfa-giris');
    if(g) g.addEventListener('keydown', e => { if(e.key === 'Enter') detayKaydet(); });
    const t = $('#kt-toplam');
    if(t) t.addEventListener('keydown', e => { if(e.key === 'Enter') ekleKaydet(); });

    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-kitaplik]');
      if(b) setTimeout(ac, 0);
    });

    try{ if(window.AkisI18n && AkisI18n.onChange) AkisI18n.onChange(() => {
      if($('#view-kitaplik').classList.contains('active')) ciz();
    }); }catch(e){}
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kur);
  else kur();

  /* takvim + yedekleme buradan okur */
  try{
    window.AkoraKitaplik = { ac, ciz, oku, kitaplar, gunSayfa, ozet, ekleAc, disa:()=>veri,
                             ice:(d)=>{ if(d && Array.isArray(d.kitaplar)){ veri = d; yaz(); ciz(); return true; } return false; } };
  }catch(e){}
})();
