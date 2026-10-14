import {api} from '/cloud-state.js';
import {generationRequest,generationStatus} from '/music-generation.js';
import {createTaskPoller,observeTaskPolling} from './task-poller.js';

const uploaded=new WeakMap();
const models=new Set(['seedvc-speech','seedvc-song','yue2-cover','cover-inference']);
const submissionStore='sanzo-studio-submissions';
function readSubmissions(){
 try{const value=JSON.parse(sessionStorage.getItem(submissionStore)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}
}
function saveSubmissions(value){try{sessionStorage.setItem(submissionStore,JSON.stringify(value));}catch{}}
function once(map,key,run){if(!map.has(key))map.set(key,run().finally(()=>map.delete(key)));return map.get(key);}

export function initStudioSeedVC({onJob,onInference=()=>{},onError}){
 const inferences=new Map(),requests=new Map(),submissions=new Map(),formatting=new Map();
 const tracker=createTaskPoller({
  fetchJobs:async()=>(await generationRequest()).jobs.filter(j=>models.has(j.input.model)).reverse(),
  syncJob:async job=>(await generationRequest('/'+job.id+'/sync',{})).job,
  onJobs:jobs=>jobs.forEach(notify),onError:error=>onError(error.message)
 });
 const polling=observeTaskPolling(tracker);

 async function asset(sample,file,kind='upload-speech'){
  if(sample.id)return sample.id;
  if(!file||!file.size||file.size>32*1048576||!/\.(mp3|wav|flac)$/i.test(file.name))throw Error('支持 MP3、WAV、FLAC，每个文件不超过 32 MB。');
  if(!uploaded.has(file))uploaded.set(file,new Map());
  const cache=uploaded.get(file);
  if(!cache.has(kind)){
   const id='studio-'+crypto.randomUUID();
   cache.set(kind,api('/api/assets/'+id,{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name),'X-Asset-Kind':kind},body:file}).then(()=>id).catch(error=>{cache.delete(kind);throw error;}));
  }
  return cache.get(kind);
 }

 async function submit(source,reference,files,title,tool='speech'){
  const song=tool==='song';
  const [sourceAsset,referenceAsset]=await Promise.all([
   asset(source,files.source,song?'upload-music':'upload-speech'),asset(reference,files.target)
  ]);
  return request({model:song?'seedvc-song':'seedvc-speech',type:song?'songs':'speech',studioTool:tool,sourceAsset,referenceAsset,title,autoTitle:!title});
 }

 function cover(analysis,values){
  return request({model:'yue2-cover',type:'songs',studioTool:'cover',analysisJobId:analysis.analysisJobId,sourceAsset:analysis.sourceAsset,lyrics:values.lyrics,styles:values.styles,language:values.language,title:values.title,autoTitle:!values.title});
 }

 function request(input){
  const signature=JSON.stringify(input);
  return once(requests,signature,async()=>{
   let keys=readSubmissions();
   const previous=keys[signature],requestKey=(typeof previous==='string'?previous:previous?.key)||crypto.randomUUID();
   keys[signature]={key:requestKey};saveSubmissions(keys);
   const {job}=await generationRequest('',{...input,requestKey});
   keys=readSubmissions();keys[signature]={key:requestKey,jobId:job.id};saveSubmissions(keys);
   accept(job);return job;
  });
 }

 async function infer(source,file,{retry=false}={}){
  const sourceAsset=await asset(source,file,'upload-music'),known=inferences.get(sourceAsset);
  if(known&&(!retry||['queued','running','succeeded'].includes(known.status)))return known;
  return once(submissions,sourceAsset,()=>request({model:'cover-inference',type:'analysis',studioTool:'cover',sourceAsset}));
 }

 function clearSubmission(job){
  if(!['failed','succeeded'].includes(job.status))return;
  const keys=readSubmissions();let changed=false;
  for(const [signature,value] of Object.entries(keys))if(value?.jobId===job.id){delete keys[signature];changed=true;}
  if(changed)saveSubmissions(keys);
 }
 function notify(job){
  clearSubmission(job);
  if(job.input.model==='cover-inference'){
   const known=inferences.get(job.input.sourceAsset);
   if(known?.id===job.id&&Date.parse(known.updatedAt)>Date.parse(job.updatedAt))return;
   inferences.set(job.input.sourceAsset,job);onInference(job);
  }else onJob(job);
 }
 function accept(job){clearSubmission(job);tracker.accept([job]);polling.wake();}

 async function load(){try{return await tracker.load();}finally{polling.start({immediate:false});}}
 function format(id){
  return once(formatting,id,async()=>{
   const {job}=await generationRequest('/'+id+'/lyrics',{});accept(job);
   if(job.input.lyricsArrangement?.status==='failed')throw Error(job.input.lyricsArrangement.message);
   return job;
  });
 }
 async function poll(){if(!document.hidden)await tracker.poll();polling.wake();}
 const status=job=>job.input.model==='cover-inference'
  ?job.input.lyricsArrangement?.status==='running'?'DeepSeek 整理中':({queued:'等待解析',running:'解析中',succeeded:'解析完成',failed:'解析失败',unknown:'提交待核对'})[job.status]||'待核对'
  :generationStatus[job.status]||'待核对';
 return {submit,cover,infer,format,load,poll,inference:id=>inferences.get(id),status,destroy:polling.destroy};
}
