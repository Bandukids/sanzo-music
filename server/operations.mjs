import {randomUUID,createHash} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {resolve,basename} from 'node:path';

const DAY=86400000,instances=new WeakMap();
const categories=new Set(['request','auth','admin','provider','task','system']);
const levels=new Set(['info','warn','error']);
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const fail=(message,status=400)=>json({error:{message}},status);
const integer=value=>value!==null&&value!==undefined&&Number.isSafeInteger(Number(value))&&Number(value)>=0&&Number(value)<=1e12?Number(value):null;
const tasksSQL=`SELECT 'generation' AS kind,g.id,g.owner,g.provider,g.status,g.error,g.task_id,g.created_at,g.updated_at,
 CASE WHEN json_valid(g.input) THEN json_extract(g.input,'$.title') ELSE '' END AS title,
 CASE WHEN json_valid(g.input) THEN json_extract(g.input,'$.model') ELSE '' END AS model
 FROM generations g UNION ALL
 SELECT 'cover',c.id,c.owner,c.provider,c.status,c.error,c.task_id,NULL,c.updated_at,
 CASE WHEN c.target_type='album' THEN '专辑封面' ELSE '单曲封面' END,'image' FROM covers c`;

// Keep only explicitly selected fields. Never serialize request/response bodies,
// prompts, lyrics, headers, cookies, invitation links or environment objects.
export function redactOperationalText(value,env={}) {
 let text=String(value??'');
 for(const [name,secret] of Object.entries(env))if(/(?:KEY|TOKEN|SECRET|PASSWORD)$/i.test(name)&&typeof secret==='string'&&secret.length>=8)text=text.split(secret).join('[已隐藏]');
 return text.replace(/https?:\/\/[^\s<>"']+/gi,'[地址已隐藏]')
  .replace(/\bBearer\s+[^\s,;]+/gi,'Bearer [已隐藏]')
  .replace(/\bsk-[a-z0-9_-]{12,}/gi,'[已隐藏]')
  .replace(/\b[a-f0-9]{32,}\b/gi,'[已隐藏]')
  .replace(/((?:api[_-]?key|password|token|authorization|cookie)\s*[=:]\s*)[^\s,;]+/gi,'$1[已隐藏]')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').slice(0,600);
}
const errorCode=error=>String(error?.cause?.code||error?.code||error?.name||'INTERNAL').replace(/[^a-z0-9_-]/gi,'').slice(0,60);
function providerOperation(url) {
 if(url.hostname==='api.deepseek.com')return {provider:'deepseek',action:'text_completion',poll:false};
 const provider=/^(?:www\.)?runninghub\.cn$/.test(url.hostname)?'cn':/^(?:www\.)?runninghub\.ai$/.test(url.hostname)?'ai':null;
 if(!provider)return null;
 const poll=/\/(?:query|outputs|status)$/.test(url.pathname);
 return {provider,action:poll?'task_query':/\/upload/.test(url.pathname)?'reference_upload':/\/run$/.test(url.pathname)?'task_submit':'service_request',poll};
}
const providerFailure=status=>status===401||status===403?'AI 服务拒绝凭据，请检查对应服务的密钥权限。':status===402?'AI 服务余额不足。':status===429?'AI 服务限流或并发已满。':status>=500?'AI 服务返回服务器错误。':'AI 服务拒绝请求，请结合返回码核对服务端任务记录。';

export function createOperations(env) {
 if(env.OPS)return env.OPS;
 if(!env.SELF_HOSTED||!env.DB?.selfHosted)return null;
 if(instances.has(env.DB))return instances.get(env.DB);
 const DB=env.DB,clean=value=>redactOperationalText(value,env);
 const runtime={startedAt:new Date().toISOString(),sync:{enabled:false,running:false,lastStartedAt:null,lastFinishedAt:null,lastError:null,processed:0},lastAuditError:null};
 void DB.prepare("INSERT INTO auth_settings(name,value) VALUES('ops_recording_started',?) ON CONFLICT(name) DO NOTHING").bind(runtime.startedAt).run().catch(()=>{runtime.lastAuditError='运行记录开始时间暂时无法保存。';});
 let lastPruned=0,healthCache=null,healthUntil=0,healthPending=null;
 const queryFailures=new Set();
 async function record(event) {
  try {
   const now=new Date().toISOString(),level=levels.has(event.level)?event.level:'info',category=categories.has(event.category)?event.category:'system';
   const action=clean(event.action||'unknown').slice(0,80),message=clean(event.message||action);
   const actor=event.actorId?clean(event.actorId).slice(0,120):null,resource=event.resourceId?clean(event.resourceId).slice(0,120):null;
   const repeatKey=event.coalesce?createHash('sha256').update(JSON.stringify([category,action,actor,resource,level,event.provider,event.code,message,Math.floor(Date.now()/300000)])).digest('hex'):randomUUID();
   await DB.prepare(`INSERT INTO ops_events(created_at,last_seen_at,level,category,action,actor_id,resource_id,request_id,provider,model,status,duration_ms,code,message,prompt_tokens,completion_tokens,repeat_key)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(repeat_key) DO UPDATE SET last_seen_at=excluded.last_seen_at,repeat_count=ops_events.repeat_count+1,duration_ms=excluded.duration_ms`)
    .bind(now,now,level,category,action,actor,resource,event.requestId?clean(event.requestId).slice(0,60):null,event.provider?clean(event.provider).slice(0,30):null,event.model?clean(event.model).slice(0,80):null,integer(event.status),integer(event.durationMs),event.code?clean(event.code).slice(0,80):null,message,integer(event.promptTokens),integer(event.completionTokens),repeatKey).run();
   runtime.lastAuditError=null;
   const overLimit=(await DB.prepare('SELECT COUNT(*) AS n FROM ops_events').first()).n>50000;
   if(overLimit||Date.now()-lastPruned>600000){lastPruned=Date.now();await DB.batch([
    DB.prepare('DELETE FROM ops_events WHERE last_seen_at<?').bind(new Date(Date.now()-90*DAY).toISOString()),
    DB.prepare('DELETE FROM ops_events WHERE id IN (SELECT id FROM ops_events ORDER BY last_seen_at DESC,id DESC LIMIT -1 OFFSET 50000)')
   ]);}
  } catch {runtime.lastAuditError='运行记录暂时无法写入。';console.error(JSON.stringify({level:'error',code:'OPS_WRITE_FAILED'}));}
 }
 function instrumentFetch(context={},fetcher=fetch) {
  return async(input,init={})=>{
   let operation;try{operation=providerOperation(new URL(typeof input==='string'||input instanceof URL?input:input.url));}catch{}
   if(!operation)return fetcher(input,init);
   const started=performance.now();let model=null;
   if(operation.provider==='deepseek'&&typeof init.body==='string'){try{const body=JSON.parse(init.body);if(typeof body.model==='string')model=body.model;}catch{}}
   const base={category:'provider',action:operation.action,actorId:context.actorId,resourceId:context.resourceId,requestId:context.requestId,provider:operation.provider,model};
   try {
    const response=await fetcher(input,init);
    let code=null,promptTokens=null,completionTokens=null,rejected=!response.ok;
    // Read a bounded clone only for small JSON API responses; never inspect media.
    if(/json/i.test(response.headers.get('content-type')||'')||operation.provider==='deepseek'){
     const clone=response.clone();let timer;
     try {
      const data=await Promise.race([(async()=>{const reader=clone.body?.getReader();if(!reader)return null;const chunks=[];let bytes=0;try{while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>1048576){void reader.cancel();return null;}chunks.push(next.value);}return JSON.parse(Buffer.concat(chunks).toString());}finally{reader.releaseLock();}})(),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),1500);})]);
      if(data){code=typeof data.code==='number'||typeof data.code==='string'?String(data.code).slice(0,50):null;
       if(operation.provider!=='deepseek'&&code!==null&&!['0','200','804','805'].includes(code))rejected=true;
       promptTokens=integer(data.usage?.prompt_tokens);completionTokens=integer(data.usage?.completion_tokens);
      }
     } catch {} finally {clearTimeout(timer);}
    }
    const recovered=operation.poll&&!rejected&&queryFailures.delete(operation.provider);
    if(operation.poll&&rejected)queryFailures.add(operation.provider);
    if(!operation.poll||rejected||recovered)await record({...base,level:rejected?'error':'info',status:response.status,durationMs:Math.round(performance.now()-started),code,promptTokens,completionTokens,coalesce:operation.poll&&rejected,message:rejected?providerFailure(response.status):recovered?'AI 服务查询连接已恢复。':operation.action==='task_submit'?'已收到生成服务的提交响应；是否取得任务编号请查看任务状态。':operation.action==='reference_upload'?'参考素材已上传到生成服务。':operation.action==='text_completion'?'文本 AI 调用完成。':'AI 服务请求完成。'});
    return response;
   } catch(error) {
    if(operation.poll)queryFailures.add(operation.provider);
    await record({...base,level:'error',durationMs:Math.round(performance.now()-started),code:errorCode(error),coalesce:operation.poll,message:'无法连接 AI 服务或请求超时；请检查网络、DNS 与供应商状态。'});throw error;
   }
  };
 }
 async function taskSnapshot(owner=null) {
  return (await DB.prepare('SELECT * FROM ('+tasksSQL+')'+(owner?' WHERE owner=?':'')+" ORDER BY status IN ('planning','submitting','queued','running') DESC,updated_at DESC LIMIT 200").bind(...(owner?[owner]:[])).all()).results;
 }
 async function observeTasks(before,owner=null,context={}) {
  const previous=new Map(before.map(task=>[task.kind+':'+task.id,task]));
  for(const task of await taskSnapshot(owner)){
   const old=previous.get(task.kind+':'+task.id);
   if(old&&old.status===task.status&&old.error===task.error)continue;
   const issue=task.status==='failed'||task.status==='unknown',warning=task.status==='fallback'||Boolean(task.error);
   await record({category:'task',action:task.kind==='cover'?'cover_status':'generation_status',level:issue?'error':warning?'warn':'info',actorId:task.owner,resourceId:task.id,requestId:context.requestId,provider:task.provider,model:task.model,code:task.status,message:(task.kind==='cover'?'封面任务':'音频任务')+'：'+task.status+(task.error?'；'+clean(task.error):''),coalesce:true});
  }
 }
 async function recordHttp(context,response) {
  const {path,method,actorId,requestId,started}=context,status=response.status;
  if(path.startsWith('/api/auth/session')||status===401&&['GET','HEAD'].includes(method)&&!path.startsWith('/api/admin/'))return;
  const adminDenied=status===403&&(path.startsWith('/api/admin/')||/^\/admin(?:\/|$)/.test(path));
  const failed=status>=500||status>=400&&path.startsWith('/api/')&&method!=='GET'||adminDenied;
  const mutation=!['GET','HEAD'].includes(method)&&!/^\/api\/(?:auth|admin)\//.test(path);
  if(!failed&&!mutation)return;
  const area=path==='/healthz'?'health':/^\/admin(?:\/|$)/.test(path)?'admin':/^\/api\/(assistant|generations|covers|assets|state|account|releases|auth|admin)(?:\/|$)/.exec(path)?.[1]||'request';
  const names={assistant:'AI 写作',generations:'音频任务',covers:'封面任务',assets:'素材',state:'工作区资料',account:'个人资料',releases:'作品发布',auth:'账号验证',admin:'后台管理',health:'服务健康',request:'服务请求'};
  const sync=/\/sync$/.test(path);if(sync&&!failed)return;
  let code=null;if(status>=400&&/json/.test(response.headers.get('content-type')||'')){try{const result=await response.clone().json();code=typeof result.error?.code==='string'?result.error.code:null;}catch{}}
  await record({category:adminDenied?'admin':'request',action:adminDenied?'access_denied':area+'_'+(sync?'sync':method.toLowerCase()),actorId,requestId,resourceId:/\/[a-f0-9-]{36}(?:\/|$)/.exec(path)?.[0].split('/')[1],level:status>=500?'error':status>=400?'warn':'info',status,code,durationMs:Math.round(performance.now()-started),coalesce:failed||area==='state',message:adminDenied?'非管理员尝试访问后台管理。':names[area]+(failed?'请求未完成，HTTP '+status:'操作完成。')});
 }
 async function backupStatus() {
  async function read(name){try{const file=resolve(env.BACKUP_STATUS_DIR,name),info=await stat(file);if(info.size>131072)throw Error('Too large');return JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  try {
   let schedule,latest,publishedAt=null;
   if(env.BACKUP_STATUS_DIR)[schedule,latest]=await Promise.all([read('schedule-status.json'),read('last-backup.json')]);
   else{const stored=await DB.prepare("SELECT value FROM auth_settings WHERE name='ops_backup_status'").first();if(!stored)return {status:'unavailable',message:'尚未收到宿主机备份状态。'};const data=JSON.parse(stored.value);if(data.version!==1)throw Error('Invalid state');({schedule,latest,publishedAt}=data);}
   if(!schedule&&!latest)return {status:'unavailable',message:'尚无备份状态记录。'};
   const lastSuccess=schedule?.lastSuccess||latest?.createdAt||null;
   const stale=!lastSuccess||!Number.isFinite(Date.parse(lastSuccess))||Date.now()-Date.parse(lastSuccess)>30*3600000;
   const feedStale=publishedAt&&(!Number.isFinite(Date.parse(publishedAt))||Date.now()-Date.parse(publishedAt)>35*60000);
   const warning=schedule?.retention?.warning||latest?.retention?.warning||(feedStale?'备份状态超过 35 分钟没有更新，请检查宿主机计划任务。':null);
   const successful=schedule?.lastSuccess?schedule:latest;
   return {status:schedule?.status==='failed'?'error':stale||warning||schedule?.status==='deferred'?'warn':'ok',publishedAt,scheduleStatus:clean(schedule?.status||'unknown'),lastAttempt:schedule?.lastAttempt||null,lastSuccess,finishedAt:schedule?.finishedAt||latest?.createdAt||null,nextAttemptAt:schedule?.nextAttemptAt||null,consecutiveFailures:integer(schedule?.consecutiveFailures)||0,files:integer(successful?.files),bytes:integer(successful?.bytes),snapshot:successful?.target?basename(successful.target):null,latestBackup:latest?{createdAt:latest.createdAt||null,files:integer(latest.files),bytes:integer(latest.bytes),snapshot:latest.target?basename(latest.target):null}:null,message:clean(schedule?.lastError||warning||(stale?'超过 30 小时没有成功备份，请检查计划任务。':'每日北京时间 04:00；失败后每 15 分钟重试。'))};
  } catch{return {status:'error',message:'无法读取宿主机备份状态文件。'};}
 }
 async function health(fresh=false) {
  if(!fresh&&healthCache&&Date.now()<healthUntil)return {...healthCache,sync:{...runtime.sync},backup:await backupStatus(),auditError:runtime.lastAuditError};
  if(healthPending)return healthPending;
  healthPending=(async()=>{
   let database={status:'ok'},nas={status:'ok',message:'媒体存储可用。'};
   try{await DB.prepare('SELECT 1').first();const info=await stat(DB.filename);database.bytes=info.size;const wal=await stat(DB.filename+'-wal').catch(()=>null);database.walBytes=wal?.size||0;}catch{database={status:'error',message:'数据库检查失败。'};}
   try{await env.BUCKET.check();}catch{nas={status:'error',message:'NAS 不可用，上传和生成会被阻止；请检查挂载与网络。'};}
   healthCache={checkedAt:new Date().toISOString(),application:{status:'ok',startedAt:runtime.startedAt,uptimeSeconds:Math.round(process.uptime()),memoryBytes:process.memoryUsage().rss},database,nas};healthUntil=Date.now()+10000;
   return {...healthCache,sync:{...runtime.sync},backup:await backupStatus(),auditError:runtime.lastAuditError};
  })().finally(()=>{healthPending=null;});
  return healthPending;
 }
 const ops={record,recordHttp,instrumentFetch,taskSnapshot,observeTasks,health,backupStatus,runtime,clean};instances.set(DB,ops);return ops;
}

function filters(url) {
 const days=Number(url.searchParams.get('days')||7),limit=Number(url.searchParams.get('limit')||30),offset=Number(url.searchParams.get('offset')||0),actor=url.searchParams.get('actor')||'';
 if(![1,7,30,90].includes(days)||!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>50000||actor.length>120)throw Error('筛选参数无效。');
 const level=url.searchParams.get('level')||'',category=url.searchParams.get('category')||'',status=url.searchParams.get('status')||'';
 if(level&&!levels.has(level)||category&&!categories.has(category)||status&&!['active','issues','succeeded','failed','unknown','fallback'].includes(status))throw Error('筛选参数无效。');
 return {days,limit,offset,actor,level,category,status,since:new Date(Date.now()-days*DAY).toISOString()};
}
const taskFilter=f=>({where:'COALESCE(t.created_at,t.updated_at)>=?'+(f.actor?' AND t.owner=?':'')+(f.status==='active'?" AND t.status IN ('planning','submitting','queued','running')":f.status==='issues'?" AND (t.status IN ('failed','unknown','fallback') OR t.error IS NOT NULL)":f.status?' AND t.status=?':''),values:[f.since,...(f.actor?[f.actor]:[]),...(f.status&&!['active','issues'].includes(f.status)?[f.status]:[])]});
const eventFilter=f=>({where:'e.last_seen_at>=?'+(f.actor?' AND e.actor_id=?':'')+(f.level?' AND e.level=?':'')+(f.category?' AND e.category=?':''),values:[f.since,...(f.actor?[f.actor]:[]),...(f.level?[f.level]:[]),...(f.category?[f.category]:[])]});

export async function handleOperations(request,env,user) {
 if(user?.role!=='admin')return fail('需要管理员权限。',403);
 if(request.method!=='GET')return fail('此入口只支持查询。',405);
 const ops=env.OPS||createOperations(env);if(!ops)return fail('此工具仅适用于自托管服务。',503);
 const DB=env.DB,url=new URL(request.url);let f;
 try{f=filters(url);}catch(error){return fail(error.message);}
 const one=(sql,values=[])=>DB.prepare(sql).bind(...values).first(),all=async(sql,values=[]) =>(await DB.prepare(sql).bind(...values).all()).results;
 async function tasks(limit=f.limit,offset=f.offset){const q=taskFilter(f);const rows=await all('SELECT t.*,u.name AS actor_name,u.email AS actor_email FROM ('+tasksSQL+') t LEFT JOIN users u ON u.id=t.owner WHERE '+q.where+' ORDER BY t.updated_at DESC,t.id LIMIT ? OFFSET ?',[...q.values,limit,offset]);return {items:rows.map(row=>({kind:row.kind,id:row.id,owner:row.owner,actorName:ops.clean(row.actor_name),actorEmail:ops.clean(row.actor_email),title:ops.clean(row.title||'未命名作品'),model:ops.clean(row.model),provider:ops.clean(row.provider),status:row.status,error:row.error?ops.clean(row.error):null,taskId:row.task_id?ops.clean(row.task_id):null,createdAt:row.created_at,updatedAt:row.updated_at})),total:(await one('SELECT COUNT(*) AS n FROM ('+tasksSQL+') t WHERE '+q.where,q.values)).n,limit,offset};}
 async function events(limit=f.limit,offset=f.offset){const q=eventFilter(f);return {items:(await all('SELECT e.id,e.created_at,e.last_seen_at,e.level,e.category,e.action,e.actor_id,e.resource_id,e.request_id,e.provider,e.model,e.status,e.duration_ms,e.code,e.message,e.prompt_tokens,e.completion_tokens,e.repeat_count,u.name AS actor_name,u.email AS actor_email FROM ops_events e LEFT JOIN users u ON u.id=e.actor_id WHERE '+q.where+' ORDER BY e.last_seen_at DESC,e.id DESC LIMIT ? OFFSET ?',[...q.values,limit,offset])).map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,typeof value==='string'?ops.clean(value):value]))),total:(await one('SELECT COUNT(*) AS n FROM ops_events e WHERE '+q.where,q.values)).n,limit,offset};}
 async function overview(){
  const q=taskFilter({...f,status:''}),ev=eventFilter({...f,level:'',category:''});
  const counts=await all('SELECT t.status,t.kind,COUNT(*) AS count FROM ('+tasksSQL+') t WHERE '+q.where+' GROUP BY t.status,t.kind',q.values);
  const issues=await one('SELECT COUNT(*) AS n FROM ('+tasksSQL+') t WHERE '+q.where+" AND (t.status IN ('failed','unknown','fallback') OR t.error IS NOT NULL)",q.values);
  const activity=await one('SELECT COUNT(*) AS rows,COALESCE(SUM(repeat_count),0) AS events,COALESCE(SUM(CASE WHEN level=\'error\' THEN repeat_count ELSE 0 END),0) AS errors,COALESCE(SUM(CASE WHEN category=\'provider\' AND action!=\'task_query\' THEN 1 ELSE 0 END),0) AS aiCalls,COALESCE(SUM(prompt_tokens),0) AS promptTokens,COALESCE(SUM(completion_tokens),0) AS completionTokens FROM ops_events e WHERE '+ev.where,ev.values);
  const users=await all('SELECT a.user_id AS id,a.email,a.role,a.enabled,a.quota_bytes,u.name,u.bytes AS used FROM auth_accounts a JOIN users u ON u.id=a.user_id ORDER BY a.created_at');
  const trend=await all("SELECT date(COALESCE(t.created_at,t.updated_at),'+8 hours') AS day,COUNT(*) AS total,SUM(CASE WHEN status='succeeded' THEN 1 ELSE 0 END) AS succeeded,SUM(CASE WHEN status IN ('failed','unknown','fallback') OR error IS NOT NULL THEN 1 ELSE 0 END) AS issues FROM ("+tasksSQL+') t WHERE '+q.where+' GROUP BY day ORDER BY day',q.values);
  const providers=[];for(const [id,name,key] of [['deepseek','DeepSeek','DEEPSEEK_API_KEY'],['cn','RunningHub 中国站','RUNNINGHUB_CN_API_KEY'],['ai','RunningHub 国际站','RUNNINGHUB_AI_API_KEY']]){
   const latest=await one("SELECT level,status,code,last_seen_at FROM ops_events WHERE category='provider' AND provider=? ORDER BY last_seen_at DESC,id DESC LIMIT 1",[id]);
   providers.push({id,name,configured:Boolean(env[key]),latest});
  }
  const first=await one("SELECT value FROM auth_settings WHERE name='ops_recording_started'");
  return {generatedAt:new Date().toISOString(),days:f.days,counts,issues:issues.n,activity,users:users.map(row=>({...row,email:ops.clean(row.email),name:ops.clean(row.name)})),trend,providers,health:await ops.health(url.searchParams.get('fresh')==='1'),recordingStartedAt:first?.value||null,retention:{days:90,maxRows:50000},limits:{taskHistory:'音频按创建时间筛选，封面按最近更新时间筛选。',usage:'AI 调用仅统计接入日志后的实际接口请求；不等于收费次数或账单金额。'}};
 }
 try {
  const path=url.pathname;
  if(path==='/api/admin/operations/overview')return json(await overview());
  if(path==='/api/admin/operations/events')return json(await events());
  if(path==='/api/admin/operations/tasks')return json(await tasks());
  if(path==='/api/admin/operations/export'){
   await ops.record({category:'admin',action:'diagnostic_export',actorId:user.id,message:'管理员导出了筛选范围内的诊断记录。'});
   return json({exportedAt:new Date().toISOString(),filters:{days:f.days,actor:f.actor,level:f.level,category:f.category,status:f.status},overview:await overview(),events:await events(1000,0),tasks:await tasks(500,0),note:'最多导出 1000 条运行记录及 500 条任务；不包含密钥、会话、密码、歌词或提示词。'},200,{'Content-Disposition':'attachment; filename="sanzo-diagnostics-'+new Date().toISOString().slice(0,10)+'.json"'});
  }
  return fail('未找到此入口。',404);
 } catch(error){await ops.record({level:'error',category:'system',action:'operations_read',code:errorCode(error),message:'后台管理数据读取失败。',coalesce:true});return fail('后台管理数据暂时无法读取，请稍后重试。',503);}
}
