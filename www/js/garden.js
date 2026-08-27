/* ===== garden.js — "Akış Ormanı" (gamification) =====
   Her tamamlanan odak seansı ormana bir ağaç ekler. Ağacın evresi süreye bağlı:
   sprout(filiz) < sapling(fidan) < tree(ağaç) < bigtree(ulu ağaç).
   Konumlar index'ten deterministik türetilir → orman hep aynı görünür, birikir.
   Eski "gölet" kayıtları (pebble/reed/lily/koi) otomatik ağaca eşlenir.
   Aynı API: mount(cv,items) / unmount(cv) / update(cv,items).

   2026-08-27 GÖRSEL YÜKSELTME (kullanıcı: "Forest'ınkiler gerçek gibi, bizimki basit kalıyor")
   - Yapraklar düz renk DEĞİL: her küme kendi radyal gradyanıyla → hacim.
   - Her ağacın altında yumuşak düşen gölge → ağaçlar zeminde duruyor, havada uçmuyor.
   - Zemin dokulu: çim tutamları + ufka doğru sıcak bant.
   - Ufuk çizgisinde uzak ağaç silüeti şeridi → derinlik.
   - Kenarlarda vinyet.
   ⚡ PERFORMANS: kalite bedava değil. Her ağaç TÜRÜ+ÖLÇEĞİ bir kez çizilip
      önbelleğe alınır (sprite), sonra yalnız kopyalanır. Yoksa 170 ağaç × 6 gradyan
      her karede yeniden üretilirdi ve telefonda kare hızı düşerdi. */
const AkisGarden = (() => {
  const active=new Map(); let raf=null, t0=0;
  const sprites=new Map();          // ağaç sprite önbelleği

  // eski gölet tipleri → yeni ağaç evresi
  const LEGACY={pebble:'sprout', reed:'sapling', lily:'tree', koi:'bigtree'};
  function stage(it){ return LEGACY[it.type] || it.type || 'sapling'; }

  function rnd(seed){ const x=Math.sin(seed*127.1+311.7)*43758.5453; return x-Math.floor(x); }
  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  function lerp(a,b,t){ return a+(b-a)*t; }
  function mix(c1,c2,t){ return [0,1,2].map(i=>Math.round(lerp(c1[i],c2[i],t))); }
  function rgb(a){ return `rgb(${a[0]},${a[1]},${a[2]})`; }
  function rgba(a,al){ return `rgba(${a[0]},${a[1]},${a[2]},${al})`; }

  const SKY_TOP=[13,26,36], SKY_HZ=[26,64,66], HAZE=[42,74,74];
  const GROUND_TOP=[28,74,50], GROUND_BOT=[16,50,32];
  const FOLIAGE=[[46,93,67],[78,156,104],[62,124,86],[90,170,118]];
  const FOL_LIGHT=[163,232,175];   // ay tarafındaki ışık
  const PALE_GRAY=[110,118,112];   // "Derin Odak" bozulunca soluk ağaç
  const MOON_X=0.72;               // ay konumu → ışık sağ üstten gelir

  function mount(cv,items){ active.set(cv,{items:items||[],layout:null}); if(!raf){t0=performance.now(); loop();} }
  function unmount(cv){ active.delete(cv); if(!active.size&&raf){cancelAnimationFrame(raf);raf=null;} }
  function update(cv,items){ if(active.has(cv)){ const v=active.get(cv); v.items=items||[]; v.layout=null; } }

  function loop(){ raf=requestAnimationFrame(loop); const time=(performance.now()-t0)/1000; active.forEach((v,cv)=>draw(cv,v,time)); }

  /* ---------------------------------------------------------------- SAHNE */
  function draw(cv,v,time){
    const items=v.items;
    const ctx=cv.getContext('2d');
    const dpr=Math.min(window.devicePixelRatio||1,2.5);
    const r=cv.getBoundingClientRect(); const W=r.width, H=r.height;
    if(W<2||H<2) return;
    if(cv.width!==Math.round(W*dpr)){ cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr); v.layout=null; }
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);
    ctx.save(); roundRect(ctx,0,0,W,H,14); ctx.clip();

    // ufuk 0.60 → 0.46: eskiden karenin %60'ı boş gökyüzüydü, orman aşağıda eziliyordu
    const horizon=H*0.46;

    // gökyüzü
    const sky=ctx.createLinearGradient(0,0,0,horizon+8);
    sky.addColorStop(0,rgb(SKY_TOP)); sky.addColorStop(1,rgb(SKY_HZ));
    ctx.fillStyle=sky; ctx.fillRect(0,0,W,horizon+8);

    // yıldızlar
    for(let s=0;s<14;s++){
      const sx=W*rnd(s*3.7+0.9), sy=horizon*0.78*rnd(s*5.1+2.3);
      const tw=0.45+0.55*Math.abs(Math.sin(time*0.5+s*2.1));
      ctx.fillStyle=`rgba(226,238,248,${0.34*tw})`;
      ctx.beginPath(); ctx.arc(sx,sy, s%4===0?1.6:1.0, 0,7); ctx.fill();
    }

    // ay + ışıma
    const mx=W*MOON_X, my=horizon*0.34;
    const mg=ctx.createRadialGradient(mx,my,2,mx,my,H*0.42);
    mg.addColorStop(0,'rgba(248,232,178,.24)'); mg.addColorStop(0.45,'rgba(245,225,160,.07)'); mg.addColorStop(1,'rgba(245,225,160,0)');
    ctx.fillStyle=mg; ctx.fillRect(0,0,W,horizon+10);
    ctx.fillStyle='rgba(250,242,214,.92)';
    ctx.beginPath(); ctx.arc(mx,my,Math.max(6,H*0.028),0,7); ctx.fill();

    // uzak tepeler
    hill(ctx,W,horizon,  H*0.11, 0.6, mix(SKY_HZ,HAZE,0.42), time*4);
    hill(ctx,W,horizon+2,H*0.075,1.1, mix(GROUND_TOP,HAZE,0.38), time*7);

    // ufuk çizgisinde UZAK AĞAÇ ŞERİDİ (derinlik) — silüet, ayrıntı yok
    treeline(ctx,W,horizon+2,H*0.085, mix(SKY_HZ,GROUND_TOP,0.55), 0.55, 9);   // uzak: puslu
    treeline(ctx,W,horizon+7,H*0.060, mix(GROUND_TOP,HAZE,0.30), 0.85, 6);      // yakin: koyu

    // zemin
    const gr=ctx.createLinearGradient(0,horizon,0,H);
    gr.addColorStop(0,rgb(mix(GROUND_TOP,HAZE,0.30)));   // ufka yakın: puslu/açık
    gr.addColorStop(0.35,rgb(GROUND_TOP));
    gr.addColorStop(1,rgb(GROUND_BOT));
    ctx.fillStyle=gr; ctx.fillRect(0,horizon,W,H-horizon);
    const sis=ctx.createLinearGradient(0,horizon-H*0.06,0,horizon+H*0.16);
    sis.addColorStop(0,'rgba(150,190,190,0)');
    sis.addColorStop(0.30,'rgba(150,190,190,.11)');
    sis.addColorStop(1,'rgba(150,190,190,0)');
    ctx.fillStyle=sis; ctx.fillRect(0,horizon-H*0.06,W,H*0.22);
    grass(ctx,W,H,horizon,time);

    if(!items.length){
      ctx.fillStyle='rgba(233,242,248,.42)'; ctx.textAlign='center';
      ctx.font='13px -apple-system,Segoe UI,sans-serif';
      const hint=(window.t?window.t('forest_empty'):'');
      wrapText(ctx,hint,W/2,horizon-14,W-40,17);
      ctx.fillStyle='rgba(20,45,28,.9)';
      ctx.beginPath(); ctx.ellipse(W/2,horizon+(H-horizon)*0.5, W*0.16,(H-horizon)*0.18,0,0,7); ctx.fill();
      vignette(ctx,W,H); ctx.restore(); return;
    }

    const bandBottom=H-6;
    if(!v.layout){
      v.layout=items.map((it,i)=>{
        // altin oran adimi: rastgele kumelenme yerine bandi DENGELI tarar
        const sx=(i*0.6180339887+rnd(i*1.73+0.31)*0.16)%1;
        const sy=rnd(i*2.91+1.13);
        const depth=Math.min(1,Math.max(0,sy));
        const baseY=lerp(horizon+6, bandBottom, 0.10+depth*0.90);
        const x=W*(0.04+sx*0.92);
        const scale=lerp(0.46,1.22,depth);
        return {it,x,baseY,scale,depth,i};
      }).sort((a,b)=>a.baseY-b.baseY).slice(-170);
    }
    const list=v.layout;
    if(items.length>=10) drawUndergrowth(ctx,W,H,horizon,bandBottom,items.length,time);

    // arkadan öne: önce gölge, sonra ağaç
    list.forEach(t=>{
      const S=t.scale, sway=Math.sin(time*0.8+t.i*1.3)*(3.2*S);
      // düşen gölge — ağacı zemine oturtur
      ctx.save(); ctx.globalAlpha=0.30;
      const sg=ctx.createRadialGradient(t.x+3*S,t.baseY,0,t.x+3*S,t.baseY,26*S);
      sg.addColorStop(0,'rgba(6,20,12,.85)'); sg.addColorStop(1,'rgba(6,20,12,0)');
      ctx.fillStyle=sg;
      ctx.beginPath(); ctx.ellipse(t.x+3*S,t.baseY,24*S,6.5*S,0,0,7); ctx.fill();
      ctx.restore();
      const sp=sprite(stage(t.it), t.i, !!t.it.pale, S, t.depth, dpr);
      if(sp) ctx.drawImage(sp.cv, t.x-sp.w/2+sway, t.baseY-sp.h, sp.w, sp.h);
    });

    // satın alınan süsler (Süs Dükkânı) — ağaçların önünde
    drawDecos(ctx,W,H,horizon,bandBottom,time);

    // ateşböceği
    list.filter(t=>t.it.firefly).slice(-14).forEach(t=>{
      const fx=t.x+Math.sin(time*1.1+t.i)*10, fy=t.baseY-40*t.scale-Math.abs(Math.sin(time*0.7+t.i))*18;
      const gl=0.4+0.6*Math.abs(Math.sin(time*3+t.i*1.7));
      const rad=ctx.createRadialGradient(fx,fy,0,fx,fy,11);
      rad.addColorStop(0,`rgba(247,224,140,${0.78*gl})`); rad.addColorStop(1,'rgba(247,224,140,0)');
      ctx.fillStyle=rad; ctx.beginPath(); ctx.arc(fx,fy,11,0,7); ctx.fill();
    });

    vignette(ctx,W,H);
    ctx.restore();
  }

  /* ------------------- SÜSLER (jetonla açılır, Süs Dükkânı) -------------------
     Konumlar deterministik: aynı süs hep aynı yerde durur, orman kaymaz. */
  const DECO_YER={ flowers:[0.20,0.82], rock:[0.78,0.74], lantern:[0.62,0.90],
                   bench:[0.36,0.93], pond:[0.83,0.93], fox:[0.50,0.79] };
  function drawDecos(ctx,W,H,horizon,bottom,time){
    let sahip=[];
    try{ sahip = (window.AkisStats && AkisStats.ownedDecos) ? AkisStats.ownedDecos() : []; }catch(e){ return; }
    if(!sahip.length) return;
    const bandH=bottom-horizon;
    sahip.forEach(id=>{
      const yer=DECO_YER[id]; if(!yer) return;
      const x=W*yer[0], y=horizon+bandH*yer[1];
      const S=Math.max(0.55, Math.min(1.6, bandH/220 * (0.7+yer[1]*0.6)));
      // ortak düşen gölge
      if(id!=='pond'){
        ctx.save(); ctx.globalAlpha=0.26;
        ctx.fillStyle='rgba(6,20,12,.9)';
        ctx.beginPath(); ctx.ellipse(x+2*S,y+1,13*S,4*S,0,0,7); ctx.fill(); ctx.restore();
      }
      if(id==='flowers')      decoFlowers(ctx,x,y,S,time);
      else if(id==='rock')    decoRock(ctx,x,y,S);
      else if(id==='lantern') decoLantern(ctx,x,y,S,time);
      else if(id==='bench')   decoBench(ctx,x,y,S);
      else if(id==='pond')    decoPond(ctx,x,y,S,time);
      else if(id==='fox')     decoFox(ctx,x,y,S);
    });
  }
  function decoFlowers(ctx,x,y,S,time){
    const renk=[[236,142,178],[247,206,110],[190,158,236],[240,238,232]];
    for(let i=0;i<9;i++){
      const dx=(rnd(i*3.1)-0.5)*30*S, dy=-rnd(i*4.7)*9*S;
      const sw=Math.sin(time*1.2+i)*0.8*S;
      ctx.strokeStyle='rgba(74,142,92,.85)'; ctx.lineWidth=1.2*S; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(x+dx,y+dy); ctx.lineTo(x+dx+sw,y+dy-7*S); ctx.stroke();
      const c=renk[i%4];
      ctx.fillStyle=rgb(c);
      ctx.beginPath(); ctx.arc(x+dx+sw, y+dy-7.5*S, 2.4*S,0,7); ctx.fill();
      ctx.fillStyle=rgba([255,250,230],0.75);
      ctx.beginPath(); ctx.arc(x+dx+sw-0.6*S, y+dy-8.1*S, 0.9*S,0,7); ctx.fill();
    }
  }
  function decoRock(ctx,x,y,S){
    const g=ctx.createLinearGradient(x-13*S,y-14*S,x+13*S,y);
    g.addColorStop(0,'#8d968f'); g.addColorStop(0.5,'#6c756f'); g.addColorStop(1,'#414a46');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.moveTo(x-14*S,y); ctx.quadraticCurveTo(x-11*S,y-14*S,x-1*S,y-13*S);
    ctx.quadraticCurveTo(x+12*S,y-11*S,x+14*S,y); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(196,214,200,.28)';
    ctx.beginPath(); ctx.ellipse(x-4*S,y-9.5*S,4.6*S,2.2*S,-0.4,0,7); ctx.fill();
  }
  function decoLantern(ctx,x,y,S,time){
    ctx.fillStyle='#3a2c22'; ctx.fillRect(x-1.4*S,y-24*S,2.8*S,24*S);
    const yan=0.72+0.28*Math.abs(Math.sin(time*1.4));
    const gl=ctx.createRadialGradient(x,y-28*S,1,x,y-28*S,30*S);
    gl.addColorStop(0,`rgba(255,206,120,${0.42*yan})`); gl.addColorStop(1,'rgba(255,206,120,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(x,y-28*S,30*S,0,7); ctx.fill();
    ctx.fillStyle='#2c231c';
    roundRect(ctx,x-5*S,y-34*S,10*S,11*S,2.2*S); ctx.fill();
    ctx.fillStyle=`rgba(255,214,132,${0.85*yan})`;
    roundRect(ctx,x-3.4*S,y-32.4*S,6.8*S,7.8*S,1.6*S); ctx.fill();
  }
  function decoBench(ctx,x,y,S){
    ctx.fillStyle='#4b3527';
    ctx.fillRect(x-13*S,y-4*S,2.6*S,4*S); ctx.fillRect(x+10.4*S,y-4*S,2.6*S,4*S);
    const g=ctx.createLinearGradient(0,y-12*S,0,y-4*S);
    g.addColorStop(0,'#8a6247'); g.addColorStop(1,'#5d4130');
    ctx.fillStyle=g;
    roundRect(ctx,x-15*S,y-7*S,30*S,3.2*S,1.2*S); ctx.fill();
    roundRect(ctx,x-15*S,y-12*S,30*S,2.6*S,1.2*S); ctx.fill();
    roundRect(ctx,x-15*S,y-16*S,30*S,2.6*S,1.2*S); ctx.fill();
  }
  function decoPond(ctx,x,y,S,time){
    const g=ctx.createRadialGradient(x-4*S,y-3*S,1,x,y,20*S);
    g.addColorStop(0,'rgba(122,196,206,.85)'); g.addColorStop(1,'rgba(34,88,104,.9)');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.ellipse(x,y,20*S,8*S,0,0,7); ctx.fill();
    ctx.strokeStyle='rgba(190,236,240,.42)'; ctx.lineWidth=1.1*S;
    for(let i=0;i<3;i++){
      const r=(6+i*5)*S+Math.sin(time*0.9+i)*1.6*S;
      ctx.beginPath(); ctx.ellipse(x,y,r,r*0.40,0,0,7); ctx.stroke();
    }
  }
  function decoFox(ctx,x,y,S){
    const g=ctx.createLinearGradient(x-9*S,y-14*S,x+9*S,y);
    g.addColorStop(0,'#e08a44'); g.addColorStop(1,'#b6602a');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.ellipse(x,y-5*S,9*S,5.2*S,0,0,7); ctx.fill();           // gövde
    ctx.beginPath(); ctx.ellipse(x+7.5*S,y-9.5*S,4.6*S,4.2*S,0,0,7); ctx.fill(); // kafa
    ctx.beginPath(); ctx.moveTo(x+5.6*S,y-12.6*S); ctx.lineTo(x+6.6*S,y-16.4*S); ctx.lineTo(x+8.4*S,y-13.2*S); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x+8.6*S,y-13.0*S); ctx.lineTo(x+10.2*S,y-16.2*S); ctx.lineTo(x+11.0*S,y-12.4*S); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#f3d9bd';                                                      // kuyruk ucu + göğüs
    ctx.beginPath(); ctx.ellipse(x-9.5*S,y-7.5*S,4.4*S,3.2*S,-0.5,0,7); ctx.fill();
    ctx.fillStyle='#2b1d13';
    ctx.beginPath(); ctx.arc(x+8.6*S,y-10.2*S,0.95*S,0,7); ctx.fill();            // göz
  }

  function vignette(ctx,W,H){
    const vg=ctx.createRadialGradient(W/2,H*0.52,Math.min(W,H)*0.30,W/2,H*0.52,Math.max(W,H)*0.72);
    vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.34)');
    ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);
  }

  function hill(ctx,W,y,amp,freq,color,phase){
    ctx.beginPath(); ctx.moveTo(0,y);
    for(let x=0;x<=W;x+=10){ const yy=y-amp*(0.5+0.5*Math.sin(x*0.006*freq+phase*0.01)); ctx.lineTo(x,yy); }
    ctx.lineTo(W,y+40); ctx.lineTo(0,y+40); ctx.closePath();
    ctx.fillStyle=rgb(color); ctx.fill();
  }

  /* ufuktaki uzak orman şeridi — sadece silüet, ayrıntı yok (atmosferik perspektif) */
  function treeline(ctx,W,y,h,color,alpha,adim){
    ctx.save(); ctx.globalAlpha=alpha; ctx.fillStyle=rgb(color);
    for(let i=0;i*adim<W+2*adim;i++){
      const x=i*adim+rnd(i*2.3+h)*adim*0.6, hh=h*(0.42+rnd(i*5.7+h)*0.80), w=adim*0.62+rnd(i*1.9+h)*adim*0.4;
      ctx.beginPath(); ctx.moveTo(x-w,y); ctx.lineTo(x,y-hh); ctx.lineTo(x+w,y); ctx.closePath(); ctx.fill();
    }
    ctx.fillRect(0,y-1,W,4);
    ctx.restore();
  }

  /* zemin dokusu — çim tutamları; öne doğru büyür ve koyulaşır */
  function grass(ctx,W,H,horizon,time){
    // (a) zemin ton lekeleri — dumduz yesil dolgu yerine hafif alacali cayir
    for(let k=0;k<16;k++){
      const d=rnd(k*4.13+1.9);
      const px=rnd(k*2.61+0.4)*W, py=lerp(horizon+H*0.05, H, d);
      const rx=lerp(W*0.10,W*0.26,rnd(k*3.7)), ry=lerp(H*0.03,H*0.09,rnd(k*5.3));
      const g2=ctx.createRadialGradient(px,py,1,px,py,Math.max(rx,ry));
      const ton=k%2 ? mix(GROUND_TOP,[42,104,66],0.55) : mix(GROUND_BOT,[12,40,26],0.5);
      g2.addColorStop(0,rgba(ton,0.30)); g2.addColorStop(1,rgba(ton,0));
      ctx.fillStyle=g2; ctx.beginPath(); ctx.ellipse(px,py,rx,ry,0,0,7); ctx.fill();
    }
    // (b) cim tutamlari — kisa ve sonuk; uzun/parlak olunca konfeti gibi duruyordu
    const n=Math.round(W/5);
    ctx.lineCap='round';
    for(let i=0;i<n;i++){
      const gx=rnd(i*1.31+0.7)*W;
      const d=rnd(i*2.77+3.1);
      const gy=lerp(horizon+H*0.05, H-2, d);
      const hgt=lerp(1.6,5.2,d), sw=Math.sin(time*0.7+i)*0.5*d;
      ctx.strokeStyle=rgba(mix(GROUND_TOP,[58,136,84],0.30+d*0.42), 0.16+d*0.20);
      ctx.lineWidth=lerp(0.7,1.25,d);
      ctx.beginPath(); ctx.moveTo(gx,gy); ctx.quadraticCurveTo(gx+sw,gy-hgt*0.6,gx+sw*1.8,gy-hgt); ctx.stroke();
    }
  }

  function drawUndergrowth(ctx,W,H,horizon,bottom,count,time){
    const n=Math.min(12, Math.floor(count/5));
    for(let k=0;k<n;k++){
      const sx=rnd(k*5.2+9.1), sy=rnd(k*3.3+4.7);
      const y=lerp(horizon+(bottom-horizon)*0.50, bottom-2, sy);
      const x=W*(0.04+sx*0.92);
      const s=lerp(6,17,(y-horizon)/(bottom-horizon));
      const base=mix(GROUND_TOP,[44,116,70],0.6);
      for(let b=0;b<3;b++){
        const bx=x+(b-1)*s*0.7;
        const g=ctx.createRadialGradient(bx-s*0.3,y-s*0.4,1,bx,y,s*1.1);
        g.addColorStop(0,rgb(mix(base,FOL_LIGHT,0.30))); g.addColorStop(1,rgb(mix(base,[10,30,18],0.35)));
        ctx.fillStyle=g;
        ctx.beginPath(); ctx.arc(bx, y, s*(0.7+0.3*rnd(k*7+b)),0,7); ctx.fill();
      }
    }
  }

  function fade(color,depth){ return mix(HAZE,color,Math.min(1,0.35+depth*0.75)); }

  /* ---------------------------------------------------- AĞAÇ SPRITE'LARI
     Bir ağaç, türü+ölçeği+rengi aynıysa her karede yeniden çizilmez;
     bir kez saydam bir tuvale çizilip önbellekten kopyalanır. */
  function sprite(st, seed, pale, S, depth, dpr){
    const fi=Math.floor(rnd(seed*4.1+2.2)*FOLIAGE.length);
    const sb=Math.round(S*16), db=Math.round(depth*6);
    const key=`${st}|${fi}|${pale?1:0}|${sb}|${db}`;
    let sp=sprites.get(key);
    if(sp && sp.dpr===dpr) return sp;
    sp=makeSprite(st, fi, pale, sb/16, db/6, dpr);
    sprites.set(key,sp);
    if(sprites.size>420) sprites.delete(sprites.keys().next().value);
    return sp;
  }

  function makeSprite(st, fi, pale, S, depth, dpr){
    let fol=fade(FOLIAGE[fi], depth);
    if(pale) fol=mix(fol,PALE_GRAY,0.72);
    const dark=mix(fol,[8,22,14],0.42);
    const light=mix(fol,FOL_LIGHT,pale?0.18:0.55);

    const trunkH=(st==='sprout'?16:st==='sapling'?24:st==='tree'?40:58)*S;
    const crownR=(st==='sapling'?15:st==='tree'?24:34)*S;
    const w=Math.max(14, crownR*2.5), h=Math.max(20, trunkH+crownR*2.3);
    const c=document.createElement('canvas');
    c.width=Math.ceil(w*dpr); c.height=Math.ceil(h*dpr);
    const g=c.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0);
    const x=w/2, y=h;                       // taban orta nokta

    if(st==='sprout'){
      g.strokeStyle=rgb(fol); g.lineWidth=2.4*S; g.lineCap='round';
      g.beginPath(); g.moveTo(x,y); g.quadraticCurveTo(x+1.5,y-trunkH*0.6,x+2,y-trunkH); g.stroke();
      const lg=g.createLinearGradient(x-6*S,y-trunkH-4*S,x+6*S,y-trunkH+4*S);
      lg.addColorStop(0,rgb(light)); lg.addColorStop(1,rgb(dark));
      g.fillStyle=lg;
      leaf(g,x+2,y-trunkH,6.5*S,-0.7); leaf(g,x+2,y-trunkH*0.88,6.5*S,0.7);
      return {cv:c,w,h,dpr};
    }

    // gövde
    const tw=(st==='sapling'?3:st==='tree'?5:7)*S;
    const tg=g.createLinearGradient(x-tw,0,x+tw,0);
    if(pale){ tg.addColorStop(0,'#413d39'); tg.addColorStop(0.45,'#6b6560'); tg.addColorStop(1,'#35322e'); }
    else    { tg.addColorStop(0,'#3a2a22'); tg.addColorStop(0.45,'#71503d'); tg.addColorStop(1,'#2e211b'); }
    g.fillStyle=tg;
    g.beginPath();
    g.moveTo(x-tw*0.62,y); g.lineTo(x+tw*0.62,y);
    g.lineTo(x+tw*0.30,y-trunkH); g.lineTo(x-tw*0.30,y-trunkH);
    g.closePath(); g.fill();

    const topY=y-trunkH;
    if(st==='bigtree'){
      // ÇAM: katmanlı taç, her katman kendi gradyanıyla (sağ üstten ışık)
      const tiers=5;
      for(let k=0;k<tiers;k++){
        const ty=topY+(trunkH*0.18)-k*(trunkH*0.255);
        const cw=crownR*(1-k*0.155);
        const lgr=g.createLinearGradient(x-cw,ty-cw*0.9,x+cw,ty);
        lgr.addColorStop(0,rgb(mix(dark,[4,14,9],0.25)));
        lgr.addColorStop(0.55,rgb(k%2?mix(fol,dark,0.35):fol));
        lgr.addColorStop(1,rgb(light));
        g.fillStyle=lgr;
        g.beginPath();
        g.moveTo(x-cw,ty);
        g.quadraticCurveTo(x,ty-cw*1.35,x+cw,ty);
        g.quadraticCurveTo(x,ty-cw*0.32,x-cw,ty);
        g.closePath(); g.fill();
      }
      if(!pale){
        g.save(); g.globalAlpha=0.42; g.strokeStyle=rgb(FOL_LIGHT); g.lineWidth=1.7*S;
        g.beginPath(); g.moveTo(x+crownR*0.55, topY-trunkH*0.50);
        g.quadraticCurveTo(x+crownR*0.24, topY-trunkH*0.84, x, topY-trunkH*0.92);
        g.stroke(); g.restore();
      }
    } else {
      // YAPRAKLI: üst üste kümeler, HER KÜME KENDİ RADYAL GRADYANIYLA → hacim
      const R=crownR;
      const kume=[[0,-R*0.52,R,1],[-R*0.62,-R*0.14,R*0.74,0],[R*0.62,-R*0.14,R*0.74,1],
                  [0,-R*1.06,R*0.68,1],[-R*0.34,-R*0.86,R*0.56,0],[R*0.40,-R*0.72,R*0.60,1]];
      // arka (koyu) katman
      g.fillStyle=rgb(mix(dark,[5,16,10],0.30));
      kume.forEach(b=>{ g.beginPath(); g.arc(x+b[0], topY+b[1]+2.5*S, b[2],0,7); g.fill(); });
      // ön katman: gradyanlı
      kume.forEach(b=>{
        const cx=x+b[0], cy=topY+b[1], rr=b[2]*0.94;
        const rg=g.createRadialGradient(cx+rr*0.38, cy-rr*0.46, rr*0.08, cx, cy, rr*1.08);
        rg.addColorStop(0, rgb(b[3]?light:mix(fol,light,0.35)));
        rg.addColorStop(0.52, rgb(fol));
        rg.addColorStop(1, rgb(dark));
        g.fillStyle=rg;
        g.beginPath(); g.arc(cx,cy,rr,0,7); g.fill();
      });
      if(!pale){
        g.save(); g.globalAlpha=0.38; g.strokeStyle=rgb(FOL_LIGHT); g.lineWidth=1.7*S;
        g.beginPath(); g.arc(x, topY-R*0.34, R*0.95, -0.62, 0.70); g.stroke(); g.restore();
      }
    }
    return {cv:c,w,h,dpr};
  }

  function leaf(ctx,x,y,r,ang){
    ctx.save(); ctx.translate(x,y); ctx.rotate(ang);
    ctx.beginPath(); ctx.ellipse(r*0.6,0,r,r*0.45,0,0,7); ctx.fill(); ctx.restore();
  }

  function wrapText(ctx,text,cx,cy,maxW,lh){
    const words=(text||'').split(' '); let line='', lines=[];
    words.forEach(w=>{ const test=line?line+' '+w:w; if(ctx.measureText(test).width>maxW && line){ lines.push(line); line=w; } else line=test; });
    if(line) lines.push(line);
    const startY=cy-(lines.length-1)*lh/2;
    lines.forEach((l,i)=>ctx.fillText(l,cx,startY+i*lh));
  }

  return { mount, unmount, update };
})();
