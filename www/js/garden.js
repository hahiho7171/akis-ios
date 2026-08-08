/* ===== garden.js — "Akış Ormanı" (gamification) =====
   Her tamamlanan odak seansı ormana bir ağaç ekler. Ağacın evresi süreye bağlı:
   sprout(filiz) < sapling(fidan) < tree(ağaç) < bigtree(ulu ağaç).
   Konumlar index'ten deterministik türetilir → orman hep aynı görünür, birikir.
   Eski "gölet" kayıtları (pebble/reed/lily/koi) otomatik ağaca eşlenir.
   Aynı API: mount(cv,items) / unmount(cv) / update(cv,items). */
const AkisGarden = (() => {
  const active=new Map(); let raf=null, t0=0;

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
  function mix(c1,c2,t){ // "r,g,b" stringleri
    return [0,1,2].map(i=>Math.round(lerp(c1[i],c2[i],t)));
  }
  function rgb(a){ return `rgb(${a[0]},${a[1]},${a[2]})`; }

  const SKY_TOP=[13,26,36], SKY_HZ=[26,64,66], HAZE=[42,74,74];
  const GROUND_TOP=[28,74,50], GROUND_BOT=[16,50,32];
  // Derinlikli yaprak paleti (grafiker önerisi 2026-08-08): gölge → orta → ışık; eski çamurlu tonlar yerine
  const FOLIAGE=[[46,93,67],[78,156,104],[62,124,86],[90,170,118]];
  const FOL_LIGHT=[143,217,159];   // rim-light / tepe ışığı (#8FD99F)
  const PALE_GRAY=[110,118,112];   // "Derin Odak" bozulunca soluk ağaç rengi
  const MOON_X=0.72;               // ay/ışıma yatay konumu (rim-light yönü buna bakar)

  function mount(cv,items){ active.set(cv,{items:items||[],layout:null}); if(!raf){t0=performance.now(); loop();} }
  function unmount(cv){ active.delete(cv); if(!active.size&&raf){cancelAnimationFrame(raf);raf=null;} }
  function update(cv,items){ if(active.has(cv)){ const v=active.get(cv); v.items=items||[]; v.layout=null; } }

  function loop(){ raf=requestAnimationFrame(loop); const time=(performance.now()-t0)/1000; active.forEach((v,cv)=>draw(cv,v,time)); }

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

    const horizon=H*0.60;
    // gökyüzü
    const sky=ctx.createLinearGradient(0,0,0,horizon+8);
    sky.addColorStop(0,rgb(SKY_TOP)); sky.addColorStop(1,rgb(SKY_HZ));
    ctx.fillStyle=sky; ctx.fillRect(0,0,W,horizon+8);
    // sabit yıldızlar (deterministik konum, yumuşak nefes alan parlaklık)
    for(let s=0;s<11;s++){
      const sx=W*rnd(s*3.7+0.9), sy=horizon*0.72*rnd(s*5.1+2.3);
      const tw=0.45+0.55*Math.abs(Math.sin(time*0.5+s*2.1));
      ctx.fillStyle=`rgba(226,238,248,${0.32*tw})`;
      ctx.beginPath(); ctx.arc(sx,sy, s%4===0?1.6:1.0, 0,7); ctx.fill();
    }
    // yumuşak ufuk ışıması (ay hissi)
    const glow=ctx.createRadialGradient(W*MOON_X,horizon,4,W*MOON_X,horizon,H*0.5);
    glow.addColorStop(0,'rgba(245,225,160,.16)'); glow.addColorStop(1,'rgba(245,225,160,0)');
    ctx.fillStyle=glow; ctx.fillRect(0,0,W,horizon+8);

    // uzak tepeler (2 katman, atmosferik)
    hill(ctx,W,horizon,  H*0.10, 0.6, mix(SKY_HZ,HAZE,0.4), time*4);
    hill(ctx,W,horizon+2,H*0.07, 1.1, mix(GROUND_TOP,HAZE,0.35), time*7);

    // zemin (çimen)
    const gr=ctx.createLinearGradient(0,horizon,0,H);
    gr.addColorStop(0,rgb(GROUND_TOP)); gr.addColorStop(1,rgb(GROUND_BOT));
    ctx.fillStyle=gr; ctx.fillRect(0,horizon,W,H-horizon);

    if(!items.length){
      ctx.restore();
      ctx.fillStyle='rgba(233,242,248,.42)'; ctx.textAlign='center';
      ctx.font='13px -apple-system,Segoe UI,sans-serif';
      const hint=(window.t?window.t('forest_empty'):'');
      wrapText(ctx,hint,W/2,horizon-12,W-40,17);
      // küçük toprak tümseği
      ctx.fillStyle='rgba(20,45,28,.9)';
      ctx.beginPath(); ctx.ellipse(W/2,horizon+ (H-horizon)*0.5, W*0.16, (H-horizon)*0.18,0,0,7); ctx.fill();
      return;
    }

    // ağaç konumları (deterministik) — arkadan öne; PERFORMANS: yerleşim yalnız items değişince hesaplanır
    const bandBottom=H-6;
    if(!v.layout){
      v.layout=items.map((it,i)=>{
        const sx=rnd(i*1.73+0.31), sy=rnd(i*2.91+1.13);
        const depth=Math.min(1,Math.max(0, sy));          // 0 arka .. 1 ön
        const baseY=lerp(horizon+4, bandBottom, 0.15+depth*0.85);
        const x=W*(0.05+sx*0.90);
        const scale=lerp(0.42,1.15,depth);
        return {it,x,baseY,scale,depth,i};
      }).sort((a,b)=>a.baseY-b.baseY).slice(-170);        // en fazla ~170 ağaç
    }
    const list=v.layout;
    // yoğun orman → zeminde çalı kümeleri (köşe yeşillenmesi)
    if(items.length>=12) drawUndergrowth(ctx,W,H,horizon,bandBottom,items.length,time);
    list.forEach(t=>drawTree(ctx,t,time));

    // gece ışıltısı (ateşböceği bonuslu seanslar)
    list.filter(t=>t.it.firefly).slice(-14).forEach(t=>{
      const fx=t.x+Math.sin(time*1.1+t.i)*10, fy=t.baseY-40*t.scale-Math.abs(Math.sin(time*0.7+t.i))*18;
      const gl=0.4+0.6*Math.abs(Math.sin(time*3+t.i*1.7));
      const rad=ctx.createRadialGradient(fx,fy,0,fx,fy,10);
      rad.addColorStop(0,`rgba(247,224,140,${0.75*gl})`); rad.addColorStop(1,'rgba(247,224,140,0)');
      ctx.fillStyle=rad; ctx.beginPath(); ctx.arc(fx,fy,10,0,7); ctx.fill();
    });

    ctx.restore();
  }

  function hill(ctx,W,y,amp,freq,color,phase){
    ctx.beginPath(); ctx.moveTo(0,y);
    for(let x=0;x<=W;x+=10){ const yy=y-amp*(0.5+0.5*Math.sin(x*0.006*freq+phase*0.01)); ctx.lineTo(x,yy); }
    ctx.lineTo(W,y+40); ctx.lineTo(0,y+40); ctx.closePath();
    ctx.fillStyle=rgb(color); ctx.fill();
  }

  function drawUndergrowth(ctx,W,H,horizon,bottom,count,time){
    const n=Math.min(10, Math.floor(count/6));
    for(let k=0;k<n;k++){
      const sx=rnd(k*5.2+9.1), sy=rnd(k*3.3+4.7);
      const y=lerp(horizon+ (bottom-horizon)*0.55, bottom-2, sy);
      const x=W*(0.04+sx*0.92);
      const s=lerp(6,16, (y-horizon)/(bottom-horizon));
      ctx.fillStyle=rgb(mix(GROUND_TOP,[40,110,66],0.6));
      for(let b=0;b<3;b++){
        ctx.beginPath(); ctx.arc(x+(b-1)*s*0.7, y, s*(0.7+0.3*rnd(k*7+b)),0,7); ctx.fill();
      }
    }
  }

  // atmosferik solma: uzak (küçük ölçek) ağaçlar ufka doğru soluklaşır
  function fade(color,depth){ return mix(HAZE,color,Math.min(1,0.35+depth*0.75)); }

  function drawTree(ctx,t,time){
    const st=stage(t.it);
    const S=t.scale;
    const sway=Math.sin(time*0.8+t.i*1.3)*(3.5*S);
    const x=t.x, y=t.baseY;
    const fi=Math.floor(rnd(t.i*4.1+2.2)*FOLIAGE.length);
    let fol=fade(FOLIAGE[fi], t.depth);
    // "Derin Odak" bozulmuş seans → soluk/gri ağaç (ceza değil, iz)
    const pale=!!t.it.pale;
    if(pale) fol=mix(fol,PALE_GRAY,0.72);
    const folDark=mix(fol,[8,22,14],0.35);

    if(st==='sprout'){
      const h=16*S;
      ctx.strokeStyle=rgb(fol); ctx.lineWidth=2.2*S; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(x,y); ctx.quadraticCurveTo(x+sway*0.4,y-h*0.6,x+sway*0.5,y-h); ctx.stroke();
      // iki yaprak
      ctx.fillStyle=rgb(fol);
      leaf(ctx,x+sway*0.5,y-h, 6*S, -0.7); leaf(ctx,x+sway*0.5,y-h*0.9, 6*S, 0.7);
      return;
    }

    // gövde (desatüre sıcak kahve — doygun turuncu kahve yerine)
    const trunkH=(st==='sapling'?24:st==='tree'?40:58)*S;
    const trunkW=(st==='sapling'?3:st==='tree'?5:7)*S;
    const tg=ctx.createLinearGradient(x-trunkW,0,x+trunkW,0);
    if(pale){ tg.addColorStop(0,'#4a4642'); tg.addColorStop(0.5,'#6b6560'); tg.addColorStop(1,'#403c38'); }
    else    { tg.addColorStop(0,'#46332a'); tg.addColorStop(0.5,'#6B4A3A'); tg.addColorStop(1,'#3b2b23'); }
    ctx.fillStyle=tg;
    ctx.beginPath();
    ctx.moveTo(x-trunkW*0.5,y);
    ctx.lineTo(x+trunkW*0.5,y);
    ctx.lineTo(x+trunkW*0.32+sway,y-trunkH);
    ctx.lineTo(x-trunkW*0.32+sway,y-trunkH);
    ctx.closePath(); ctx.fill();

    const topX=x+sway, topY=y-trunkH;
    if(st==='bigtree'){
      // ulu ağaç: çam tarzı katmanlı taç
      const w=34*S, tiers=4;
      for(let k=0;k<tiers;k++){
        const ty=topY + (trunkH*0.16) - k*(trunkH*0.30);
        const tw=w*(1-k*0.19);
        ctx.fillStyle=rgb(k%2?folDark:fol);
        ctx.beginPath();
        ctx.moveTo(topX-tw, ty);
        ctx.quadraticCurveTo(topX, ty-tw*1.3, topX+tw, ty);
        ctx.quadraticCurveTo(topX, ty-tw*0.35, topX-tw, ty);
        ctx.closePath(); ctx.fill();
      }
    } else {
      // fidan / ağaç: yuvarlak yapraklı taç (katmanlı balonlar)
      const R=(st==='sapling'?15:24)*S;
      const blobs=[[0,-R*0.5,R],[ -R*0.6,-R*0.15,R*0.72],[R*0.6,-R*0.15,R*0.72],[0,-R*1.05,R*0.66]];
      ctx.fillStyle=rgb(folDark);
      blobs.forEach(b=>{ ctx.beginPath(); ctx.arc(topX+b[0]+sway*0.3, topY+b[1]+2, b[2],0,7); ctx.fill(); });
      ctx.fillStyle=rgb(fol);
      blobs.forEach(b=>{ ctx.beginPath(); ctx.arc(topX+b[0]+sway*0.3, topY+b[1], b[2]*0.9,0,7); ctx.fill(); });
      // üst ışık vurgusu
      ctx.fillStyle=rgb(mix(fol,FOL_LIGHT,0.45));
      ctx.beginPath(); ctx.arc(topX-R*0.35+sway*0.3, topY-R*0.7, R*0.34,0,7); ctx.fill();
      // AY YÖNÜNE rim-light: taç kenarında ince açık hilal (soluk ağaçta yok)
      if(!pale){
        const moonDir = (ctx.canvas ? 1 : 1); // ay sağda (MOON_X) → sağ kenara ışık
        ctx.save(); ctx.globalAlpha=0.32; ctx.strokeStyle=rgb(FOL_LIGHT); ctx.lineWidth=1.6*S;
        ctx.beginPath(); ctx.arc(topX+sway*0.3, topY-R*0.35, R*0.92, -0.55, 0.75); ctx.stroke();
        ctx.restore();
      }
    }
    if(st==='bigtree' && !pale){
      // çamda rim-light: en üst katman kenarına açık vurgu
      ctx.save(); ctx.globalAlpha=0.30; ctx.strokeStyle=rgb(FOL_LIGHT); ctx.lineWidth=1.6*S;
      const w=34*S;
      ctx.beginPath(); ctx.moveTo(topX+w*0.55, topY-trunkH*0.55); ctx.quadraticCurveTo(topX+w*0.25, topY-trunkH*0.86, topX, topY-trunkH*0.92);
      ctx.stroke(); ctx.restore();
    }
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
