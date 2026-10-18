import {handleGenerations} from './generations.mjs';
import {handleCovers} from './covers.mjs';
import {createOperations} from './operations.mjs';
export async function syncPending(env,{fetcher=fetch}={}){
 const ops=env.OPS||createOperations(env),before=ops?await ops.taskSnapshot():[];
 await env.BUCKET.check();
 const jobs=(await env.DB.prepare("SELECT g.id,g.owner,u.email,'generations' AS kind FROM generations g JOIN users u ON u.id=g.owner WHERE g.status IN ('queued','running') AND g.task_id IS NOT NULL UNION ALL SELECT c.id,c.owner,u.email,'covers' AS kind FROM covers c JOIN users u ON u.id=c.owner WHERE c.status IN ('queued','running') AND c.task_id IS NOT NULL LIMIT 12").all()).results;
 let index=0;
 await Promise.all(Array.from({length:Math.min(jobs.length,2)},async()=>{while(index<jobs.length){const job=jobs[index++];const request=new Request('https://sanzo.internal/api/'+job.kind+'/'+job.id+'/sync',{method:'POST',headers:{'oai-authenticated-user-id':job.owner,'oai-authenticated-user-email':job.email}});await (job.kind==='generations'?handleGenerations:handleCovers)(request,env,ops?ops.instrumentFetch({actorId:job.owner,resourceId:job.id},fetcher):fetcher);}}));
 if(ops)await ops.observeTasks(before).catch(()=>{});
 return jobs.length;
}
export function startTaskSync(env){
 const ops=env.OPS||createOperations(env);if(ops)ops.runtime.sync.enabled=true;
 let running=null,stopped=false;
 const tick=()=>{if(stopped||running)return;const started=performance.now();if(ops)Object.assign(ops.runtime.sync,{running:true,lastStartedAt:new Date().toISOString()});running=syncPending(env).then(async count=>{if(ops){const recovered=ops.runtime.sync.lastError;Object.assign(ops.runtime.sync,{processed:count,lastError:null});if(recovered)await ops.record({category:'system',action:'task_sync_recovered',message:'后台任务同步已恢复。'});}}).catch(async error=>{if(ops){ops.runtime.sync.lastError=error.code==='STORAGE_OFFLINE'?'NAS 不可用，任务同步暂缓。':'后台任务同步失败。';await ops.record({level:'error',category:'system',action:'task_sync_failed',code:error.cause?.code||error.code||error.name,message:ops.runtime.sync.lastError,coalesce:true});}else console.error('后台任务同步失败。');}).finally(()=>{running=null;if(ops)Object.assign(ops.runtime.sync,{running:false,lastFinishedAt:new Date().toISOString(),durationMs:Math.round(performance.now()-started)});});};
 const initial=setTimeout(tick,1000),timer=setInterval(tick,30000);initial.unref();timer.unref();
 return async()=>{stopped=true;clearTimeout(initial);clearInterval(timer);await running;if(ops)ops.runtime.sync.enabled=false;};
}
