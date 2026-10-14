// Reads and synchronizes accepted tasks only; this module never submits a generation.
export function createTaskPoller({fetchJobs,syncJob,onJobs,onError=()=>{},now=Date.now,discoveryInterval=60000,concurrency=2}) {
 const pending=new Map(),known=new Map();
 let loading=null,polling=null,discoverAt=0,stopped=false;

 function accept(jobs) {
  if(stopped)return;
  const changed=[];
  for(const job of jobs) {
   const previous=known.get(job.id),updated=Date.parse(job.updatedAt)||0;
   if(previous&&updated&&previous.updated>updated)continue;
   const {updatedAt,...content}=job,signature=JSON.stringify(content);
   if(previous?.signature===signature){previous.updated=Math.max(previous.updated,updated);continue;}
   known.set(job.id,{updated,signature});
   if(['planning','submitting','queued','running'].includes(job.status))pending.set(job.id,job);
   else pending.delete(job.id);
   changed.push(job);
  }
  if(changed.length)onJobs(changed);
 }

 function load() {
  if(stopped)return Promise.resolve([]);
  if(!loading)loading=(async()=>{
   const jobs=await fetchJobs();
   accept(jobs);discoverAt=now()+discoveryInterval;
   return jobs;
  })().finally(()=>{loading=null;});
  return loading;
 }

 function poll({discover=false}={}) {
  if(stopped)return Promise.resolve();
  if(polling)return polling;
  polling=(async()=>{
   let failure;
   if(discover||now()>=discoverAt)try{await load();}catch(error){failure=error;}
   const jobs=[...pending.values()];let index=0;
   async function worker(){
    while(!stopped&&index<jobs.length){
     const job=pending.get(jobs[index++].id);if(!job)continue;
     try{accept([await syncJob(job)]);}catch(error){failure??=error;}
    }
   }
   await Promise.all(Array.from({length:Math.min(concurrency,jobs.length)},worker));
   if(failure&&!stopped)onError(failure);
  })().finally(()=>{polling=null;});
  return polling;
 }

 return {accept,load,poll,nextDelay:interval=>pending.size?interval:Math.max(interval,discoverAt-now()),destroy:()=>{stopped=true;pending.clear();known.clear();}};
}

// One timer per task family, asleep when hidden, restored when browser Back uses bfcache.
export function observeTaskPolling(poller,{page=document,host=window,interval=12000,schedule=setTimeout,cancel=clearTimeout}={}) {
 let timer=null,active=false,suspended=false,destroyed=false;
 const clear=()=>{if(timer!==null)cancel(timer);timer=null;};
 function wake(){
  clear();
  if(active&&!suspended&&!destroyed&&!page.hidden)timer=schedule(()=>run(),poller.nextDelay(interval));
 }
 async function run(discover=false){
  clear();if(!active||suspended||destroyed||page.hidden)return;
  try{await poller.poll({discover});}finally{wake();}
 }
 function visible(){if(active){if(page.hidden)clear();else run(true);}}
 function hide(event){suspended=true;clear();if(!event.persisted)destroy();}
 function show(event){if(event.persisted&&!destroyed){suspended=false;run(true);}}
 function destroy(){destroyed=true;active=false;clear();poller.destroy();page.removeEventListener('visibilitychange',visible);host.removeEventListener('pagehide',hide);host.removeEventListener('pageshow',show);}
 page.addEventListener('visibilitychange',visible);host.addEventListener('pagehide',hide);host.addEventListener('pageshow',show);
 return {start:({immediate=true}={})=>{if(destroyed)return;active=true;return immediate?run(true):wake();},wake,destroy};
}
