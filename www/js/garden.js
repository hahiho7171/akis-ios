/* ===== garden.js — "Akış Göleti" (özgün gamification) =====
   Her tamamlanan seans gölete bir öğe ekler. Konumlar index'ten deterministik
   türetilir (kaydetmeye gerek yok, gölet hep aynı görünür). Forest'ın ağacı DEĞİL. */
const AkisGarden = (() => {
  const active=new Map(); let raf=null, t0=0;

  function rnd(seed){ const x=Math.sin(seed*127.1+311.7)*43758.5453; return x-Math.floor(x); }
  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }

  function mount(cv,items){ active.set(cv,{items:items||[]}); if(!raf){t0=performance.now(); loop();} }
  function unmount(cv){ active.delete(cv); if(!active.size&&raf){cancelAnimationFrame(raf);raf=null;} }
  function update(cv,items){ if(active.has(cv)) active.get(cv).items=items||[]; }

  function loop(){ raf=requestAnimationFrame(loop); const time=(performance.now()-t0)/1000; active.forEach((v,cv)=>draw(cv,v.items,time)); }

  function draw(cv,items,time){
    const ctx=cv.getContext('2d');
    const dpr=Math.min(window.devicePixelRatio||1,2.5);
    const r=cv.getBoundingClientRect(); const W=r.width, H=r.height;
    if(W<2||H<2) return;
    if(cv.width!==Math.round(W*dpr)){ cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr); }
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);
    // su
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#154846'); g.addColorStop(1,'#0b2728');
    roundRect(ctx,0,0,W,H,14); ctx.fillStyle=g; ctx.fill();
    ctx.save(); roundRect(ctx,0,0,W,H,14); ctx.clip();
    // dalga çizgileri
    ctx.strokeStyle='rgba(255,255,255,.05)'; ctx.lineWidth=1;
    for(let i=0;i<4;i++){
      const yy=H*(0.35+i*0.16);
      ctx.beginPath();
      for(let x=0;x<=W;x+=8){ const y=yy+Math.sin(x*0.045+time*0.8+i)*2.2; x===0?ctx.moveTo(x,y):ctx.lineTo(x,y); }
      ctx.stroke();
    }
    if(!items.length){
      ctx.restore();
      ctx.fillStyle='rgba(255,255,255,.32)'; ctx.textAlign='center';
      ctx.font='13px -apple-system,Segoe UI,sans-serif';
      const hint=(window.t?window.t('pond_empty'):'');
      ctx.fillText(hint, W/2, H/2);
      return;
    }
    const order={reed:0,pebble:1,koi:2,lily:3};
    const list=items.map((it,i)=>Object.assign({},it,{i})).sort((a,b)=>(order[a.type]||0)-(order[b.type]||0));
    // en fazla ~120 öğe çiz (performans)
    list.slice(-120).forEach(it=>drawItem(ctx,it,W,H,time));
    ctx.restore();
  }

  function drawItem(ctx,it,W,H,time){
    const s=Math.min(W,H);
    const rx=rnd(it.i*2.3+1.1), ry=rnd(it.i*3.7+5.5);
    if(it.type==='pebble'){
      const x=W*(0.08+rx*0.84), y=H*(0.8+ry*0.14);
      ctx.fillStyle='rgba(150,165,170,.55)';
      ctx.beginPath(); ctx.ellipse(x,y,s*0.028,s*0.02,0,0,7); ctx.fill();
    }
    else if(it.type==='reed'){
      const x=W*(0.06+rx*0.88), base=H*0.98, h=s*0.24*(0.7+ry*0.5);
      const sway=Math.sin(time*0.9+it.i)*4;
      ctx.strokeStyle='#3f9d6d'; ctx.lineWidth=2.4; ctx.lineCap='round';
      for(let k=-1;k<=1;k++){
        ctx.beginPath(); ctx.moveTo(x+k*4, base);
        ctx.quadraticCurveTo(x+k*4+sway*0.5, base-h*0.6, x+k*3+sway, base-h);
        ctx.stroke();
      }
    }
    else if(it.type==='koi'){
      const drift=0.5+0.5*Math.sin(time*0.22+it.i*1.3);
      const x=W*(0.1+drift*0.8), y=H*(0.5+ry*0.32);
      const dir=(it.i%2)?1:-1;
      const wig=Math.sin(time*2.4+it.i)*0.25;
      ctx.save(); ctx.translate(x,y); ctx.scale(dir,1); ctx.rotate(wig*0.15);
      ctx.fillStyle='#e8823c';
      ctx.beginPath(); ctx.ellipse(0,0,s*0.05,s*0.028,0,0,7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s*0.05,0); ctx.lineTo(-s*0.085,-s*0.02); ctx.lineTo(-s*0.085,s*0.02); ctx.closePath(); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(s*0.015,-s*0.006,s*0.012,s*0.008,0,0,7); ctx.fill();
      ctx.restore();
    }
    else if(it.type==='lily'){
      const x=W*(0.1+rx*0.8), y=H*(0.42+ry*0.4)+Math.sin(time*0.7+it.i)*2;
      ctx.fillStyle='#2f8f5b';
      ctx.beginPath(); ctx.ellipse(x,y,s*0.06,s*0.035,0.3,0,7); ctx.fill();
      // yaprak dilimi (koyu)
      ctx.strokeStyle='rgba(0,0,0,.18)'; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+s*0.055,y-s*0.02); ctx.stroke();
      // çiçek
      ctx.fillStyle='#f4b8d0';
      for(let p=0;p<5;p++){ const a=p/5*Math.PI*2; ctx.beginPath(); ctx.ellipse(x+Math.cos(a)*s*0.014, y+Math.sin(a)*s*0.014, s*0.012,s*0.007,a,0,7); ctx.fill(); }
      ctx.fillStyle='#f7d774'; ctx.beginPath(); ctx.arc(x,y,s*0.008,0,7); ctx.fill();
    }
    if(it.firefly){
      const x=W*(0.15+rx*0.7), y=H*(0.12+ry*0.2)+Math.sin(time*1.1+it.i)*6;
      const gl=0.5+0.5*Math.sin(time*3+it.i);
      const rad=ctx.createRadialGradient(x,y,0,x,y,s*0.05);
      rad.addColorStop(0,`rgba(247,224,140,${0.7*gl+0.2})`); rad.addColorStop(1,'rgba(247,224,140,0)');
      ctx.fillStyle=rad; ctx.beginPath(); ctx.arc(x,y,s*0.05,0,7); ctx.fill();
    }
  }

  return { mount, unmount, update };
})();
