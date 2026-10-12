const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=n=>`<svg aria-hidden="true"><use href="#i-${n}"/></svg>`;
const pending=job=>job&&['queued','running'].includes(job.status);
export const bestLyrics=input=>input.structuredLyrics??input.inferredLyrics??'';
export function analysisFields(){return `<fieldset id="studio-analysis-fields"><div class="studio-field-title"><span>02</span><h3>原曲解析</h3><small>歌词 + ABC</small></div><div id="studio-analysis" aria-live="polite"></div></fieldset>`;}
export function initStudioInference({service,getSource,getFile,isActive,message}){
 const panel=document.querySelector('#studio-analysis'),lyrics=document.querySelector('#studio-cover-lyrics');
 let key=null,current=null,token=0,timer,busy=false,previousAuto='',appliedJob=null;
 const version=job=>job.id+':'+(job.input.lyricsArrangement?.updatedAt||'raw');
 function render(note){
  const status=note||(current?service.status(current):'选歌后自动提取歌词与 ABC'),working=busy||pending(current);
  panel.innerHTML=`<div class="studio-analysis-status ${working?'is-generating':''}"><span>${icon(working?'spark':current?.status==='succeeded'?'score':'music')}</span><div><strong>${esc(status)}</strong><p>${esc(current?.error||(working?'正在提取歌词，完成后会自动填入下方。':current?.status==='succeeded'?'歌词已载入，可直接编辑或翻译。':'选择歌曲后自动解析。'))}</p></div></div>${current&&['failed','unknown'].includes(current.status)?`<button class="soft-button studio-analysis-retry" type="button">${current.status==='unknown'?'核对提交':'重试解析'}</button>`:''}${pending(current)?'<button class="soft-button studio-analysis-sync" type="button">同步结果</button>':''}`;
  panel.querySelector('.studio-analysis-retry')?.addEventListener('click',()=>select(true));
  panel.querySelector('.studio-analysis-sync')?.addEventListener('click',()=>service.poll());
 }
 function apply(job){
  current=job;busy=false;
  if(job.status==='succeeded'&&job.input.lyricsArrangement?.status!=='running'&&appliedJob!==version(job)){
   if(!lyrics.value.trim()||lyrics.value===previousAuto){lyrics.value=bestLyrics(job.input);previousAuto=lyrics.value;}
   appliedJob=version(job);
  }
  render();
 }
 async function select(retry=false){
  clearTimeout(timer);if(!isActive())return;
  const source=getSource(),file=source?.id?null:getFile(),next=source?.id||file;
  if(!source){reset();return;}if(next===key&&current&&!retry)return;
  const ticket=++token;key=next;current=null;busy=true;appliedJob=null;
  if(lyrics.value===previousAuto)lyrics.value='';previousAuto='';
  render(file?'正在上传原曲…':'正在读取原曲…');
  try{const job=await service.infer(source,file,{retry});if(ticket===token)apply(job);}
  catch(error){if(ticket!==token)return;busy=false;render('未能提交原曲解析');panel.insertAdjacentHTML('beforeend','<button class="soft-button studio-analysis-retry" type="button">重试解析</button>');panel.querySelector('.studio-analysis-retry').onclick=()=>select(true);message(error.message+' 重试会核对同一提交。');}
 }
 function changed(){
  clearTimeout(timer);const source=getSource(),next=source?.id||getFile();
  if(next!==key){token++;current=null;busy=false;render(source?'正在准备原曲解析…':undefined);}
  timer=setTimeout(()=>select(),300);
 }
 function update(job){if(current?.id===job.id)apply(job);}
 function reset(){clearTimeout(timer);token++;key=null;current=null;busy=false;previousAuto='';appliedJob=null;render();}
 function restore(record){clearTimeout(timer);token++;key=record.plan.source.id||getFile();current=record.job?.input.model==='cover-inference'?record.job:service.inference(record.plan.source.id||record.plan.sourceAsset);busy=false;appliedJob=current?.status==='succeeded'?version(current):null;previousAuto=lyrics.value===bestLyrics(current?.input||{})?lyrics.value:'';render();}
 document.querySelector('#studio-use-original').onclick=()=>{if(current?.input.inferredLyrics!==undefined){lyrics.value=bestLyrics(current.input);previousAuto=lyrics.value;message('已载入原曲歌词。');}else message('原曲歌词解析完成后即可载入。');};
 render();
 return {changed,update,reset,restore,select,submitting:()=>busy,ready:()=>current?.status==='succeeded',data:()=>current?{analysisJobId:current.id,sourceAsset:current.input.sourceAsset,abcNotation:current.input.abcNotation||'',inferredLyrics:current.input.inferredLyrics||'',structuredLyrics:current.input.structuredLyrics,lyricsArrangement:current.input.lyricsArrangement,lyricsTimestamps:current.input.lyricsTimestamps}: {}};
}
