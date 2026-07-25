/* ===== premium.js — aylık ~1$ abonelik (native, cordova-plugin-purchase v13) =====
   Ürün ID: akis_premium_monthly (Play + Apple'da "aylık ~1$ abonelik" olarak oluşturulmalı).
   Abone → reklamsız (AkisAds.setPremium(true)). Durum localStorage'da tutulur (açılışta hemen bilinir),
   satın alma/geri-yükleme olaylarıyla güncellenir. Web'de / eklenti yoksa sessizce cache ile devam eder.
   ⚠️ Gerçek satın alma cihazda + mağaza ürünü + sandbox test hesabıyla test edilmeli. */
window.AkisPremium = (function () {
  const PRODUCT_ID = 'akis_premium_monthly';
  const LS_KEY = 'akis_premium';
  let premium = false;
  const listeners = [];

  function readCached() { try { return localStorage.getItem(LS_KEY) === '1'; } catch (e) { return false; } }
  function writeCached(v) { try { localStorage.setItem(LS_KEY, v ? '1' : '0'); } catch (e) {} }
  function isPremium() { return premium; }
  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }
  function emit() { listeners.forEach(fn => { try { fn(premium); } catch (e) {} }); }
  function setPremium(v) {
    v = !!v;
    writeCached(v);
    if (v === premium) return;
    premium = v;
    try { if (window.AkisAds) AkisAds.setPremium(v); } catch (e) {}
    emit();
  }

  function cdv() { return window.CdvPurchase; }
  function storeObj() { const c = cdv(); return c ? c.store : null; }
  function nativePlat() { try { return (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || 'web'; } catch (e) { return 'web'; } }

  function ownedNow() {
    const s = storeObj(); if (!s) return premium;
    try {
      if (typeof s.owned === 'function') return !!s.owned(PRODUCT_ID);
      const p = s.get ? s.get(PRODUCT_ID) : null; return !!(p && p.owned);
    } catch (e) { return premium; }
  }

  async function init() {
    premium = readCached();
    try { if (window.AkisAds) AkisAds.setPremium(premium); } catch (e) {}
    const C = cdv();
    if (!C || nativePlat() === 'web') return;   // eklenti yok / web → cache ile devam
    try {
      const { store, ProductType, Platform } = C;
      store.register([
        { id: PRODUCT_ID, type: ProductType.PAID_SUBSCRIPTION, platform: Platform.GOOGLE_PLAY },
        { id: PRODUCT_ID, type: ProductType.PAID_SUBSCRIPTION, platform: Platform.APPLE_APPSTORE },
      ]);
      store.when()
        .approved(t => { try { t.verify(); } catch (e) { try { t.finish(); } catch (_) {} } })
        .verified(r => { try { r.finish(); } catch (e) {} setPremium(ownedNow()); })
        .receiptUpdated(() => setPremium(ownedNow()))
        .productUpdated(() => { if (ownedNow()) setPremium(true); });
      if (store.error) store.error(() => {});
      await store.initialize([Platform.GOOGLE_PLAY, Platform.APPLE_APPSTORE]);
      setPremium(ownedNow());
    } catch (e) {}
  }

  function priceText() {
    const s = storeObj(); if (!s) return '';
    try {
      const p = s.get(PRODUCT_ID); const off = p && p.getOffer && p.getOffer();
      const ph = off && off.pricingPhases && off.pricingPhases[0];
      return (ph && ph.price) || '';
    } catch (e) { return ''; }
  }

  // Promise<{ok:boolean}> — satın alma diyaloğunu aç
  async function buy() {
    const s = storeObj(); if (!s) return { ok: false, reason: 'store-yok' };
    try {
      const p = s.get(PRODUCT_ID); if (!p) return { ok: false, reason: 'urun-yok' };
      const off = p.getOffer ? p.getOffer() : (p.offers && p.offers[0]);
      if (!off) return { ok: false, reason: 'teklif-yok' };
      if (typeof off.order === 'function') { await off.order(); }
      else if (typeof s.order === 'function') { await s.order(off); }
      else return { ok: false, reason: 'order-yok' };
      return { ok: true };
    } catch (e) { return { ok: false, reason: 'iptal/hata' }; }
  }

  async function restore() {
    const s = storeObj(); if (!s) return;
    try { if (s.restorePurchases) await s.restorePurchases(); setPremium(ownedNow()); } catch (e) {}
  }

  return { init, isPremium, onChange, buy, restore, priceText, PRODUCT_ID };
})();
