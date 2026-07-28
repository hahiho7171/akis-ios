/* ===== visuals.js — premium tam ekran odak görselleri (canvas) =====
   Tipler: hourglass (akan kum saati) · ring (halka) · clock (altın analog) · digits (premium dijital)
   Zaman yazısı, faz etiketi ve tur noktaları da canvas'ta çizilir (parıltı/altın efektleri için).
   update(state): {frac(0..1|null), timeText, phaseText, total, done, currentIdx, isWork} */
const AkisVisual = (() => {
  let canvas, ctx, raf=null;
  let type='hourglass';
  let st={frac:0,timeText:'',phaseText:'',total:0,done:0,currentIdx:-1,isWork:true};
  let shown=0, W=0,H=0,DPR=1,t0=0;

  const GOLD ={a:'#f8dc92',b:'#d9a23f',glow:'rgba(244,205,118,.42)',line:'#f4cd76'};
  const AQUA ={a:'#4fe0ea',b:'#3aa0f0',glow:'rgba(58,160,240,.42)',line:'#4fd6e6'};
  const BREAK={a:'#ffc07a',b:'#f0894a',glow:'rgba(255,158,90,.42)',line:'#ffb36b'};
  function pal(){
    if(!st.isWork) return BREAK;
    return (type==='ring') ? AQUA : GOLD;   // saat/kum/dijital = altın premium; halka = canlı aqua
  }
  const MONO='"SFMono-Regular",ui-monospace,Consolas,"Roboto Mono",monospace';
  const SANS='-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

  function init(cv){ canvas=cv; ctx=canvas.getContext('2d'); resize(); window.addEventListener('resize',resize); }
  function resize(){
    if(!canvas) return;
    DPR=Math.min(window.devicePixelRatio||1,2.5);
    const r=canvas.getBoundingClientRect(); W=r.width; H=r.height;
    canvas.width=Math.round(W*DPR); canvas.height=Math.round(H*DPR);
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  function setType(tp){ type=tp; }
  function setPhase(p){ st.isWork=(p==='work'); }
  function update(state){ if(state) st=Object.assign(st,state); }
  function start(){ if(raf) return; t0=performance.now(); loop(); }
  function stop(){ if(raf){cancelAnimationFrame(raf); raf=null;} }

  function loop(){
    raf=requestAnimationFrame(loop);
    const time=(performance.now()-t0)/1000;
    if(st.frac!=null) shown += (st.frac-shown)*0.08;
    ctx.clearRect(0,0,W,H);
    // yatay ekranda kısa yükseklik → dengeli boyut; etiketler tuval içinde kalır
    const landscape = W > H*1.25;
    const cx=W/2, cy=H*(landscape?0.47:0.42), R=Math.min(W*0.32, H*(landscape?0.30:0.255));
    if(type==='clock')       drawClock(cx,cy,R,time);
    else if(type==='ring')   drawRing(cx,cy,R,time);
    else if(type==='digits') drawDigits(cx,cy,R,time);
    else                     drawHourglass(cx,cy,R,time);
  }

  // ---------- ortak yardımcılar ----------
  let bgClear=false;
  function setBgClear(v){ bgClear=!!v; }
  function vignette(dark){
    if(bgClear) return;   // video arka plan açıkken canvas'ı koyu doldurma (video görünsün)
    const g=ctx.createRadialGradient(W/2,H*0.42,0,W/2,H*0.42,Math.max(W,H)*0.72);
    if(dark){ g.addColorStop(0,'#0a0d12'); g.addColorStop(.6,'#05070a'); g.addColorStop(1,'#000'); }
    else { g.addColorStop(0,'rgba(20,28,40,.35)'); g.addColorStop(1,'rgba(4,6,10,0)'); }
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  }
  function glow(shape, color, blur){ ctx.save(); ctx.shadowColor=color; ctx.shadowBlur=blur; shape(); ctx.restore(); }
  function text(txt,x,y,size,color,gl,font,weight,spacing){
    ctx.save();
    ctx.font=`${weight||300} ${size}px ${font||SANS}`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    if(gl){ ctx.shadowColor=gl; ctx.shadowBlur=size*0.45; }
    ctx.fillStyle=color;
    if(spacing){ letterText(txt,x,y,spacing); } else ctx.fillText(txt,x,y);
    ctx.restore();
  }
  function letterText(txt,x,y,sp){
    const ws=[...txt].map(c=>ctx.measureText(c).width+sp);
    const total=ws.reduce((a,b)=>a+b,0)-sp; let cxp=x-total/2;
    [...txt].forEach((c,i)=>{ ctx.fillText(c,cxp+ws[i]/2-sp/2,y); cxp+=ws[i]; });
  }
  function phaseLabel(x,y){ const c=pal(); y=Math.max(16,Math.min(H-16,y)); text(st.phaseText,x,y,13,c.line,c.glow,SANS,600,4); }
  function dots(cx,y){
    if(!st.total) return; const c=pal(); y=Math.min(H-8,y); const gap=15,r=4.2,w=(st.total-1)*gap; let x=cx-w/2;
    for(let i=0;i<st.total;i++){
      ctx.beginPath(); ctx.arc(x,y,r,0,7);
      if(i<st.done){ ctx.fillStyle=c.line; }
      else if(i===st.currentIdx && st.isWork){ ctx.fillStyle=c.line; ctx.globalAlpha=.55; }
      else { ctx.fillStyle='rgba(255,255,255,.16)'; }
      ctx.fill(); ctx.globalAlpha=1; x+=gap;
    }
  }
  function grad(x0,y0,x1,y1,c){ const g=ctx.createLinearGradient(x0,y0,x1,y1); g.addColorStop(0,c.a); g.addColorStop(1,c.b); return g; }
  // '#rrggbb' → 'rgba(r,g,b,a)' (gradyan durak renklerinde alfa gerektiği için)
  function rgba(hex,a){
    const h=String(hex).replace('#','');
    const n=parseInt(h.length===3 ? h.split('').map(c=>c+c).join('') : h, 16);
    return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
  }

  // ---------- HALKA ----------
  function drawRing(cx,cy,R,time){
    vignette(false); const c=pal(); const lw=Math.max(9,R*0.10);
    // arka ışıma
    glow(()=>{ ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.strokeStyle='rgba(0,0,0,0)'; ctx.stroke(); }, c.glow, 0);
    ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.lineWidth=lw; ctx.strokeStyle='rgba(255,255,255,.06)'; ctx.stroke();
    const rem = st.frac==null ? (0.5+0.5*Math.sin(time*1.1)) : (1-shown);
    const s=-Math.PI/2, e=s+Math.PI*2*rem;
    ctx.save(); ctx.shadowColor=c.glow; ctx.shadowBlur=24;
    ctx.beginPath(); ctx.arc(cx,cy,R,s,e); ctx.lineWidth=lw; ctx.lineCap='round';
    ctx.strokeStyle=grad(cx-R,cy-R,cx+R,cy+R,c); ctx.stroke(); ctx.restore();
    // baş nokta
    const px=cx+Math.cos(e)*R, py=cy+Math.sin(e)*R;
    ctx.beginPath(); ctx.arc(px,py,lw*0.42,0,7); ctx.fillStyle='#fff'; ctx.shadowColor=c.glow; ctx.shadowBlur=12; ctx.fill(); ctx.shadowBlur=0;
    phaseLabel(cx,cy-R*0.42);
    text(st.timeText,cx,cy+2,Math.min(58,R*0.62),'#fff',null,MONO,300);
    dots(cx,cy+R*0.44);
  }

  // ---------- ALTIN ANALOG SAAT ----------
  function drawClock(cx,cy,R,time){
    vignette(true); const c=pal();
    // dış hâle
    const halo=ctx.createRadialGradient(cx,cy,R*0.6,cx,cy,R*1.5);
    halo.addColorStop(0,c.glow); halo.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=halo; ctx.beginPath(); ctx.arc(cx,cy,R*1.5,0,7); ctx.fill();
    // kadran zemini
    const face=ctx.createRadialGradient(cx-R*0.3,cy-R*0.3,R*0.1,cx,cy,R);
    face.addColorStop(0,'#161a20'); face.addColorStop(1,'#0a0d11');
    ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.fillStyle=face; ctx.fill();
    // ince altın çerçeve
    ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.lineWidth=2.4;
    ctx.strokeStyle=grad(cx-R,cy-R,cx+R,cy+R,c); ctx.shadowColor=c.glow; ctx.shadowBlur=14; ctx.stroke(); ctx.shadowBlur=0;
    // çentikler
    for(let i=0;i<60;i++){
      const a=i/60*Math.PI*2 - Math.PI/2; const big=i%5===0;
      const r1=big?R*0.82:R*0.88, r2=R*0.94;
      ctx.beginPath(); ctx.moveTo(cx+Math.cos(a)*r1,cy+Math.sin(a)*r1); ctx.lineTo(cx+Math.cos(a)*r2,cy+Math.sin(a)*r2);
      ctx.lineWidth=big?2.6:1; ctx.strokeStyle=big?c.line:'rgba(255,255,255,.22)'; ctx.stroke();
    }
    // kalan süre yayı (kadran kenarında altın, tükeniyor)
    const rem = st.frac==null ? (0.5+0.5*Math.sin(time*0.8)) : (1-shown);
    ctx.save(); ctx.shadowColor=c.glow; ctx.shadowBlur=16;
    ctx.beginPath(); ctx.arc(cx,cy,R*0.94,-Math.PI/2,-Math.PI/2+Math.PI*2*rem);
    ctx.lineWidth=3.5; ctx.lineCap='round'; ctx.strokeStyle=grad(cx-R,cy,cx+R,cy,c); ctx.stroke(); ctx.restore();
    // yumuşak akan ibre (sürekli süpürme = akış hissi)
    const secA = (time%60)/60*Math.PI*2 - Math.PI/2;
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(secA);
    ctx.beginPath(); ctx.moveTo(-R*0.12,0); ctx.lineTo(R*0.74,0);
    ctx.lineWidth=2; ctx.lineCap='round'; ctx.strokeStyle=c.line; ctx.shadowColor=c.glow; ctx.shadowBlur=10; ctx.stroke();
    ctx.restore();
    // ikinci (yavaş) ibre — dakika hissi
    const minA = (time%600)/600*Math.PI*2 - Math.PI/2;
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(minA);
    ctx.beginPath(); ctx.moveTo(-R*0.08,0); ctx.lineTo(R*0.5,0);
    ctx.lineWidth=3.4; ctx.lineCap='round'; ctx.strokeStyle='rgba(255,255,255,.85)'; ctx.stroke();
    ctx.restore();
    // merkez altın göbek
    ctx.beginPath(); ctx.arc(cx,cy,5.5,0,7); ctx.fillStyle=c.line; ctx.shadowColor=c.glow; ctx.shadowBlur=10; ctx.fill(); ctx.shadowBlur=0;
    ctx.beginPath(); ctx.arc(cx,cy,2,0,7); ctx.fillStyle='#0a0d11'; ctx.fill();
    // yazılar
    phaseLabel(cx,cy-R-24);
    text(st.timeText,cx,cy+R+38,Math.min(34,R*0.36),c.line,c.glow,MONO,300);
    dots(cx,cy+R+68);
  }

  // ---------- PREMIUM DİJİTAL ----------
  function drawDigits(cx,cy,R,time){
    vignette(true); const c=pal();
    const breathe=0.85+0.15*Math.sin(time*1.1);
    // arka ışıma
    const halo=ctx.createRadialGradient(cx,cy,10,cx,cy,R*1.8);
    halo.addColorStop(0,`rgba(244,205,118,${(st.isWork?0.16:0.12)*breathe})`); halo.addColorStop(1,'rgba(0,0,0,0)');
    if(!st.isWork){ halo.addColorStop(0,`rgba(255,158,90,${0.13*breathe})`); }
    ctx.fillStyle=halo; ctx.beginPath(); ctx.arc(cx,cy,R*1.8,0,7); ctx.fill();
    phaseLabel(cx,cy-R*0.62);
    // büyük zaman — altın gradyan + parıltı
    const size=Math.min(78,W*0.2);
    ctx.save();
    ctx.font=`200 ${size}px ${MONO}`; ctx.textAlign='center'; ctx.textBaseline='middle';
    const g=ctx.createLinearGradient(cx-120,cy-size/2,cx+120,cy+size/2); g.addColorStop(0,c.a); g.addColorStop(1,c.b);
    ctx.shadowColor=c.glow; ctx.shadowBlur=26; ctx.fillStyle=g; ctx.fillText(st.timeText,cx,cy);
    ctx.restore();
    // yansıma — yazının hemen altında başlar, aşağı doğru sönerek biter.
    // ÖNEMLİ: ilerleme çizgisi (cy+size*0.62) ve tur noktalarından ÖNCE kesilir; eskiden üstlerinden geçip lekeliyordu.
    const reflTop=cy+size*0.40, reflBot=cy+size*0.56, reflMid=cy+size*0.76;
    ctx.save();
    ctx.beginPath(); ctx.rect(0,reflTop,W,reflBot-reflTop); ctx.clip();   // ekran uzayında bant
    ctx.translate(0,reflMid); ctx.scale(1,-1); ctx.translate(0,-reflMid); // aynalama
    ctx.font=`200 ${size}px ${MONO}`; ctx.textAlign='center'; ctx.textBaseline='middle';
    // gradyan aynalanmış uzayda tanımlanır: ekran y ↔ 2*reflMid - y
    const rg=ctx.createLinearGradient(0,2*reflMid-reflTop,0,2*reflMid-reflBot);
    rg.addColorStop(0,rgba(c.b,0.18)); rg.addColorStop(1,rgba(c.b,0));
    ctx.fillStyle=rg; ctx.fillText(st.timeText,cx,reflMid);
    ctx.restore();
    // ince ilerleme çizgisi
    const rem = st.frac==null ? 1 : (1-shown); const lw2=Math.min(150,W*0.36);
    ctx.beginPath(); ctx.moveTo(cx-lw2/2,cy+size*0.62); ctx.lineTo(cx-lw2/2+lw2*rem,cy+size*0.62);
    ctx.lineWidth=3; ctx.lineCap='round'; ctx.strokeStyle=c.line; ctx.shadowColor=c.glow; ctx.shadowBlur=10; ctx.stroke(); ctx.shadowBlur=0;
    dots(cx,cy+size*0.62+30);
  }

  // ---------- GERÇEKÇİ AKAN KUM SAATİ ----------
  function drawHourglass(cx,cy,R,time){
    vignette(false); const c=pal();
    const w=R*1.16, h=R*2.0, left=cx-w/2, right=cx+w/2, top=cy-h/2, bot=cy+h/2, mid=cy, neck=w*0.055;
    const p = st.frac==null ? (time*0.12)%1 : shown;   // geçen oran
    // cam gövde (hafif dolgu + kenar ışığı)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(left,top); ctx.lineTo(right,top); ctx.lineTo(cx+neck,mid); ctx.lineTo(right,bot);
    ctx.lineTo(left,bot); ctx.lineTo(cx-neck,mid); ctx.closePath();
    const glass=ctx.createLinearGradient(left,0,right,0);
    glass.addColorStop(0,'rgba(255,255,255,.06)'); glass.addColorStop(.5,'rgba(255,255,255,.015)'); glass.addColorStop(1,'rgba(255,255,255,.05)');
    ctx.fillStyle=glass; ctx.fill();
    ctx.restore();
    // ÜST kum (kalan 1-p)
    ctx.save(); clipTri(left,right,top,mid,cx,neck,true); ctx.clip();
    const sandTopY=mid-(mid-top)*(1-p);
    ctx.fillStyle=grad(0,top,0,bot,c); ctx.fillRect(left-8,sandTopY,w+16,mid-sandTopY+2);
    sandTexture(left-8,sandTopY,w+16,mid-sandTopY+2,c);
    ctx.restore();
    // ALT yığın (p)
    ctx.save(); clipTri(left,right,bot,mid,cx,neck,false); ctx.clip();
    const pileH=(bot-mid)*p;
    ctx.fillStyle=grad(0,top,0,bot,c);
    ctx.beginPath(); ctx.moveTo(left-8,bot+2); ctx.lineTo(right+8,bot+2); ctx.lineTo(right+8,bot-pileH);
    ctx.quadraticCurveTo(cx,bot-pileH-Math.min(16,pileH*0.5),left-8,bot-pileH); ctx.closePath(); ctx.fill();
    sandTexture(left-8,bot-pileH-16,w+16,pileH+18,c);
    ctx.restore();
    // düşen ince kum akışı
    if(st.frac==null || (p>0.002 && p<0.998)){
      ctx.save(); ctx.shadowColor=c.glow; ctx.shadowBlur=6;
      for(let i=0;i<5;i++){
        const yy=mid+((time*300+i*33)%(bot-mid-8));
        const jitter=Math.sin((time*8)+i*2)*1.4;
        ctx.globalAlpha=0.85-(yy-mid)/(bot-mid)*0.55;
        ctx.fillStyle=c.a; ctx.fillRect(cx-1.1+jitter,yy,2.2,5);
      }
      ctx.restore();
    }
    // cam kenar çizgisi + parıltı
    ctx.save(); ctx.shadowColor='rgba(255,255,255,.15)'; ctx.shadowBlur=6;
    ctx.beginPath();
    ctx.moveTo(left,top); ctx.lineTo(right,top); ctx.lineTo(cx+neck,mid); ctx.lineTo(right,bot);
    ctx.lineTo(left,bot); ctx.lineTo(cx-neck,mid); ctx.closePath();
    ctx.lineWidth=2.4; ctx.strokeStyle='rgba(226,236,245,.4)'; ctx.stroke();
    // sol iç parlama
    ctx.beginPath(); ctx.moveTo(left+3,top+4); ctx.lineTo(cx-neck+2,mid-2);
    ctx.lineWidth=1.5; ctx.strokeStyle='rgba(255,255,255,.12)'; ctx.stroke();
    ctx.restore();
    // altın kapaklar
    ctx.lineWidth=6; ctx.lineCap='round'; ctx.strokeStyle=grad(left,0,right,0,c);
    ctx.shadowColor=c.glow; ctx.shadowBlur=10;
    ctx.beginPath(); ctx.moveTo(left-7,top); ctx.lineTo(right+7,top); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(left-7,bot); ctx.lineTo(right+7,bot); ctx.stroke(); ctx.shadowBlur=0;
    // yazılar
    phaseLabel(cx,top-26);
    text(st.timeText,cx,bot+34,Math.min(34,R*0.36),c.line,c.glow,MONO,300);
    dots(cx,bot+64);
  }
  function clipTri(l,r,edgeY,mid,cx,neck,topSide){
    ctx.beginPath();
    if(topSide){ ctx.moveTo(l,edgeY); ctx.lineTo(r,edgeY); ctx.lineTo(cx+neck,mid); ctx.lineTo(cx-neck,mid); }
    else { ctx.moveTo(cx-neck,mid); ctx.lineTo(cx+neck,mid); ctx.lineTo(r,edgeY); ctx.lineTo(l,edgeY); }
    ctx.closePath();
  }
  function sandTexture(x,y,w,h,c){
    // ince tane hissi: birkaç yatay koyu/açık şerit
    ctx.save(); ctx.globalAlpha=0.10;
    for(let i=0;i<3;i++){ ctx.fillStyle=i%2?'#000':'#fff'; ctx.fillRect(x,y+h*(0.2+i*0.28),w,1.2); }
    ctx.restore();
  }

  return { init, setType, setPhase, update, start, stop, resize, setBgClear };
})();
