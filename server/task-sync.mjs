import {handleGenerations} from './generations.mjs';
import {handleCovers} from './covers.mjs';
export async function syncPending(env,{fetcher=fetch}={}){
 await env.BUCKET.check();
 const jobs=(await env.DB.prepare("SELECT g.id,g.owner,u.email,'generations' AS kind FROM generations g JOIN users u ON u.id=g.owner WHERE g.status IN ('queued','running') AND g.task_id IS NOT NULL UNION ALL SELECT c.id,c.owner,u.email,'covers' AS kind FROM covers c JOIN users u ON u.id=c.owner WHERE c.status IN ('queued','running') AND c.task_id IS NOT NULL LIMIT 12").all()).results;
 let index=0;
 await Promise.all(Array.from({length:Math.min(jobs.length,2)},async()=>{while(index<jobs.length){const job=jobs[index++];const request=new Request('https://sanzo.internal/api/'+job.kind+'/'+job.id+'/sync',{method:'POST',headers:{'oai-authenticated-user-id':job.owner,'oai-authenticated-user-email':job.email}});await (job.kind==='generations'?handleGenerations:handleCovers)(request,env,fetcher);}}));
 return jobs.length;
}
export function startTaskSync(env){
 let running=null,stopped=false;
 const tick=()=>{if(stopped||running)return;running=syncPending(env).catch(()=>{}).finally(()=>{running=null;});};
 const initial=setTimeout(tick,1000),timer=setInterval(tick,30000);initial.unref();timer.unref();
 return async()=>{stopped=true;clearTimeout(initial);clearInterval(timer);await running;};
}
