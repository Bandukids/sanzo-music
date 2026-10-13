import {api} from '/cloud-state.js';
import {generationRequest,generationStatus} from '/music-generation.js';
const uploaded=new WeakMap();
export function initStudioSeedVC({onJob,onInference=()=>{},onError}){
 let stopped=false,polling=false,timer;
 const pending=new Map(),inferences=new Map(),submissions=new Map(),formatting=new Map();
 async function asset(sample,file,kind='upload-speech'){
  if(sample.id)return sample.id;
  if(!file||!file.size||file.size>32*1048576||!/\.(mp3|wav|flac)$/i.test(file.name))throw Error('支持 MP3、WAV、FLAC，每个文件不超过 32 MB。');
  if(uploaded.get(file)?.has(kind))return uploaded.get(file).get(kind);
  const id='studio-'+crypto.randomUUID();
  const upload=api('/api/assets/'+id,{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name),'X-Asset-Kind':kind},body:file}).then(()=>id);
  if(!uploaded.has(file))uploaded.set(file,new Map());uploaded.get(file).set(kind,upload);
  try{return await upload;}catch(error){uploaded.get(file).delete(kind);throw error;}
 }
 async function submit(source,reference,files,title,tool='speech'){
  const song=tool==='song',sourceAsset=await asset(source,files.source,song?'upload-music':'upload-speech'),referenceAsset=await asset(reference,files.target);
  const input={model:song?'seedvc-song':'seedvc-speech',type:song?'songs':'speech',studioTool:tool,sourceAsset,referenceAsset,title,autoTitle:!title};
  return request(input);
 }
 async function cover(analysis,values){return request({model:'yue2-cover',type:'songs',studioTool:'cover',analysisJobId:analysis.analysisJobId,sourceAsset:analysis.sourceAsset,lyrics:values.lyrics,styles:values.styles,language:values.language,title:values.title,autoTitle:!values.title});}
 async function request(input){
  const signature=JSON.stringify(input);let keys={};try{keys=JSON.parse(sessionStorage.getItem('sanzo-studio-submissions')||'{}');}catch{}
  const previous=keys[signature],requestKey=(typeof previous==='string'?previous:previous?.key)||crypto.randomUUID();keys[signature]={key:requestKey};
  try{sessionStorage.setItem('sanzo-studio-submissions',JSON.stringify(keys));}catch{}
  const {job}=await generationRequest('',{...input,requestKey});
  try{keys=JSON.parse(sessionStorage.getItem('sanzo-studio-submissions')||'{}');keys[signature]={key:requestKey,jobId:job.id};sessionStorage.setItem('sanzo-studio-submissions',JSON.stringify(keys));}catch{}
  accept(job);
  return job;
 }
 async function infer(source,file,{retry=false}={}){
  const sourceAsset=await asset(source,file,'upload-music'),known=inferences.get(sourceAsset);
  if(known&&(!retry||['queued','running','succeeded'].includes(known.status)))return known;
  if(submissions.has(sourceAsset))return submissions.get(sourceAsset);
  const task=request({model:'cover-inference',type:'analysis',studioTool:'cover',sourceAsset});submissions.set(sourceAsset,task);
  try{return await task;}finally{submissions.delete(sourceAsset);}
 }
 function accept(job){
  if(job.input.model==='cover-inference'){const known=inferences.get(job.input.sourceAsset);if(known?.id===job.id&&Date.parse(known.updatedAt)>Date.parse(job.updatedAt))return;inferences.set(job.input.sourceAsset,job);onInference(job);}
  else if(['seedvc-speech','seedvc-song','yue2-cover'].includes(job.input.model))onJob(job);else return;
  if(['failed','succeeded'].includes(job.status))try{const keys=JSON.parse(sessionStorage.getItem('sanzo-studio-submissions')||'{}');for(const [signature,value]of Object.entries(keys))if(value?.jobId===job.id)delete keys[signature];sessionStorage.setItem('sanzo-studio-submissions',JSON.stringify(keys));}catch{}
  if(['queued','running'].includes(job.status))pending.set(job.id,job);else pending.delete(job.id);
 }
 async function load(){const {jobs}=await generationRequest();[...jobs].reverse().forEach(accept);}
 async function format(id){
  if(formatting.has(id))return formatting.get(id);
  const task=generationRequest('/'+id+'/lyrics',{}).then(({job})=>{accept(job);if(job.input.lyricsArrangement?.status==='failed')throw Error(job.input.lyricsArrangement.message);return job;});formatting.set(id,task);
  try{return await task;}finally{formatting.delete(id);}
 }
 async function poll(){if(stopped||polling||document.hidden)return;polling=true;
  try{await load();for(const id of pending.keys()){const {job}=await generationRequest('/'+id+'/sync',{});accept(job);}}
  catch(error){onError(error.message);}finally{polling=false;}
 }
 timer=setInterval(poll,12000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
 window.addEventListener('pagehide',()=>{stopped=true;clearInterval(timer);});
 return {submit,cover,infer,format,load,poll,inference:id=>inferences.get(id),status:job=>job.input.model==='cover-inference'?(job.input.lyricsArrangement?.status==='running'?'DeepSeek 整理中':({queued:'等待解析',running:'解析中',succeeded:'解析完成',failed:'解析失败',unknown:'提交待核对'})[job.status]||'待核对'):generationStatus[job.status]||'待核对'};
}
