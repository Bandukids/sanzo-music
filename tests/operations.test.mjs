import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rename,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {once} from 'node:events';
import http from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {initializeMedia} from '../server/file-bucket.mjs';
import {selfHostedStorage} from '../server/self-hosted-storage.mjs';
import {createInvite} from '../server/auth.mjs';
import {createOperations,handleOperations} from '../server/operations.mjs';
import {createApp} from '../server/http-app.mjs';
import {startTaskSync} from '../server/task-sync.mjs';
import {renderTasks,renderEvents,date} from '../dist/admin-view.js';
import {backupStorage,restoreStorage} from '../server/backup.mjs';
import {backupStatePayload} from '../server/backup-state.mjs';

async function fixture(t){
 const root=await mkdtemp(resolve(tmpdir(),'sanzo-ops-')),media=root+'/media',data=root+'/data',backup=root+'/backup';await mkdir(backup);
 const marker=await initializeMedia(media),config={DATA_DIR:data,MEDIA_ROOT:media,MEDIA_STORAGE_ID:marker,BACKUP_STATUS_DIR:backup,DEEPSEEK_API_KEY:'private-deepseek-key-for-test-only',RUNNINGHUB_CN_API_KEY:'private-runninghub-key-for-test-only'};
 const storage=await selfHostedStorage(config),env={...config,...storage};env.OPS=createOperations(env);
 const adminInvite=await createInvite(env.DB,'admin@ops.test',{role:'admin'}),member=await createInvite(env.DB,'member@ops.test');
 const admin={id:adminInvite.userId,role:'admin',email:'admin@ops.test'},user={id:member.userId,role:'user',email:'member@ops.test'};
 t.after(async()=>{await storage.runtime.dispose();await rm(root,{recursive:true,force:true});});return {root,media,data,backup,config,env,admin,user};
}
const call=(env,user,path)=>handleOperations(new Request('https://sanzo.test/api/admin/operations/'+path),env,user);
async function generation(env,owner,{status='succeeded',error=null,daysAgo=0,title='测试作品',model='yue2'}={}){
 const id=crypto.randomUUID(),now=new Date(Date.now()-daysAgo*86400000).toISOString();
 await env.DB.prepare('INSERT INTO generations(id,owner,request_key,provider,input,task_id,status,error,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,owner,id,'cn',JSON.stringify({title,model,lyrics:'private-original-lyrics',description:'private-prompt-material'}),'1234567890123456789',status,error,now,now).run();return id;
}
async function session(env,user){const token=randomBytes(32).toString('base64url');await env.DB.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').bind(createHash('sha256').update(token).digest('hex'),user.id,Date.now()+3600000).run();return 'sanzo_session='+token;}
async function serve(t,env,fetchImpl){const app=createApp(env,{origin:'https://sanzo.test',root:resolve('dist'),fetchImpl});app.listen(0,'127.0.0.1');await once(app,'listening');t.after(()=>new Promise(resolve=>{app.close(resolve);app.closeAllConnections();}));return (path,options={})=>new Promise((resolve,reject)=>{const req=http.request('http://127.0.0.1:'+app.address().port+path,{method:options.method||'GET',headers:{Host:'sanzo.test',...options.headers}},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));});req.on('error',reject);req.end(options.body);});}

test('admin-only operations APIs and pages reject guest, ordinary and forged identities',async t=>{
 const {env,admin,user}=await fixture(t),request=await serve(t,env),cookie=await session(env,admin),member=await session(env,user);
 for(const route of ['overview','tasks','events','export']){
  assert.equal((await request('/api/admin/operations/'+route)).status,403);
  assert.equal((await request('/api/admin/operations/'+route,{headers:{Cookie:member}})).status,403);
  assert.equal((await request('/api/admin/operations/'+route,{headers:{'oai-authenticated-user-id':admin.id,'oai-authenticated-user-email':admin.email}})).status,403);
  const response=await request('/api/admin/operations/'+route,{headers:{Cookie:cookie}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 }
 assert.equal((await request('/admin/')).status,302);assert.equal((await request('/admin/',{headers:{Cookie:member}})).status,403);assert.equal((await request('/admin/',{headers:{Cookie:cookie}})).status,200);
 for(const path of ['/%61dmin/','/admin%2Findex.html']){assert.equal((await request(path)).status,302);assert.equal((await request(path,{headers:{Cookie:member}})).status,403);}
 assert.equal((await request('/api/admin/operations/events?limit=10000',{headers:{Cookie:cookie}})).status,400);
 assert.equal((await request('/api/admin/operations/events?days=foo',{headers:{Cookie:cookie}})).status,400);
 assert.equal((await request('/api/admin/operations/events',{method:'DELETE',headers:{Cookie:cookie}})).status,405);
});

test('operational records are durable, deduplicated, redacted and bounded by retention',async t=>{
 const {env,admin,config,root}=await fixture(t);
 const event={level:'error',category:'system',action:'network_failed',actorId:admin.id,coalesce:true,message:'key='+config.DEEPSEEK_API_KEY+' Bearer abcdefghijklmnop https://private.test/audio?token=secret',password:'do-not-save',lyrics:'private-original-lyrics'};
 await env.OPS.record(event);await env.OPS.record(event);
 const second=await selfHostedStorage(config);try{const row=await second.DB.prepare('SELECT * FROM ops_events').first();assert.equal(row.repeat_count,2);assert.ok(!JSON.stringify(row).includes(config.DEEPSEEK_API_KEY));assert.ok(!JSON.stringify(row).includes('abcdefghijklmnop'));assert.ok(!JSON.stringify(row).includes('private.test'));assert.ok(!JSON.stringify(row).includes('private-original-lyrics'));assert.ok(!JSON.stringify(row).includes('do-not-save'));}finally{await second.runtime.dispose();}
 await backupStorage(env,root+'/snapshot');const restored=await restoreStorage(root+'/snapshot',{dataDir:root+'/restored-data',mediaRoot:root+'/restored-media'});
 const copy=await selfHostedStorage({DATA_DIR:root+'/restored-data',MEDIA_ROOT:root+'/restored-media',MEDIA_STORAGE_ID:restored.storageId});try{assert.equal((await copy.DB.prepare('SELECT repeat_count FROM ops_events').first()).repeat_count,2);}finally{await copy.runtime.dispose();}
 const snapshot=await (await call(env,admin,'export')).json();assert.ok(snapshot.overview.recordingStartedAt);assert.ok(!JSON.stringify(snapshot).includes(config.RUNNINGHUB_CN_API_KEY));
 const {env:other}=await fixture(t);other.DB.raw.exec(`INSERT INTO ops_events(created_at,last_seen_at,level,category,action,message,repeat_key) VALUES('2000-01-01','2000-01-01','error','system','old','expired','old');
 WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<50003)
 INSERT INTO ops_events(created_at,last_seen_at,level,category,action,message,repeat_key) SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'info','system','fixture','fixture','row-'||x FROM n;`);
 await other.OPS.record({category:'system',action:'retention_check',message:'保留检查。'});
 assert.equal((await other.DB.prepare('SELECT COUNT(*) AS n FROM ops_events').first()).n,50000);assert.equal(await other.DB.prepare("SELECT id FROM ops_events WHERE action='old'").first(),null);
});

test('provider instrumentation preserves responses, records actual usage and never repeats a request',async t=>{
 const {env,admin}=await fixture(t);let requests=0;
 const success={usage:{prompt_tokens:25,completion_tokens:12},choices:[{message:{content:'private-generated-lyrics'}}]};
 const tracked=env.OPS.instrumentFetch({actorId:admin.id,requestId:'correlation-id'},async()=>{requests++;return Response.json(success);});
 const response=await tracked('https://api.deepseek.com/chat/completions',{method:'POST',body:JSON.stringify({model:'deepseek-flash',messages:[{content:'private-prompt-material'}]})});assert.deepEqual(await response.json(),success);assert.equal(requests,1);
 const failing=env.OPS.instrumentFetch({actorId:admin.id},async()=>{requests++;return Response.json({error:{message:env.DEEPSEEK_API_KEY+' private-generated-lyrics'}},{status:402});});await failing('https://api.deepseek.com/chat/completions');assert.equal(requests,2);
 const unavailable=env.OPS.instrumentFetch({},async()=>{requests++;throw Object.assign(Error('network '+env.DEEPSEEK_API_KEY),{cause:{code:'EAI_AGAIN'}});});await assert.rejects(unavailable('https://www.runninghub.cn/task/openapi/ai-app/run'));assert.equal(requests,3);
 const pending=env.OPS.instrumentFetch({},async()=>Response.json({code:804}));await pending('https://www.runninghub.cn/task/openapi/outputs');
 const rows=(await env.DB.prepare('SELECT * FROM ops_events ORDER BY id').all()).results;assert.equal(rows.length,3);assert.equal(rows[0].prompt_tokens,25);assert.equal(rows[0].completion_tokens,12);assert.equal(rows[0].request_id,'correlation-id');assert.equal(rows[1].level,'error');assert.equal(rows[1].status,402);assert.equal(rows[2].code,'EAI_AGAIN');
 const serialized=JSON.stringify(rows);for(const secret of [env.DEEPSEEK_API_KEY,'private-generated-lyrics','private-prompt-material'])assert.ok(!serialized.includes(secret));
});

test('existing task history supports ownership/status/time filters without exposing creative inputs',async t=>{
 const {env,admin,user}=await fixture(t);await generation(env,admin.id);const failed=await generation(env,user.id,{status:'failed',error:'provider '+env.RUNNINGHUB_CN_API_KEY+' https://secret.test/output',title:'<img src=x onerror=alert(1)>'});await generation(env,user.id,{status:'unknown'});await generation(env,user.id,{daysAgo:35,status:'failed'});
 const overview=await (await call(env,admin,'overview?days=7')).json();assert.equal(overview.counts.reduce((sum,row)=>sum+row.count,0),3);assert.equal(overview.issues,2);
 const issues=await (await call(env,admin,'tasks?status=issues&actor='+user.id)).json();assert.equal(issues.total,2);assert.ok(issues.items.some(task=>task.id===failed));assert.equal(issues.items[0].owner,user.id);
 const dump=JSON.stringify(issues);for(const secret of [env.RUNNINGHUB_CN_API_KEY,'private-original-lyrics','private-prompt-material','secret.test'])assert.ok(!dump.includes(secret));
 const page=await (await call(env,admin,'tasks?status=issues&limit=1&offset=1')).json();assert.equal(page.items.length,1);assert.equal(page.total,2);
 const html=renderTasks(issues.items);assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;img'));
 const events=renderEvents([{id:1,last_seen_at:new Date().toISOString(),repeat_count:1,level:'error',category:'system',action:'request_exception',message:'<script>bad()</script>',actor_name:'<svg onload=x>',status:503,duration_ms:1,code:'oops',prompt_tokens:null}]);assert.ok(!events.includes('<script>'));assert.ok(!events.includes('<svg onload'));assert.equal(date('invalid'),'暂无记录');
});

test('NAS disconnection and backup failures remain visible in the admin dashboard',async t=>{
 const {env,admin,media,backup}=await fixture(t);
 await writeFile(backup+'/schedule-status.json',JSON.stringify({status:'success',lastSuccess:new Date().toISOString(),files:51,bytes:1234,target:'/private/path/snapshot-001'}));
 let result=await (await call(env,admin,'overview?fresh=1')).json();assert.equal(result.health.nas.status,'ok');assert.equal(result.health.backup.status,'ok');assert.equal(result.health.backup.snapshot,'snapshot-001');assert.ok(!JSON.stringify(result).includes('/private/path'));
 await writeFile(backup+'/last-backup.json',JSON.stringify({createdAt:new Date().toISOString(),files:53,bytes:5678,target:'/private/path/manual-002'}));result=await (await call(env,admin,'overview?fresh=1')).json();assert.equal(result.health.backup.files,51);assert.equal(result.health.backup.snapshot,'snapshot-001');assert.equal(result.health.backup.latestBackup.files,53);assert.equal(result.health.backup.latestBackup.snapshot,'manual-002');
 await rename(media,media+'-offline');try{result=await (await call(env,admin,'overview?fresh=1')).json();assert.equal(result.health.nas.status,'error');}finally{await rename(media+'-offline',media);}
 await writeFile(backup+'/schedule-status.json',JSON.stringify({status:'failed',lastSuccess:new Date(Date.now()-31*3600000).toISOString(),lastError:'NAS '+env.DEEPSEEK_API_KEY,nextAttemptAt:new Date().toISOString(),consecutiveFailures:2}));
 result=await (await call(env,admin,'overview?fresh=1')).json();assert.equal(result.health.nas.status,'ok');assert.equal(result.health.backup.status,'error');assert.ok(!JSON.stringify(result).includes(env.DEEPSEEK_API_KEY));
 await writeFile(backup+'/schedule-status.json','broken');assert.equal((await env.OPS.backupStatus()).status,'error');
});

test('real HTTP AI calls are logged with the session identity and HTTP errors are correlated',async t=>{
 const {env,admin}=await fixture(t);let failed=false;
 const request=await serve(t,env,async()=>failed?Response.json({error:{message:'private-provider-detail'}},{status:402}):Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{finish_reason:'stop',message:{content:JSON.stringify({text:'在雨后的街角，写一首温暖的歌。'})}}]})),cookie=await session(env,admin);
 const options={method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json',Origin:'https://sanzo.test'},body:JSON.stringify({action:'inspire',kind:'songs',text:'private-prompt-material'})};
 assert.equal((await request('/api/assistant',options)).status,200);failed=true;const response=await request('/api/assistant',options);assert.equal(response.status,503);assert.ok(response.headers.get('x-request-id'));
 const rows=(await env.DB.prepare('SELECT * FROM ops_events ORDER BY id').all()).results;assert.ok(rows.some(row=>row.category==='provider'&&row.actor_id===admin.id&&row.prompt_tokens===10));assert.ok(rows.some(row=>row.action==='assistant_post'&&row.request_id===response.headers.get('x-request-id')&&row.code==='BALANCE'));
 assert.ok(!JSON.stringify(rows).includes('private-prompt-material'));assert.ok(!JSON.stringify(rows).includes('private-provider-detail'));
});

test('the host backup bridge exposes only selected metadata and detects a stale publication',async t=>{
 const {env}=await fixture(t);delete env.BACKUP_STATUS_DIR;
 const now=new Date(),schedule={status:'success',lastSuccess:now.toISOString(),files:12,bytes:100,target:'/host/private/snapshot-one',password:'never-copy',privateConfig:{key:'not-a-status-field'}},payload=backupStatePayload(schedule,{createdAt:now.toISOString(),files:14,bytes:200,target:'/host/private/snapshot-two'});
 assert.equal(payload.schedule.target,'snapshot-one');assert.equal(payload.latest.target,'snapshot-two');assert.ok(!JSON.stringify(payload).includes('never-copy'));assert.ok(!JSON.stringify(payload).includes('/host/private'));assert.ok(!JSON.stringify(payload).includes('privateConfig'));
 await env.DB.prepare("INSERT INTO auth_settings(name,value) VALUES('ops_backup_status',?)").bind(JSON.stringify(payload)).run();let status=await env.OPS.backupStatus();assert.equal(status.status,'ok');assert.equal(status.files,12);assert.equal(status.latestBackup.files,14);
 payload.publishedAt=new Date(Date.now()-36*60000).toISOString();await env.DB.prepare("UPDATE auth_settings SET value=? WHERE name='ops_backup_status'").bind(JSON.stringify(payload)).run();status=await env.OPS.backupStatus();assert.equal(status.status,'warn');assert.match(status.message,/35 分钟/);
});

test('background synchronization records an outage and recovery instead of silently swallowing it',async t=>{
 const {env}=await fixture(t),check=env.BUCKET.check.bind(env.BUCKET);env.BUCKET.check=async()=>{throw Object.assign(Error('offline'),{code:'STORAGE_OFFLINE'});};
 const until=async predicate=>{const end=Date.now()+4000;while(!predicate()){if(Date.now()>end)throw Error('Background condition timed out');await new Promise(resolve=>setTimeout(resolve,20));}};
 let stop=startTaskSync(env);try{await until(()=>Boolean(env.OPS.runtime.sync.lastError));await stop();env.BUCKET.check=check;stop=startTaskSync(env);await until(()=>env.OPS.runtime.sync.lastFinishedAt&&!env.OPS.runtime.sync.lastError);await stop();}finally{await stop();}
 const rows=(await env.DB.prepare("SELECT action FROM ops_events WHERE category='system'").all()).results;assert.ok(rows.some(row=>row.action==='task_sync_failed'));assert.ok(rows.some(row=>row.action==='task_sync_recovered'));
});

test('task transitions record failures and fallback outcomes once, while audit failure does not fail ordinary actions',async t=>{
 const {env,admin}=await fixture(t),before=await env.OPS.taskSnapshot();
 const id=await generation(env,admin.id,{status:'queued'});await env.OPS.observeTasks(before,admin.id);
 const queued=await env.OPS.taskSnapshot();await env.DB.prepare("UPDATE generations SET status='failed',error=? WHERE id=?").bind('failed '+env.DEEPSEEK_API_KEY,id).run();await env.OPS.observeTasks(queued,admin.id);
 const failed=await env.OPS.taskSnapshot();await env.OPS.observeTasks(failed,admin.id);
 const events=(await env.DB.prepare("SELECT * FROM ops_events WHERE category='task'").all()).results;assert.equal(events.length,2);assert.equal(events[1].level,'error');assert.equal(events[1].resource_id,id);assert.ok(!events[1].message.includes(env.DEEPSEEK_API_KEY));
 const request=await serve(t,env),cookie=await session(env,admin),originalError=console.error,errors=[];console.error=message=>errors.push(message);
 try{env.DB.raw.exec('DROP TABLE ops_events');const response=await request('/api/account',{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json',Origin:'https://sanzo.test'},body:JSON.stringify({name:'正常保存'})});assert.equal(response.status,200);assert.ok(env.OPS.runtime.lastAuditError);assert.ok(errors.some(error=>error.includes('OPS_WRITE_FAILED')));}finally{console.error=originalError;}
});
