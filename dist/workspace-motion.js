export function initWorkspaceMotion() {
 const canvas=document.querySelector('#workspace-particles');
 const context=canvas?.getContext('2d',{alpha:true});
 if(!context)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const toggle=document.querySelector('#motion-toggle');
 let width=0,height=0,points=[],frame=0,last=0,clock=0,paused=reduced.matches,stopped=false;
 let pointer={x:.76,y:.4},focus={x:.76,y:.4};
 const glowImage=document.createElement('canvas');glowImage.width=glowImage.height=256;
 const glowContext=glowImage.getContext('2d'),glow=glowContext.createRadialGradient(128,128,0,128,128,128);
 glow.addColorStop(0,'rgba(77,144,244,.055)');glow.addColorStop(1,'rgba(77,144,244,0)');
 glowContext.fillStyle=glow;glowContext.fillRect(0,0,256,256);
 function particleImage(point,dark) {
  const sprite=document.createElement('canvas');sprite.width=sprite.height=54;
  const paint=sprite.getContext('2d');paint.scale(1.5,1.5);
  const color=point.orange?(dark?'255,179,121':'210,139,87'):(dark?'143,195,255':'74,128,191');
  paint.beginPath();paint.arc(18,18,point.r,0,Math.PI*2);
  paint.shadowBlur=9;paint.shadowColor=`rgba(${color},.5)`;
  paint.fillStyle=`rgba(${color},.62)`;paint.fill();
  return {image:sprite,dark};
 }
 function resize() {
  width=innerWidth;height=innerHeight;
  const ratio=Math.min(devicePixelRatio||1,1.5);
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
  context.setTransform(ratio,0,0,ratio,0,0);
  const count=Math.min(width<780?42:100,Math.max(28,Math.floor(width*height/14000)));
  points=Array.from({length:count},()=>({x:Math.random()*width,y:Math.random()*height,r:.6+Math.random()*1.5,speed:3+Math.random()*7,phase:Math.random()*Math.PI*2,orange:Math.random()>.72}));
  draw(0);
 }
 function draw(delta) {
  const dark=document.documentElement.dataset.theme==='dark';
  clock+=delta;focus.x+=(pointer.x-focus.x)*.025;focus.y+=(pointer.y-focus.y)*.025;
  context.clearRect(0,0,width,height);
  const radius=width*.42;
  context.drawImage(glowImage,focus.x*width-radius,focus.y*height-radius,radius*2,radius*2);
  for(const p of points) {
   p.y-=p.speed*delta;p.x+=Math.sin(clock*.2+p.phase)*delta*3;
   if(p.y < -8){p.y=height+8;p.x=Math.random()*width;}
   if(p.x>width+8)p.x=-8;if(p.x<-8)p.x=width+8;
   const shimmer=.3+(Math.sin(clock*.7+p.phase)+1)*.16;
   if(!p.sprite||p.sprite.dark!==dark)p.sprite=particleImage(p,dark);
   context.globalAlpha=shimmer/.62;
   context.drawImage(p.sprite.image,p.x-18,p.y-18,36,36);
  }
  context.globalAlpha=1;
  // Sparse, slow light trails rather than a dense network behind the text.
  for(let i=0;i<points.length;i+=5){const a=points[i],b=points[(i+7)%points.length],distance=Math.hypot(a.x-b.x,a.y-b.y);if(distance<150){context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.lineWidth=.5;context.strokeStyle=`rgba(123,181,255,${(1-distance/150)*.09})`;context.stroke();}}
 }
 function tick(now) {
  frame=0;if(paused||document.hidden||stopped)return;
  if(now-last>=32){const delta=last?Math.min((now-last)/1000,.06):0;last=now;draw(delta);}
  frame=requestAnimationFrame(tick);
 }
 function sync() {
  cancelAnimationFrame(frame);frame=0;last=0;
  document.body.classList.toggle('motion-paused',paused||reduced.matches||document.hidden||stopped);
  toggle?.setAttribute('aria-pressed',String(paused));
  toggle?.setAttribute('aria-label',paused?'播放背景动效':'暂停背景动效');
  if(toggle)toggle.title=paused?'播放背景动效':'暂停背景动效';
  if(!paused&&!document.hidden&&!stopped)frame=requestAnimationFrame(tick);
 }
 toggle?.addEventListener('click',()=>{paused=!paused;sync();});
 reduced.addEventListener('change',()=>{paused=reduced.matches;sync();});
 document.addEventListener('visibilitychange',sync);
 document.addEventListener('sanzo-themechange',()=>draw(0));
 document.addEventListener('pointermove',e=>{pointer={x:e.clientX/Math.max(width,1),y:e.clientY/Math.max(height,1)};},{passive:true});
 let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,120);},{passive:true});
 window.addEventListener('pagehide',()=>{stopped=true;sync();});
 window.addEventListener('pageshow',()=>{stopped=false;sync();});
 resize();sync();
}
