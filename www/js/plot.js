/* ===== plot.js — "Bahçem": dekore edilebilir izometrik alan (2026-08-27) =====

   Kullanıcı isteği: "tıklayınca genişleyen bir alan olsun, marketten aldığın süsleri
   oraya istediğin yere koyabilsin — gerçek oyun deneyimi gibi."

   NE YAPAR
   - Yüzen izometrik ada (kalınlıklı plaka), N×N hücre.
   - Kazanılan ağaçlar hücrelere yerleşir; Süs Dükkânı'ndan alınan süsler İSTENEN yere konur.
   - Sürükle-bırak taşıma · iki parmakla / tekerlekle yakınlaştırma · boş alanda kaydırma.
   - Yerleşim localStorage'da; bir daha açınca aynı duruyor.

   NEDEN MOTOR YOK: Phaser ~1 MB, PixiJS ~450 KB. Buradaki nesne sayısı (~60) için
   canvas 2D fazlasıyla yeterli; sayaç uygulamasında boşuna paket ağırlığı ve pil gitmesin.
   Ağaç/süs çizimleri garden.js'ten alınır → iki ekranda AYNI görsel dil.

   API: AkisPlot.mount(canvas) / unmount() / rebuild() */
const AkisPlot = (() => {
  const KEY = 'akora.plot.v1';

  let cv = null, ctx = null, raf = null, t0 = 0;
  let N = 7;                                  // ızgara kenarı (ağaç sayısıyla büyür)
  let items = [];                             // {k:'tree'|'deco', id, seed, stage, pale, col, row}
  let zoom = 1, panX = 0, panY = 0;
  let secili = null, surukle = null, sonDokunma = null, pinch = null;
  let degisti = false;
  /* ============== BOYALI AĞAÇ GÖRSELLERİ (2026-08-27) ==============
     Kodla çizilen ağaçlar yerine gerçek illüstrasyon kullanılır.
     Dosya YOKSA sessizce eski çizime düşer — yani görsel eklemek kırmıcı değil,
     her evre için ayrı ayrı ve kademeli geçilebilir. */
  const AGAC_GORSEL = {};                 // evre -> Image | 'yok'
  const AGAC_BOYALI = {};                 // 'evre|palet' -> renklendirilmiş tuval

  /* Boyalı ağaç yeşil üretiliyor; 6 palet için 24 ayrı görsel üretmek yerine
     RENK DÖNDÜRME uygulanıyor. Sonuç bir kez tuvale çizilip saklanır (her karede
     filtre uygulamak telefonda pahalı). */
  const PALET_ACI = { forest: 0, sakura: 218, autumn: 292, frost: 96, golden: 306, mor: 168 };
  function boyaliAgac(evre, palet) {
    const im = agacGorsel(evre);
    if (!im) return null;
    if (!palet || palet === 'forest' || !(palet in PALET_ACI)) return im;
    if (aktifTur() !== 'klasik') return im;   // tür görselleri kendi renginde kalır
    const k = aktifTur() + '|' + evre + '|' + palet;
    if (AGAC_BOYALI[k]) return AGAC_BOYALI[k];
    try {
      const c = document.createElement('canvas');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const g = c.getContext('2d');
      g.filter = 'hue-rotate(' + PALET_ACI[palet] + 'deg) saturate(1.12)';
      g.drawImage(im, 0, 0);
      AGAC_BOYALI[k] = c;
      return c;
    } catch (e) { return im; }
  }

  /* ---- AĞAÇ TÜRÜ (2026-08-29) ----
     'klasik' = elle boyanmış 4 evre (sprout/sapling/tree/bigtree).
     Diğer türlerin TEK görseli var; her evrede aynı resim kullanılır,
     boyut zaten evreye göre ölçekleniyor (bkz. çizim: it.stage yüksekliği).
     Tür değişince önbellek temizlenmeli → gorselTemizle(). */
  function aktifTur() {
    try { return (window.AkisStats && AkisStats.activeTree) ? AkisStats.activeTree() : 'klasik'; }
    catch (e) { return 'klasik'; }
  }
  function gorselYolu(evre) {
    const tur = aktifTur();
    return tur === 'klasik' ? ('assets/agac/' + evre + '.webp')
                            : ('assets/agac/turler/' + tur + '.webp');
  }
  function gorselTemizle() {
    for (const k in AGAC_GORSEL) delete AGAC_GORSEL[k];
    for (const k in AGAC_BOYALI) delete AGAC_BOYALI[k];
  }

  function agacGorsel(evre) {
    const anah = aktifTur() + '|' + evre;
    if (AGAC_GORSEL[anah] === 'yok') return null;
    if (AGAC_GORSEL[anah]) return AGAC_GORSEL[anah].tamam ? AGAC_GORSEL[anah] : null;
    const im = new Image();
    im.tamam = false;
    im.onload = function () { im.tamam = true; };
    im.onerror = function () { AGAC_GORSEL[anah] = 'yok'; };
    im.src = gorselYolu(evre);
    AGAC_GORSEL[anah] = im;
    return null;
  }

  /* Deterministik sahte rastgele — manzara (dağ, bulut, yıldız) ve hava taneleri
     her karede AYNI yerde dursun diye. garden.js'te de aynısı var; plot.js kendi
     kopyasını taşır, çünkü modüller birbirinin iç fonksiyonlarını görmez. */
  function rnd(seed){ const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  const TW = 76, TH = 38;                     // hücre genişlik/yükseklik (izometrik)

  /* Zemin desenleri — Süs Dükkânı'ndan jetonla açılır (2026-08-27).
     ust/alt: çim gradyanı · yan/on: toprak katmanı · cizgi: hücre ızgarası rengi */
  const ZEMIN = {
    grass:  { ust:'#5aa86a', orta:'#438a55', alt:'#2e6b3d', yan:'#4a3524', on:'#3a2a1c', cizgi:'rgba(255,255,255,.07)' },
    meadow: { ust:'#7dbf6a', orta:'#5da255', alt:'#3d7c3c', yan:'#54402c', on:'#413122', cizgi:'rgba(255,255,255,.09)' },
    sand:   { ust:'#e0c893', orta:'#cbab72', alt:'#a98a56', yan:'#6b5636', on:'#54432a', cizgi:'rgba(120,90,40,.14)' },
    stone:  { ust:'#9aa3a8', orta:'#7c868c', alt:'#5c666c', yan:'#4a4f52', on:'#393d40', cizgi:'rgba(255,255,255,.10)' },
    snow:   { ust:'#eef4f8', orta:'#d6e2ea', alt:'#b4c6d2', yan:'#7d8894', on:'#616a74', cizgi:'rgba(90,120,150,.13)' },
    night:  { ust:'#3f5a7a', orta:'#31485f', alt:'#233448', yan:'#2a2438', on:'#1e1a29', cizgi:'rgba(180,210,255,.10)' }
  };
  function zemin() {
    let id = 'grass';
    try { if (typeof AkisStats !== 'undefined' && AkisStats.activeGround) id = AkisStats.activeGround(); } catch (e) { }
    return ZEMIN[id] || ZEMIN.grass;
  }

  /* ----------------------------------------------------------- kayıt */
  function yukle() {
    try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && Array.isArray(d.items)) return d; } catch (e) { }
    return null;
  }
  function kaydet() {
    if (!degisti) return;
    try { localStorage.setItem(KEY, JSON.stringify({ n: N, items: items })); degisti = false; } catch (e) { }
  }

  /* -------------------------------------------- ızgara ↔ ekran dönüşümü */
  function iso(col, row) { return { x: (col - row) * (TW / 2), y: (col + row) * (TH / 2) }; }
  function isoTers(x, y) {           // kesirli hücre koordinatı
    const a = x / (TW / 2), b = y / (TH / 2);
    return { col: (b + a) / 2, row: (b - a) / 2 };
  }
  function merkez() {
    // adanın dikey ortası = (N*TH)/2; tuvalin ortasına oturt (yukarıda ağaç boyu için pay bırak)
    const yariAda = (N * TH / 2) * zoom;
    return { x: cv.clientWidth / 2 + panX, y: cv.clientHeight / 2 - yariAda + 34 * zoom + panY };
  }
  function ekrana(col, row) {
    const m = merkez(), p = iso(col, row);
    return { x: m.x + p.x * zoom, y: m.y + p.y * zoom };
  }
  function ekrandan(sx, sy) {
    const m = merkez();
    const f = isoTers((sx - m.x) / zoom, (sy - m.y) / zoom);
    return { col: Math.floor(f.col), row: Math.floor(f.row) };
  }
  /* Nesne, hücrenin KÖŞESİNE değil ORTASINA konur — yoksa kenar hücrelerdeki
     ağaçlar plakanın dışına taşıyor (2026-08-27'de görüntüde yakalandı). */
  function ekranaOrta(col, row) { return ekrana(col + 0.5, row + 0.5); }
  function icinde(c, r) { return c >= 0 && r >= 0 && c < N && r < N; }
  function bosMu(c, r, haric) { return !items.some(it => it !== haric && it.col === c && it.row === r); }

  /* ------------------------------------------------- yerleşimi kur/tazele */
  function rebuild() {
    const kayit = yukle();
    const agaclar = (window.AkisStats && AkisStats.items) ? AkisStats.items().filter(x => x.min != null) : [];
    const susler = (window.AkisStats && AkisStats.ownedDecos) ? AkisStats.ownedDecos() : [];

    /* Ada boyutu artık OTOMATİK değil — kullanıcı jetonla genişletiyor (Dükkân › Genişlet).
       Yine de eşya sığmazsa taşmasın diye alt sınır konur. */
    let satinAlinan = 7;
    try { if (typeof AkisStats !== 'undefined' && AkisStats.plotSize) satinAlinan = AkisStats.plotSize(); } catch (e) { }
    const gerekli = Math.ceil(Math.sqrt(agaclar.length + susler.length + 4));
    N = Math.max(satinAlinan, gerekli, 7);

    const eski = new Map();
    if (kayit) kayit.items.forEach(it => eski.set(it.k + ':' + it.id, it));

    items = [];
    // ağaçlar: kayıtlı yeri varsa oraya, yoksa boş bir hücreye
    agaclar.forEach((a, i) => {
      const anahtar = 'tree:' + (a.ts || i);
      const k = eski.get(anahtar);
      const ev = (window.AkisGarden && AkisGarden.evre) ? AkisGarden.evre(a) : (a.type || 'sapling');
      const it = { k: 'tree', id: (a.ts || i), seed: i, stage: ev, pale: !!a.pale, col: 0, row: 0 };
      if (k && icinde(k.col, k.row) && bosMu(k.col, k.row)) { it.col = k.col; it.row = k.row; }
      else { const y = ilkBos(i); it.col = y.col; it.row = y.row; }
      items.push(it);
    });
    // süsler
    susler.forEach((sid, i) => {
      const k = eski.get('deco:' + sid);
      const it = { k: 'deco', id: sid, seed: i, col: 0, row: 0 };
      if (k && icinde(k.col, k.row) && bosMu(k.col, k.row)) { it.col = k.col; it.row = k.row; }
      else { const y = ilkBos(agaclar.length + i); it.col = y.col; it.row = y.row; }
      items.push(it);
    });
    degisti = true; kaydet();
  }
  function ilkBos(tohum) {
    // deterministik ama dağınık: altın oranla tara, dolu hücreyi atla
    for (let d = 0; d < N * N; d++) {
      const i = Math.floor((tohum * 2 + d) * 0.6180339887 * N * N) % (N * N);
      const c = i % N, r = Math.floor(i / N);
      if (bosMu(c, r)) return { col: c, row: r };
    }
    return { col: 0, row: 0 };
  }


  /* =================== GÜN DÖNGÜSÜ (gerçek saate göre) ===================
     Anahtar saatler arasında renk geçişi. isikAci: güneş/ayın gökteki yeri —
     GÖLGE YÖNÜ buradan gelir, o yüzden sahne saat ilerledikçe canlı durur. */
  const GUN = [
    { t: 0.00, ust: [11, 17, 44], ufuk: [26, 40, 76],  isik: [206, 216, 255], ortam: [40, 52, 96],  gece: 1 },
    { t: 0.22, ust: [40, 52, 104], ufuk: [214, 132, 106], isik: [255, 208, 168], ortam: [126, 106, 122], gece: 0.55 },
    { t: 0.30, ust: [64, 126, 196], ufuk: [176, 214, 238], isik: [255, 244, 214], ortam: [206, 224, 236], gece: 0 },
    { t: 0.54, ust: [58, 126, 206], ufuk: [190, 224, 244], isik: [255, 250, 232], ortam: [216, 234, 244], gece: 0 },
    { t: 0.76, ust: [58, 62, 122], ufuk: [232, 138, 92],  isik: [255, 194, 140], ortam: [150, 122, 128], gece: 0.45 },
    { t: 0.86, ust: [22, 32, 74],  ufuk: [43, 58, 99],   isik: [206, 216, 255], ortam: [56, 68, 112], gece: 0.9 },
    { t: 1.00, ust: [11, 17, 44],  ufuk: [26, 40, 76],   isik: [206, 216, 255], ortam: [40, 52, 96],  gece: 1 }
  ];
  function karistir(a, b, k) { return [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * k); }); }
  function rgbs(a) { return 'rgb(' + a[0] + ',' + a[1] + ',' + a[2] + ')'; }
  function rgbas(a, al) { return 'rgba(' + a[0] + ',' + a[1] + ',' + a[2] + ',' + al + ')'; }

  function gunDurum() {
    const d = new Date();
    const f = (d.getHours() + d.getMinutes() / 60) / 24;
    let i = 0;
    while (i < GUN.length - 2 && GUN[i + 1].t < f) i++;
    const a = GUN[i], b = GUN[i + 1];
    const k = Math.max(0, Math.min(1, (f - a.t) / (b.t - a.t || 1)));
    return {
      f: f,
      ust: karistir(a.ust, b.ust, k),
      ufuk: karistir(a.ufuk, b.ufuk, k),
      isik: karistir(a.isik, b.isik, k),
      ortam: karistir(a.ortam, b.ortam, k),
      gece: a.gece + (b.gece - a.gece) * k,
      // ışık kaynağı: 06:00 doğu → 18:00 batı; gece ay ters yönden
      aci: Math.PI * (((f - 0.25) % 1) + (f < 0.25 || f > 0.79 ? 0 : 0))
    };
  }
  /* Işık kaynağının ekrandaki konumu (0..1 yatay, 0..1 dikey) */
  function isikKonumu(g) {
    let u = (g.f - 0.25) * 2;                 // 06:00→0, 18:00→1
    if (u < 0 || u > 1) {                     // gece: ay
      u = ((g.f + 0.25) % 1) * 2 % 1;
    }
    return { x: 0.10 + u * 0.80, y: 0.30 - Math.sin(u * Math.PI) * 0.18 };
  }

  /* ======================= MANZARA (arka plan) ======================= */
  function manzara(ctx, W, H, g, time) {
    // gökyüzü
    const sk = ctx.createLinearGradient(0, 0, 0, H * 0.72);
    sk.addColorStop(0, rgbs(g.ust));
    sk.addColorStop(0.68, rgbs(karistir(g.ust, g.ufuk, 0.72)));
    sk.addColorStop(1, rgbs(g.ufuk));
    ctx.fillStyle = sk; ctx.fillRect(0, 0, W, H);

    const px = panX * 0.06, py = panY * 0.04;      // parallax: gök en yavaş kayar

    // yıldızlar (yalnız gece)
    if (g.gece > 0.15) {
      for (let i = 0; i < 26; i++) {
        const sx = ((rnd(i * 3.7 + 0.9) * W) + px * 0.4 + W) % W;
        const sy = rnd(i * 5.1 + 2.3) * H * 0.42 + py * 0.4;
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * 0.5 + i * 2.1));
        ctx.fillStyle = 'rgba(232,240,252,' + (0.5 * tw * g.gece).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(sx, sy, i % 5 === 0 ? 1.7 : 1.0, 0, 7); ctx.fill();
      }
    }

    // güneş / ay + ışıma
    const lk = isikKonumu(g);
    const lx = W * lk.x + px, ly = H * lk.y + py;
    const yari = Math.max(9, H * (g.gece > 0.5 ? 0.021 : 0.028));
    const gl = ctx.createRadialGradient(lx, ly, 2, lx, ly, H * 0.40);
    gl.addColorStop(0, rgbas(g.isik, 0.26)); gl.addColorStop(1, rgbas(g.isik, 0));
    ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H * 0.8);
    ctx.fillStyle = rgbas(g.isik, 0.95);
    ctx.beginPath(); ctx.arc(lx, ly, yari, 0, 7); ctx.fill();

    // bulutlar (yavaş sürüklenir)
    for (let i = 0; i < 5; i++) {
      const hz = 0.008 + rnd(i * 7.3) * 0.010;
      const cx = ((rnd(i * 2.9) + time * hz) % 1.25 - 0.12) * W + px * 1.6;
      const cy = H * (0.10 + rnd(i * 4.1) * 0.26) + py;
      const cw = W * (0.16 + rnd(i * 6.7) * 0.16);
      ctx.fillStyle = rgbas(karistir(g.ufuk, [255, 255, 255], g.gece > 0.5 ? 0.16 : 0.55), 0.30);
      for (let b = 0; b < 4; b++) {
        const bx = cx + (b - 1.5) * cw * 0.26, by = cy + (b % 2) * cw * 0.05;
        ctx.beginPath(); ctx.ellipse(bx, by, cw * (0.20 + 0.10 * rnd(i * 9 + b)), cw * 0.085, 0, 0, 7); ctx.fill();
      }
    }

    // uzak dağlar — 3 katman, uzaktakiler ufuk rengine daha çok karışır (atmosferik perspektif)
    /* Ufuk 0.60'tayken daglar adanin ARKASINDA kaliyordu; 0.44'e alindi ve
       yukseltildi ki adanin ust kosesinin USTUNDE gorunsunler. */
    const ufukY = H * 0.44;
    const katman = [
      { y: ufukY - H * 0.02, h: H * 0.26, f: 2.6, kar: 0.66, hiz: 0.10 },
      { y: ufukY + H * 0.03, h: H * 0.20, f: 4.4, kar: 0.44, hiz: 0.22 },
      { y: ufukY + H * 0.08, h: H * 0.15, f: 7.2, kar: 0.22, hiz: 0.38 }
    ];
    katman.forEach(function (kt, ki) {
      const renk = karistir([46, 62, 78], g.ufuk, kt.kar);
      ctx.fillStyle = rgbs(renk);
      ctx.beginPath();
      ctx.moveTo(-20, kt.y + kt.h);
      const kay = px * kt.hiz;
      for (let x = -20; x <= W + 20; x += 8) {
        const n = Math.sin((x + kay) * 0.0042 * kt.f + ki * 2.3) * 0.5
                + Math.sin((x + kay) * 0.011 * kt.f + ki * 5.1) * 0.34
                + Math.sin((x + kay) * 0.0026 * kt.f + ki) * 0.16;
        ctx.lineTo(x, kt.y - n * kt.h * 0.62);
      }
      ctx.lineTo(W + 20, kt.y + kt.h); ctx.closePath(); ctx.fill();
      // karlı tepe (yalnız en arkadaki, gündüz belirgin)
      if (ki === 0 && g.gece < 0.7) {
        ctx.save(); ctx.globalAlpha = 0.30 * (1 - g.gece); ctx.fillStyle = '#eef4fa';
        ctx.beginPath(); ctx.moveTo(-20, kt.y + kt.h);
        for (let x = -20; x <= W + 20; x += 8) {
          const n = Math.sin((x + kay) * 0.0042 * kt.f + ki * 2.3) * 0.5
                  + Math.sin((x + kay) * 0.011 * kt.f + ki * 5.1) * 0.34
                  + Math.sin((x + kay) * 0.0026 * kt.f + ki) * 0.16;
          const yy = kt.y - n * kt.h * 0.62;
          ctx.lineTo(x, yy + (n > 0.55 ? 0 : kt.h));
        }
        ctx.lineTo(W + 20, kt.y + kt.h); ctx.closePath(); ctx.fill(); ctx.restore();
      }
    });

    // ufuk pusu — dağ ile ada arasını yumuşatır, derinlik hissi verir
    const ps = ctx.createLinearGradient(0, ufukY + H * 0.02, 0, ufukY + H * 0.26);
    ps.addColorStop(0, rgbas(g.ufuk, 0));
    ps.addColorStop(0.45, rgbas(g.ufuk, 0.42));
    ps.addColorStop(1, rgbas(g.ufuk, 0));
    ctx.fillStyle = ps; ctx.fillRect(0, ufukY + H * 0.02, W, H * 0.26);
  }

  /* ============================ HAVA ============================ */
  function havaTuru() {
    try { if (typeof AkisStats !== 'undefined' && AkisStats.activeWeather) return AkisStats.activeWeather(); }
    catch (e) { }
    return 'clear';
  }
  function hava(ctx, W, H, tur, time, g) {
    if (tur === 'rain') {
      ctx.strokeStyle = 'rgba(186,214,238,.34)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      for (let i = 0; i < 90; i++) {
        const hz = 420 + rnd(i * 3.1) * 260;
        const x = (rnd(i * 1.7) * W + (time * 26) % W) % W;
        const y = ((rnd(i * 2.3) * H) + time * hz) % (H + 40) - 20;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 15); ctx.stroke();
      }
    } else if (tur === 'snow') {
      for (let i = 0; i < 70; i++) {
        const hz = 24 + rnd(i * 5.7) * 34;
        const x = (rnd(i * 1.3) * W + Math.sin(time * 0.5 + i) * 22 + W) % W;
        const y = ((rnd(i * 4.1) * H) + time * hz) % (H + 20) - 10;
        const r = 1.2 + rnd(i * 7.9) * 2.0;
        ctx.fillStyle = 'rgba(246,251,255,' + (0.42 + rnd(i * 2.2) * 0.42).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      }
    } else if (tur === 'fog') {
      for (let i = 0; i < 4; i++) {
        const y = H * (0.46 + i * 0.10);
        const x = ((time * (6 + i * 3)) % (W * 1.6)) - W * 0.3;
        const gg = ctx.createLinearGradient(x, y, x + W * 0.9, y);
        gg.addColorStop(0, 'rgba(226,238,246,0)');
        gg.addColorStop(0.5, 'rgba(226,238,246,.16)');
        gg.addColorStop(1, 'rgba(226,238,246,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.ellipse(x + W * 0.45, y, W * 0.48, H * 0.035, 0, 0, 7); ctx.fill();
      }
    } else if (tur === 'firefly') {
      for (let i = 0; i < 22; i++) {
        const fx = W * (0.10 + rnd(i * 2.7) * 0.80) + Math.sin(time * 0.6 + i * 1.7) * 26;
        const fy = H * (0.45 + rnd(i * 4.3) * 0.42) + Math.cos(time * 0.45 + i) * 18;
        const par = 0.35 + 0.65 * Math.abs(Math.sin(time * 2.1 + i * 1.3));
        const rg = ctx.createRadialGradient(fx, fy, 0, fx, fy, 13);
        rg.addColorStop(0, 'rgba(250,232,150,' + (0.72 * par).toFixed(2) + ')');
        rg.addColorStop(1, 'rgba(250,232,150,0)');
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(fx, fy, 13, 0, 7); ctx.fill();
      }
    }
  }

  /* ------------------------------------------------------------- çizim */
  function loop() { raf = requestAnimationFrame(loop); ciz((performance.now() - t0) / 1000); }

  function ciz(time) {
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (W < 2 || H < 2) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const gun = gunDurum();
    manzara(ctx, W, H, gun, time);

    adaCiz(time, gun);

    // nesneler: arkadan öne (col+row artan)
    const sirali = items.slice().sort((a, b) => (a.col + a.row) - (b.col + b.row));
    sirali.forEach(it => nesneCiz(it, time, dpr, gun));

    // seçili nesnenin altında halka
    if (secili) {
      const p = ekranaOrta(secili.col, secili.row);
      ctx.save(); ctx.strokeStyle = 'rgba(110,240,214,.9)'; ctx.lineWidth = 2.4;
      ctx.setLineDash([6, 5]); ctx.lineDashOffset = -time * 22;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, TW * 0.42 * zoom, TH * 0.42 * zoom, 0, 0, 7); ctx.stroke();
      ctx.restore();
    }

    /* Ortam ışığı: gündüz sıcak, gece mavi — bütün sahneye TEK katman.
       Ada, nesneler ve manzara aynı ışığı alınca "aynı dünyada" duruyorlar. */
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.16 + gun.gece * 0.10;
    ctx.fillStyle = rgbs(gun.ortam);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    if (gun.gece > 0.35) {
      ctx.save(); ctx.globalAlpha = 0.16 * gun.gece;
      ctx.fillStyle = 'rgb(24,38,86)'; ctx.fillRect(0, 0, W, H); ctx.restore();
    }

    hava(ctx, W, H, havaTuru(), time, gun);

    // vinyet — kenarları koyulaştırır, göz ortada kalır
    const vg = ctx.createRadialGradient(W / 2, H * 0.52, Math.min(W, H) * 0.30,
                                        W / 2, H * 0.52, Math.max(W, H) * 0.74);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.34)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  function adaCiz(time, gun) {
    const z = zemin();
    const kalinlik = 26 * zoom;
    // plaka kenarları (toprak) — dört köşe
    const k = [ekrana(0, 0), ekrana(N, 0), ekrana(N, N), ekrana(0, N)];
    ctx.beginPath();
    ctx.moveTo(k[3].x, k[3].y + kalinlik);
    ctx.lineTo(k[2].x, k[2].y + kalinlik);
    ctx.lineTo(k[2].x, k[2].y);
    ctx.lineTo(k[3].x, k[3].y);
    ctx.closePath();
    ctx.fillStyle = z.yan; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(k[2].x, k[2].y + kalinlik);
    ctx.lineTo(k[1].x, k[1].y + kalinlik);
    ctx.lineTo(k[1].x, k[1].y);
    ctx.lineTo(k[2].x, k[2].y);
    ctx.closePath();
    ctx.fillStyle = z.on; ctx.fill();

    // çim üstü
    ctx.beginPath();
    ctx.moveTo(k[0].x, k[0].y); ctx.lineTo(k[1].x, k[1].y);
    ctx.lineTo(k[2].x, k[2].y); ctx.lineTo(k[3].x, k[3].y);
    ctx.closePath();
    const gg = ctx.createLinearGradient(k[0].x, k[0].y, k[2].x, k[2].y);
    gg.addColorStop(0, z.ust); gg.addColorStop(0.5, z.orta); gg.addColorStop(1, z.alt);
    ctx.fillStyle = gg; ctx.fill();

    // hücre çizgileri (soluk) — düzenlerken nereye koyacağını gösterir
    ctx.save(); ctx.strokeStyle = z.cizgi; ctx.lineWidth = 1;
    for (let i = 0; i <= N; i++) {
      let a = ekrana(i, 0), b = ekrana(i, N);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      a = ekrana(0, i); b = ekrana(N, i);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();

    // sürüklerken hedef hücreyi vurgula
    if (surukle && surukle.hedef) {
      const h = surukle.hedef, p = ekranaOrta(h.col, h.row);
      const uygun = icinde(h.col, h.row) && bosMu(h.col, h.row, surukle.it);
      ctx.save();
      ctx.fillStyle = uygun ? 'rgba(110,240,214,.28)' : 'rgba(240,110,110,.28)';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - TH / 2 * zoom); ctx.lineTo(p.x + TW / 2 * zoom, p.y);
      ctx.lineTo(p.x, p.y + TH / 2 * zoom); ctx.lineTo(p.x - TW / 2 * zoom, p.y);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }

  function nesneCiz(it, time, dpr, gun) {
    const p = ekranaOrta(it.col, it.row);
    const S = zoom * (it.k === 'tree' ? 0.85 : 0.9);
    /* GÖLGE IŞIĞA GÖRE: kaynak solda ise gölge sağa uzar; öğlen kısalır, akşam uzar.
       Saat ilerledikçe gölge dönünce sahne üç boyutlu okunuyor. */
    const lk = isikKonumu(gun);
    const yon = (0.5 - lk.x) * 2;                       // -1 sol .. +1 sağ
    const boy = 1 + Math.abs(yon) * 1.5;                // ufka yakın ışık → uzun gölge
    const koyu = 0.34 - gun.gece * 0.12;
    ctx.save(); ctx.globalAlpha = Math.max(0.12, koyu);
    ctx.fillStyle = 'rgba(8,22,14,.9)';
    ctx.beginPath();
    ctx.ellipse(p.x + yon * 13 * S * boy, p.y + 2, 20 * S * boy, 7 * S, 0, 0, 7);
    ctx.fill(); ctx.restore();

    if (it.k === 'tree') {
      let palet = 'forest';
      try { if (typeof AkisStats !== 'undefined' && AkisStats.activePalette) palet = AkisStats.activePalette(); } catch (e) { }
      const gorsel = boyaliAgac(it.stage, palet);
      if (gorsel) {                                  // boyalı illüstrasyon
        const yuk = (it.stage === 'bigtree' ? 132 : it.stage === 'tree' ? 108
                   : it.stage === 'sapling' ? 74 : 44) * S;
        const gw = gorsel.naturalWidth || gorsel.width;
        const gh = gorsel.naturalHeight || gorsel.height;
        const gen = yuk * ((gw / gh) || 0.83);
        if (it.pale) ctx.globalAlpha = 0.45;
        ctx.drawImage(gorsel, p.x - gen / 2, p.y - yuk, gen, yuk);
        ctx.globalAlpha = 1;
      } else {                                       // yedek: kodla çizilen ağaç
        if (!window.AkisGarden || !AkisGarden.agacSprite) return;
        const sp = AkisGarden.agacSprite(it.stage, it.seed, it.pale, S, 0.85, dpr);
        if (sp) ctx.drawImage(sp.cv, p.x - sp.w / 2, p.y - sp.h, sp.w, sp.h);
      }
    } else {
      if (window.AkisGarden && AkisGarden.susCiz) AkisGarden.susCiz(ctx, it.id, p.x, p.y, S * 1.1, time);
    }
  }

  /* --------------------------------------------------------- etkileşim */
  function nesneBul(sx, sy) {
    // önden arkaya bak (üstteki önce yakalansın)
    const sirali = items.slice().sort((a, b) => (b.col + b.row) - (a.col + a.row));
    for (const it of sirali) {
      const p = ekranaOrta(it.col, it.row);
      const dx = (sx - p.x) / (TW * 0.46 * zoom), dy = (sy - p.y + 22 * zoom) / (TH * 1.5 * zoom);
      if (dx * dx + dy * dy <= 1) return it;
    }
    return null;
  }
  function yerel(e) {
    const r = cv.getBoundingClientRect();
    const t = e.touches && e.touches[0] ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  function basla(e) {
    if (e.touches && e.touches.length === 2) {
      pinch = { d: mesafe(e.touches), z: zoom }; surukle = null; return;
    }
    const p = yerel(e);
    const it = nesneBul(p.x, p.y);
    sonDokunma = { x: p.x, y: p.y, panX, panY, t: Date.now(), tasindi: false };
    if (it) { secili = it; surukle = { it, hedef: { col: it.col, row: it.row } }; }
    else { surukle = null; }
  }
  function hareket(e) {
    if (pinch && e.touches && e.touches.length === 2) {
      const d = mesafe(e.touches);
      zoom = Math.max(0.45, Math.min(2.4, pinch.z * (d / pinch.d)));
      e.preventDefault(); return;
    }
    if (!sonDokunma) return;
    const p = yerel(e);
    const dx = p.x - sonDokunma.x, dy = p.y - sonDokunma.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) sonDokunma.tasindi = true;
    if (surukle) {
      surukle.hedef = ekrandan(p.x, p.y + 18 * zoom);
      e.preventDefault();
    } else {
      panX = sonDokunma.panX + dx; panY = sonDokunma.panY + dy;
      e.preventDefault();
    }
  }
  function bitir() {
    if (surukle && surukle.hedef) {
      const h = surukle.hedef;
      if (sonDokunma && sonDokunma.tasindi && icinde(h.col, h.row) && bosMu(h.col, h.row, surukle.it)) {
        surukle.it.col = h.col; surukle.it.row = h.row;
        degisti = true; kaydet();
      }
    }
    if (sonDokunma && !sonDokunma.tasindi && !surukle) secili = null;
    surukle = null; pinch = null; sonDokunma = null;
  }
  function mesafe(t) {
    const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
    return Math.hypot(dx, dy) || 1;
  }
  function tekerlek(e) {
    zoom = Math.max(0.45, Math.min(2.4, zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
    e.preventDefault();
  }

  const dinleyiciler = [];
  function bagla(hedef, tur, fn, opt) { hedef.addEventListener(tur, fn, opt); dinleyiciler.push([hedef, tur, fn]); }

  function mount(canvas) {
    unmount();
    cv = canvas; ctx = cv.getContext('2d');
    zoom = 1; panX = 0; panY = 0; secili = null;
    rebuild();
    bagla(cv, 'touchstart', basla, { passive: false });
    bagla(cv, 'touchmove', hareket, { passive: false });
    bagla(cv, 'touchend', bitir);
    bagla(cv, 'mousedown', basla);
    bagla(window, 'mousemove', hareket);
    bagla(window, 'mouseup', bitir);
    bagla(cv, 'wheel', tekerlek, { passive: false });
    t0 = performance.now();
    if (!raf) loop();
  }
  function unmount() {
    kaydet();
    dinleyiciler.splice(0).forEach(([h, t, f]) => h.removeEventListener(t, f));
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    cv = null; ctx = null; secili = null; surukle = null;
  }

  function sifirla() { try { localStorage.removeItem(KEY); } catch (e) { } rebuild(); }

  return { mount, unmount, rebuild, sifirla, gorselTemizle, get zoom() { return zoom; } };
})();

/* `const` ile tanımlanan modül global nesneye YAZILMAZ (yalnız `var`/fonksiyon yazar).
   Kodun her yerinde `window.AkisPlot && ...` biçiminde kontroller var; bu bağlama olmadan
   hepsi sessizce false dönüyordu (2026-08-27'de ölçülerek bulundu). */
try{ window.AkisPlot = AkisPlot; }catch(e){}
