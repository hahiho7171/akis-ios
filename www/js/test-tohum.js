/* ============================================================
   AKORA — TEST TOHUMU  (yalnız indirme linkindeki test sürümünde)

   🚨 BU DOSYA MAĞAZA SÜRÜMÜNE GİRMEZ.
      Play/App Store derlemesinden ÖNCE index.html'deki
      <script src="js/test-tohum.js"> satırı SİLİNİR.
      Bekçi: node scripts/magaza_oncesi.mjs  (tohum bağlıysa çıkış kodu 1)

   Ne yapar:
     1) Jeton tazeler (5.000'in altına düşerse 25.000'e çıkarır)
     2) Premium'u AÇIK SABİTLER → reklam çıkmaz, premium sesler açılır
     3) Tanıtım turunu atlar

   🪤 NEDEN "SABİTLEME" GEREKİYOR:
      premium.js açılışta localStorage'daki değeri okuyor, AMA sonra
      Play Faturalandırma'ya soruyor: `store.initialize(...)` → gerçek
      abonelik yok → `setPremium(false)` → yazdığımız '1' EZİLİYOR ve
      reklamlar geri geliyor. Bu yüzden yalnız değer yazmak yetmez;
      isPremium() ve AkisAds.setPremium() sarmalanır, mağaza cevabı
      geç geldiği için birkaç kez tekrar uygulanır.
   ============================================================ */
(function(){
  'use strict';

  var JETON_TABAN = 5000, JETON_HEDEF = 25000;

  /* ---- 1) Jeton: her açılışta tabanın altındaysa doldur ---- */
  function jetonTazele(){
    try{
      var K = 'akis.stats.v1', d = {};
      try{ d = JSON.parse(localStorage.getItem(K)) || {}; }catch(e){ d = {}; }
      d.sessions = d.sessions || {};
      d.items    = d.items    || [];
      if((d.coins || 0) < JETON_TABAN){
        d.coins = JETON_HEDEF;
        localStorage.setItem(K, JSON.stringify(d));
        try{ if(window.AkisStats && AkisStats.importData) AkisStats.importData({app:'akis', stats:d}); }catch(e){}
      }
    }catch(e){}
  }

  /* ---- 2) Premium'u sabitle ---- */
  var sarmalandi = false;
  function premiumSabitle(){
    try{
      localStorage.setItem('akis_premium', '1');

      if(window.AkisPremium && !window.AkisPremium.__testKilit){
        window.AkisPremium.isPremium = function(){ return true; };
        window.AkisPremium.__testKilit = true;
      }
      if(window.AkisAds && !sarmalandi && typeof window.AkisAds.setPremium === 'function'){
        var eski = window.AkisAds.setPremium;
        // mağaza "abonelik yok" deyip false göndermeye çalışsa da yok say
        window.AkisAds.setPremium = function(){ return eski.call(window.AkisAds, true); };
        sarmalandi = true;
      }
      if(window.AkisAds && window.AkisAds.setPremium) window.AkisAds.setPremium(true);
    }catch(e){}
  }

  try{ localStorage.setItem('akis.tour.v2', '1'); }catch(e){}
  jetonTazele();
  premiumSabitle();

  function hazir(){
    jetonTazele();
    premiumSabitle();
    // Faturalandırma cevabı saniyeler sonra gelip premium'u kapatmaya çalışıyor;
    // o pencerede birkaç kez daha uygula.
    [500, 1500, 3000, 6000, 10000, 20000, 30000].forEach(function(ms){
      setTimeout(premiumSabitle, ms);
    });
    if(window.console) console.info('[Akora] TEST tohumu: jeton + Premium sabitlendi');
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hazir);
  else hazir();
})();
