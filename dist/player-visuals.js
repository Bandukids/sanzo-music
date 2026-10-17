import { demoLyricCues } from './demo-lyrics.js';

export function lyricCues(track) {
  if (track.instrumental) return {lines:[],label:'纯音乐'};
  const raw=String(track.lyrics||'').trim();
  const demo=!raw&&demoLyricCues(track);
  if(demo?.length)return {lines:demo,label:'示例歌词',estimated:false,demo:true};
  const text=raw;
  const timed=[];
  const plain=[];
  for (const line of text.split(/\r?\n/).slice(0,300)) {
    const marks=[...line.matchAll(/\[(\d{1,3}):([0-5]\d(?:\.\d{1,3})?)\]/g)];
    const words=line.replace(/\[[^\]]*\]/g,'').trim().slice(0,400);
    if (!words) continue;
    if (marks.length) {
      marks.forEach(mark=>timed.push({at:Number(mark[1])*60+Number(mark[2]),text:words}));
    } else plain.push(words);
  }
  const lines=timed.length?timed.filter(l=>l.at<track.duration).sort((a,b)=>a.at-b.at):plain.map((text,i)=>({at:i*track.duration/Math.max(plain.length,1),text}));
  return {lines,label:lines.length?(track.generated||track.published?'歌曲歌词':'草稿歌词'):'暂无歌词',estimated:!timed.length};
}

export function initPlayerLyrics({seek}) {
  const details=document.querySelector('#player-lyrics');
  if (!details) return {update(){},destroy(){}};
  const summary=details.querySelector('summary');
  const linesBox=document.querySelector('#lyrics-lines');
  const currentLine=document.querySelector('#lyric-current');
  const nextLine=document.querySelector('#lyric-next');
  const counter=document.querySelector('#lyric-counter');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let track=null,cues=[],active=-2,signature=null,destroyed=false,lineAnimation=null;
  const motionPaused=()=>reduced.matches||document.body.classList.contains('motion-paused');
  const clock=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;

  function revealActive() {
    if (!details.open||active<0) return;
    const row=linesBox.children[active];
    if (row&&(row.offsetTop<linesBox.scrollTop||row.offsetTop+row.offsetHeight>linesBox.scrollTop+linesBox.clientHeight)) {
      linesBox.scrollTo({top:Math.max(0,row.offsetTop-linesBox.clientHeight/3),behavior:motionPaused()?'instant':'smooth'});
    }
  }
  function updateLine(p) {
    let index=-1;
    for(let i=0;i<cues.length&&cues[i].at<=p;i++)index=i;
    if (index===active) return;
    const animate=active!==-2&&!motionPaused();
    active=index;
    const line=cues[index];
    currentLine.textContent=line?.text||(cues.length?'前奏 · 让声音慢慢展开':track.instrumental?'纯音乐':'暂无歌词');
    lineAnimation?.cancel();
    if(animate)lineAnimation=currentLine.animate([{opacity:.35,transform:'translateY(2px)'},{opacity:1,transform:'translateY(0)'}],{duration:260,easing:'cubic-bezier(.2,.7,.2,1)'});
    nextLine.textContent=cues[index+1]?.text||(cues.length?'让余韵，留在此刻':track.instrumental?'纯音乐 · 专注此刻的声音':'暂无歌词 · 欣赏这段旋律');
    counter.textContent=cues.length?`${String(Math.max(0,index+1)).padStart(2,'0')} / ${String(cues.length).padStart(2,'0')}`:'INSTRUMENTAL';
    [...linesBox.children].forEach((row,i)=>{if(i===index)row.setAttribute('aria-current','true');else row.removeAttribute('aria-current');});
    revealActive();
  }
  function update(t,playing,p) {
    if (destroyed) return;
    const fields=['id','lyrics','instrumental','duration','title'];
    if (!signature||fields.some(field=>t[field]!==signature[field])) {
      signature=Object.fromEntries(fields.map(field=>[field,t[field]]));track=t;active=-2;
      const parsed=lyricCues(t);cues=parsed.lines;
      details.dataset.hasLyrics=String(cues.length>0);
      document.querySelector('#lyric-mode').textContent=parsed.label;
      document.querySelector('#lyrics-track-title').textContent=t.title;
      document.querySelector('#lyrics-note').textContent=cues.length?(parsed.demo?'示例歌词，仅用于界面预览。':parsed.estimated?'歌词位置按播放进度估算，并非逐句对齐。':'歌词按时间标记同步，点击可跳转。'):t.instrumental?'这是一首纯音乐，让旋律替你表达。':'这首作品暂无歌词，先沉浸在声音里。';
      linesBox.replaceChildren();
      if (cues.length) {
        cues.forEach(cue=>{
          const row=document.createElement('button');row.type='button';
          const time=document.createElement('small');time.textContent=clock(cue.at);
          const text=document.createElement('span');text.textContent=cue.text;
          row.append(time,text);row.setAttribute('aria-label',`跳到 ${clock(cue.at)}，${cue.text}`);
          row.addEventListener('click',()=>{seek(cue.at);updateLine(cue.at);});linesBox.append(row);
        });
      } else {
        const empty=document.createElement('p');empty.className='lyrics-empty';empty.textContent='♪  '+t.title;linesBox.append(empty);
      }
      linesBox.scrollTop=0;
    }
    updateLine(p);
  }
  function close() {details.open=false;summary.focus({preventScroll:true});}
  const outside=e=>{if(details.open&&!details.contains(e.target))details.open=false;};
  const escape=e=>{if(e.key==='Escape'&&details.open){e.preventDefault();close();}};
  document.querySelector('#close-lyrics').addEventListener('click',close);
  details.addEventListener('toggle',()=>{summary.setAttribute('aria-expanded',String(details.open));revealActive();});
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return {update,destroy(){destroyed=true;lineAnimation?.cancel();document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);}};
}
