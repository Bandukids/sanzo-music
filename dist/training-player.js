import { SoundEngine } from '/sound-engine.js';
import { createPlaybackClock } from '/playback-clock.js';

export function initTrainingPlayer({ findAsset, listAssets, getAudioURL, onError, onChange, onDetails }) {
 const $=selector=>document.querySelector(selector), audio=new Audio(), synth=new SoundEngine();
 let current=null, playing=false, loading=false, elapsed=0, duration=0, startedAt=0, operation=0, volume=.55, lastVolume=.55, notified=null;
 const playbackClock=createPlaybackClock(tick);
 const clock=value=>Math.floor(Math.max(0,value)/60)+':'+String(Math.floor(Math.max(0,value)%60)).padStart(2,'0');
 const isDemo=()=>current?.source==='demo';
 const queue=()=>current?listAssets().filter(a=>a.kind===current.kind&&!a.removed):[];
 audio.preload='metadata'; audio.volume=volume; synth.setVolume(volume);
 function position(){return isDemo()&&playing?Math.min(duration,elapsed+(performance.now()-startedAt)/1000):isDemo()?elapsed:audio.currentTime||0;}
 function update(){
  const at=position(), percent=duration?Math.min(100,at/duration*100):0, list=queue(), index=list.findIndex(a=>a.id===current?.id);
  $('#material-player-title').textContent=current?.name||'选择一段素材';
  $('#material-player-source').textContent=loading?'正在读取音频…':current?(isDemo()?'示例素材 · 合成试听':'我的上传 · 云端音频'):'点击素材即可试听';
  $('#material-player-kind').textContent=current?(current.kind==='voice'?'音色素材':'曲风素材')+' · '+current.format:'音色 / 曲风';
  $('#material-player-note').textContent=current?(isDemo()?'合成器演示，上传后可试听原始音频':current.originalName):'让每一段声音，都听得清楚。';
  $('#material-art-icon').setAttribute('href',current?.kind==='style'?'#i-style':'#i-voice');
  $('#material-play').disabled=!current||loading;
  $('#material-play').setAttribute('aria-label',playing?'暂停':'播放素材');
  $('#material-play svg use').setAttribute('href',playing?'#i-pause':'#i-play');
  $('#material-prev').disabled=loading||!current||(index<=0&&at<3);
  $('#material-next').disabled=loading||index<0||index>=list.length-1;
  $('#material-detail').disabled=!current;
  $('#material-elapsed').textContent=clock(at); $('#material-duration').textContent=clock(duration);
  $('#material-seek').disabled=!current||loading||!duration;
  $('#material-seek').value=String(percent*10); $('#material-seek').style.setProperty('--progress',percent+'%');
  $('#material-seek').setAttribute('aria-valuetext',clock(at)+' / '+clock(duration));
  $('#training-player').classList.toggle('is-playing',playing);
  playbackClock.setPlaying(isDemo()&&playing);
  if(!notified||notified.id!==current?.id||notified.playing!==playing||notified.loading!==loading){notified={id:current?.id,playing,loading};onChange(notified);}
 }
 function pause(){
  elapsed=position(); operation++; playing=false; loading=false; synth.stop(); audio.pause(); update();
 }
 function releaseAudio(){
  audio.pause(); audio.removeAttribute('src'); audio.load();
 }
 async function resume(){
  if(!current||loading)return;
  const token=++operation; loading=true; update();
  try {
   if(isDemo()){
    if(elapsed>=duration)elapsed=0;
    const started=await synth.start({id:current.id,style:current.kind==='voice'?'ambient':'electronic'},elapsed);
    if(token!==operation||!started)return;
    startedAt=performance.now(); playing=true;
   }else{
    if(audio.ended)audio.currentTime=0;
    await audio.play(); if(token!==operation)return; playing=true;
   }
   loading=false; update();
  }catch{
   if(token!==operation)return;
   pause(); onError('这段音频暂时无法播放，请确认文件格式或重新上传。');
  }
 }
 async function playAsset(id){
  const asset=findAsset(id); if(!asset||asset.removed)return;
  if(current?.id===id){if(!loading)playing?pause():resume();return;}
  pause(); releaseAudio(); current=asset; elapsed=0; duration=isDemo()?asset.duration||30:0;
  const token=++operation; loading=!isDemo(); update();
  if(isDemo()){await resume();return;}
  try{
   const url=getAudioURL(id); if(token!==operation)return;
   if(!url)throw Error('missing-audio');
   audio.src=url; loading=false; await resume();
  }catch{
   if(token!==operation)return;
   loading=false; update(); onError('未找到这段云端音频，请重新上传后试听。');
  }
 }
 async function seek(seconds){
  if(!current||!duration||loading)return;
  const wasPlaying=playing, next=Math.max(0,Math.min(duration,seconds));
  if(isDemo()){pause(); elapsed=next; if(wasPlaying)await resume();else update();}
  else{audio.currentTime=next; update();}
 }
 function stop(id){
  if(id&&current?.id!==id)return;
  pause(); releaseAudio(); current=null; elapsed=0; duration=0; update();
 }
 audio.addEventListener('loadedmetadata',()=>{if(!current||isDemo())return;duration=Number.isFinite(audio.duration)?audio.duration:0;update();});
 audio.addEventListener('timeupdate',()=>{if(current&&!isDemo()&&!document.hidden)update();});
 audio.addEventListener('ended',()=>{if(current&&!isDemo()){playing=false;loading=false;update();}});
 audio.addEventListener('pause',()=>{if(current&&!isDemo()){playing=false;update();}});
 audio.addEventListener('error',()=>{if(current&&!isDemo()&&audio.getAttribute('src')){pause();onError('无法解码这段音频，请尝试 WAV 或 MP3 文件。');}});
 $('#material-play').addEventListener('click',()=>playing?pause():resume());
 $('#material-seek').addEventListener('input',e=>seek(Number(e.target.value)/1000*duration));
 $('#material-prev').addEventListener('click',()=>{if(position()>=3){seek(0);return;}const list=queue(),index=list.findIndex(a=>a.id===current?.id);if(index>0)playAsset(list[index-1].id);});
 $('#material-next').addEventListener('click',()=>{const list=queue(),index=list.findIndex(a=>a.id===current?.id);if(index>=0&&index<list.length-1)playAsset(list[index+1].id);});
 $('#material-detail').addEventListener('click',()=>current&&onDetails(current.id));
 function setVolume(next){
  volume=next; if(volume)lastVolume=volume; audio.volume=volume; synth.setVolume(volume);
  $('#material-volume').value=String(volume*100); $('#material-volume').style.setProperty('--progress',volume*100+'%');
  $('#material-mute').setAttribute('aria-pressed',String(!volume)); $('#material-mute').setAttribute('aria-label',volume?'静音':'取消静音');
  $('#material-mute svg use').setAttribute('href',volume?'#i-volume':'#i-muted');
 }
 $('#material-volume').addEventListener('input',e=>setVolume(Number(e.target.value)/100));
 $('#material-mute').addEventListener('click',()=>setVolume(volume?0:lastVolume));
 function tick(){if(isDemo()&&playing){if(position()>=duration){elapsed=duration;playing=false;synth.stop();}update();}}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&current&&!isDemo())update();});
 window.addEventListener('pagehide',e=>{pause();if(!e.persisted)playbackClock.destroy();});
 window.addEventListener('pageshow',e=>{if(e.persisted)update();});
 setVolume(volume);update();
 return {playAsset,stop,refresh:update};
}
