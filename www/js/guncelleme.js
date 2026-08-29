/* ============================================================
   AKORA — SÜRÜM DENETİMİ  (2026-08-29)

   Kullanıcı isteği: "güncelleme attığımız zaman uygulamaya tıkladığı
   zaman kişi güncellemeye yönlendirilsin — zorunlu ya da 'yeni sürüm
   var, güncelle' kapısı çıksın."

   Nasıl çalışır:
     1) Açılışta (2 sn sonra, açılışı yavaşlatmasın) kendi sunucumuzdan
        `surum.json` okunur:  https://akis-odak-app.web.app/surum.json
     2) Cihazdaki sürüm kodu ile karşılaştırılır.
     3) `kod` büyükse    → "Yeni sürüm var" kapısı (Sonra / Güncelle)
        `enAzKod` büyükse → ZORUNLU (kapatılamaz, yalnız Güncelle)

   🚨 Mağaza güncellemesi GEREKTİRMEZ — dosya bizim sunucumuzda,
      istediğimiz an değiştiririz. Bu yüzden sürüm çıkarınca
      `site/surum.json` de güncellenir (scripts/surum_yayinla.mjs).

   ⚠️ İnternet yoksa ya da dosya okunamazsa SESSİZCE geçer —
      çevrimdışı kullanıcı asla engellenmez.
   ============================================================ */
(function(){
  'use strict';

  var URL_SURUM = 'https://akis-odak-app.web.app/surum.json';
  var ERTELE_KEY = 'akora.guncelErtele';     // "sonra" denen sürüm kodu
  var BEKLE_MS = 2000;

  function T(k, v){
    try{ return (window.AkisI18n && AkisI18n.t) ? AkisI18n.t(k, v) : ''; }catch(e){ return ''; }
  }
  function M(k, yedek, v){ var s = T(k, v); return (s && s !== k) ? s : yedek; }
  function esc(x){
    return String(x == null ? '' : x).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function yerli(){
    try{ return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); }
    catch(e){ return false; }
  }
  function platform(){
    try{ return (window.Capacitor && Capacitor.getPlatform) ? Capacitor.getPlatform() : 'web'; }
    catch(e){ return 'web'; }
  }

  /* Cihazdaki sürüm kodu. Yerli tarafta @capacitor/app verir;
     web'de index.html'deki ?v= damgasından türetilir (yalnız geliştirme). */
  function mevcutKod(){
    return new Promise(function(cbz){
      try{
        var App = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App;
        if(App && App.getInfo){
          App.getInfo().then(function(i){
            var k = parseInt(i && i.build, 10);
            cbz(isNaN(k) ? 0 : k);
          }).catch(function(){ cbz(0); });
          return;
        }
      }catch(e){}
      cbz(0);
    });
  }

  function magazaAdresi(d){
    var p = platform();
    if(p === 'ios')     return d.apple || '';
    if(p === 'android') return d.play  || '';
    return d.play || d.apple || '';
  }

  function ac(d, zorunlu){
    if(document.getElementById('guncel-kapi')) return;

    var not = '';
    try{
      var dil = (window.AkisI18n && AkisI18n.current) ? AkisI18n.current() : 'tr';
      not = (d.not && (d.not[dil] || d.not.en || d.not.tr)) || '';
    }catch(e){}

    var k = document.createElement('div');
    k.id = 'guncel-kapi';
    k.className = 'guncel-kapi';
    k.innerHTML =
      '<div class="gk-kart">' +
        '<div class="gk-ic" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24"><path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/></svg>' +
        '</div>' +
        '<h3>' + esc(M('guncel_baslik', 'Yeni sürüm var')) + '</h3>' +
        (not ? '<p class="gk-not">' + esc(not) + '</p>' : '') +
        '<p class="gk-surum">' + esc(d.surum || '') + '</p>' +
        '<button class="gk-birincil" id="gk-git">' + esc(M('guncel_git', 'Güncelle')) + '</button>' +
        (zorunlu ? '' : '<button class="gk-sonra" id="gk-sonra">' + esc(M('guncel_sonra', 'Sonra')) + '</button>') +
      '</div>';
    document.body.appendChild(k);

    var git = k.querySelector('#gk-git');
    if(git) git.addEventListener('click', function(){
      var adres = magazaAdresi(d);
      if(!adres) return;
      try{
        var Br = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Browser;
        if(Br && Br.open){ Br.open({url: adres}); return; }
      }catch(e){}
      try{ window.open(adres, '_blank', 'noopener'); }catch(e){}
    });

    var son = k.querySelector('#gk-sonra');
    if(son) son.addEventListener('click', function(){
      try{ localStorage.setItem(ERTELE_KEY, String(d.kod || 0)); }catch(e){}
      k.remove();
    });
  }

  function denetle(){
    // Sürüm dosyası önbellekten okunmasın — biz onu anlık değiştiriyoruz
    fetch(URL_SURUM + '?t=' + Date.now(), {cache: 'no-store'})
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){
        if(!d || !d.kod) return;
        return mevcutKod().then(function(simdi){
          if(!simdi) return;                       // sürüm okunamadı → karışma
          var zorunlu = !!(d.enAzKod && simdi < d.enAzKod);
          if(simdi >= d.kod) return;               // güncel

          if(!zorunlu){
            var ert = 0;
            try{ ert = parseInt(localStorage.getItem(ERTELE_KEY), 10) || 0; }catch(e){}
            if(ert >= d.kod) return;               // bu sürüm için "sonra" denmiş
          }
          ac(d, zorunlu);
        });
      })
      .catch(function(){ /* çevrimdışı → sessiz geç */ });
  }

  function kur(){
    if(!yerli()) return;                           // tarayıcıda kapı gösterme
    setTimeout(denetle, BEKLE_MS);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kur);
  else kur();

  try{ window.AkoraGuncelleme = { denetle: denetle }; }catch(e){}
})();
