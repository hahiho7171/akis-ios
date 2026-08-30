/* yedek.js — YEDEĞİN TEK GERÇEK KAYNAĞI (2026-08-30)

   Önce yedeğin içeriği İKİ yerde ayrı ayrı kuruluyordu: app.js'in "Verini dışa
   aktar" düğmesi ve hesap.js'in bulut yedeği. İkisi de `AkisStats.exportData()`
   üstüne Kitaplık'ı elle ekliyordu — yani aynı gerçeğin iki kopyası vardı.
   🔴 ÖLÇÜLEN KAYIP: ikisinde de **Bahçem yerleşimi** (`akora.plot.v1`) ve
      **uygulama ayarları** (`akis.settings.v1`) YOKTU. Telefon değiştiren
      kullanıcı jetonunu ve satın aldığı süsleri geri alıyor ama bahçesini
      nasıl dizdiğini ve sürelerini/temasını kaybediyordu.

   Bundan sonra yedeğe bir şey eklenecekse YALNIZ BURAYA eklenir; iki taraf da
   buradan okur. Yeni bir kalıcı depo (localStorage anahtarı) açan herkes
   `PARCALAR` listesine bir satır ekler.

   Eski yedekler bozulmaz: yeni alanlar yoksa sessizce atlanır. */
const AkoraYedek = (() => {

  /* Ana istatistik (`akis.stats.v1`) AkisStats.exportData() ile gelir.
     Buradakiler ONUN DIŞINDA kalan, kendi kutusunda duran parçalar. */
  const PARCALAR = [
    { alan: 'ayarlar', anahtar: 'akis.settings.v1' },   // süreler, tema, seçili görsel/ses, dil
    { alan: 'bahce',   anahtar: 'akora.plot.v1'    }    // Bahçem'de neyi nereye koyduğu
  ];

  function topla(){
    let o = {};
    try{ o = JSON.parse(AkisStats.exportData()); }catch(e){ o = { app:'akis', v:1 }; }
    try{ if(window.AkoraKitaplik) o.kitaplik = AkoraKitaplik.disa(); }catch(e){}
    PARCALAR.forEach(p => {
      try{
        const ham = localStorage.getItem(p.anahtar);
        if(ham) o[p.alan] = JSON.parse(ham);
      }catch(e){}
    });
    o.cihazSaati = new Date().toISOString();
    return o;
  }

  function metin(){ return JSON.stringify(topla()); }

  /* Nesne ya da metin kabul eder. İstatistik tutmazsa yedek bozuktur →
     ÖTEKİ PARÇALARA DOKUNULMAZ (yarı yüklenmiş hâl en kötüsü). */
  function uygula(nesneVeyaMetin){
    let o = nesneVeyaMetin;
    if(typeof o === 'string'){ try{ o = JSON.parse(o); }catch(e){ return false; } }
    if(!o) return false;

    let tamam = false;
    try{ tamam = AkisStats.importData(o); }catch(e){}
    if(!tamam) return false;

    try{ if(o.kitaplik && window.AkoraKitaplik) AkoraKitaplik.ice(o.kitaplik); }catch(e){}
    PARCALAR.forEach(p => {
      try{ if(o[p.alan]) localStorage.setItem(p.anahtar, JSON.stringify(o[p.alan])); }catch(e){}
    });
    return true;
  }

  return { topla, metin, uygula };
})();

/* 🪤 `const` ile tanımlanan modül global nesneye YAZILMAZ (yalnız `var`/fonksiyon
   yazar) — stats.js'te 2026-08-27'de ölçülerek bulunmuştu. Elle bağlanır. */
try{ window.AkoraYedek = AkoraYedek; }catch(e){}
