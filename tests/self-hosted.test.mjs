import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rename,readFile,writeFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {once} from 'node:events';
import http from 'node:http';
import {initializeMedia,FileBucket} from '../server/file-bucket.mjs';
import {selfHostedStorage} from '../server/self-hosted-storage.mjs';
import {DataStore} from '../server/data-store.mjs';
import {createInvite,handleAuth,sessionUser} from '../server/auth.mjs';
import {createApp} from '../server/http-app.mjs';
import {backupStorage,restoreStorage} from '../server/backup.mjs';
import {handleLibrary} from '../server/library.mjs';
import {repairStorage} from '../server/storage-repair.mjs';
import {handleGenerations} from '../server/generations.mjs';
import {syncPending} from '../server/task-sync.mjs';
import {handleReleases} from '../server/releases.mjs';

async function fixture(t){const root=await mkdtemp(resolve(tmpdir(),'sanzo-test-'));if(process.env.SANZO_TEST_ROOT)await mkdir(process.env.SANZO_TEST_ROOT,{recursive:true});const media=process.env.SANZO_TEST_ROOT?await mkdtemp(resolve(process.env.SANZO_TEST_ROOT,'media-test-')):root+'/media',data=root+'/data';const marker=await initializeMedia(media);const config={DATA_DIR:data,MEDIA_ROOT:media,MEDIA_STORAGE_ID:marker};const env=await selfHostedStorage(config);t.after(()=>env.runtime.dispose());return {root,media,data,marker,config,env};}
const password='test-only-long-password-2026';
async function enrolled(env,email,role='user'){
 const invite=await createInvite(env.DB,email,{role});const request=new Request('https://sanzo.test/api/auth/accept',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:invite.token,password})});assert.equal((await handleAuth(request,env,null)).status,200);return invite.userId;
}
async function login(env,email){const response=await handleAuth(new Request('https://sanzo.test/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})}),env,null);assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];}
function library(env,owner,path,options={}){return handleLibrary(new Request('https://sanzo.test'+path,{...options,headers:{'oai-authenticated-user-id':owner,'oai-authenticated-user-email':owner+'@test.local',...options.headers}}),env);}
const upload=bytes=>({method:'PUT',headers:{'Content-Length':String(bytes.length),'X-File-Name':'sample.mp3','X-Asset-Kind':'upload-music'},body:bytes});

test('native SQLite migrations, D1 batch rollback and restart preserve data',async t=>{
 const {config,env}=await fixture(t);const store=new DataStore(env.DB);await store.profile({id:'alice',email:'alice@test.local',name:'Alice'});
 await assert.rejects(env.DB.batch([env.DB.prepare('UPDATE users SET bytes=5 WHERE id=?').bind('alice'),env.DB.prepare('INSERT INTO missing_table VALUES (1)')]));assert.equal((await store.profile({id:'alice',email:'alice@test.local',name:'Alice'})).bytes,0);
 const second=await selfHostedStorage(config);try{assert.equal((await second.DB.prepare('SELECT name FROM users WHERE id=?').bind('alice').first()).name,'Alice');}finally{await second.runtime.dispose();}
});

test('single-use invitations, hashed passwords/sessions, disable and logout',async t=>{
 const {env}=await fixture(t);const invite=await createInvite(env.DB,'alice@example.test');
 const accept=()=>handleAuth(new Request('https://sanzo.test/api/auth/accept',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:invite.token,password})}),env,null);
 assert.equal((await accept()).status,200);assert.equal((await accept()).status,410);
 const account=await env.DB.prepare('SELECT * FROM auth_accounts').first();assert.match(account.password_hash,/^scrypt\$/);assert.ok(!account.password_hash.includes(password));
 const cookie=await login(env,'alice@example.test');const request=new Request('https://sanzo.test/api/account',{headers:{cookie}});assert.equal((await sessionUser(request,env.DB)).id,invite.userId);
 assert.notEqual((await env.DB.prepare('SELECT token_hash FROM auth_sessions').first()).token_hash,cookie.split('=')[1]);
 await env.DB.prepare('UPDATE auth_accounts SET enabled=0').run();assert.equal(await sessionUser(request,env.DB),null);await env.DB.prepare('UPDATE auth_accounts SET enabled=1').run();
 await handleAuth(new Request('https://sanzo.test/api/auth/logout',{method:'POST',headers:{cookie}}),env,await sessionUser(request,env.DB));assert.equal(await sessionUser(request,env.DB),null);
});

test('1 GiB quota boundary is atomic; trash retains bytes and permanent deletion releases them',async t=>{
 const {env}=await fixture(t);const owner=await enrolled(env,'quota@example.test');const store=new DataStore(env.DB);assert.equal(await env.DB.quota(owner),1073741824);
 await env.DB.prepare('UPDATE users SET bytes=? WHERE id=?').bind(1073741820,owner).run();
 const reservations=await Promise.all([store.reserve(owner,4),store.reserve(owner,4)]);assert.equal(reservations.filter(Boolean).length,1);assert.equal((await env.DB.prepare('SELECT bytes FROM users WHERE id=?').bind(owner).first()).bytes,1073741824);
 await env.DB.prepare('UPDATE users SET bytes=0 WHERE id=?').bind(owner).run();
 assert.equal((await library(env,owner,'/api/assets/one',upload(new Uint8Array([73,68,51,1])))).status,201);
 assert.equal((await library(env,owner,'/api/assets/one',{method:'DELETE'})).status,409);
 assert.equal((await library(env,owner,'/api/state/uploads',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:0,data:{items:[{id:'one',trashed:true}]}})})).status,200);
 assert.equal((await env.DB.prepare('SELECT bytes FROM users WHERE id=?').bind(owner).first()).bytes,4);
 assert.equal((await library(env,owner,'/api/assets/one',{method:'DELETE'})).status,200);assert.equal((await env.DB.prepare('SELECT bytes FROM users WHERE id=?').bind(owner).first()).bytes,0);
 await env.DB.prepare('UPDATE auth_accounts SET quota_bytes=3 WHERE user_id=?').bind(owner).run();assert.equal((await library(env,owner,'/api/assets/two',upload(new Uint8Array([73,68,51,1])))).status,413);
});

test('media ownership and byte ranges work with actual files, interrupted writes never become readable',async t=>{
 const {env}=await fixture(t);await new DataStore(env.DB).profile({id:'alice',email:'alice@test.local',name:'Alice'});
 assert.equal((await library(env,'alice','/api/assets/sample',upload(new Uint8Array([73,68,51,1,2])))).status,201);
 assert.equal((await library(env,'bob','/api/assets/sample')).status,404);
 const asset=await new DataStore(env.DB).asset('alice','sample');assert.deepEqual([...new Uint8Array(await (await env.BUCKET.get(asset.object_key)).arrayBuffer())],[73,68,51,1,2]);
 const response=await library(env,'alice','/api/assets/sample',{headers:{Range:'bytes=1-3'}});assert.equal(response.status,206);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[68,51,1]);
 const broken=new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1]));controller.error(Error('disconnected'));}});await assert.rejects(env.BUCKET.put('audio/broken',broken));assert.equal(await env.BUCKET.head('audio/broken'),null);assert.throws(()=>env.BUCKET.paths('../outside'));
});

test('native generation submission is idempotent and mocked result is saved with quota accounting',async t=>{
 const {env}=await fixture(t);const owner=await enrolled(env,'generation@example.test');env.RUNNINGHUB_CN_API_KEY='test-only-key';let submitted=0;
 const request=(path,body)=>new Request('https://sanzo.test/api/generations'+path,{method:'POST',headers:{'Content-Type':'application/json','oai-authenticated-user-id':owner,'oai-authenticated-user-email':'generation@example.test'},body:JSON.stringify(body)});
 const body={type:'speech',speechModel:'design',model:'qwen-voice-design',title:'音色设计',designText:'你好，欢迎来到 Sanzo。',voiceDescription:'低沉温暖的男声。',designVoice:'soft',requestKey:'native-generation-test-0001'};
 const upstream=async(url)=>{if(url.endsWith('/ai-app/run')){submitted++;return new Response(JSON.stringify({code:0,data:{taskId:'native-test-task'}}));}if(url.endsWith('/openapi/v2/query'))return new Response(JSON.stringify({status:'SUCCESS',results:[{nodeId:'17',url:'https://audio.example.test/voice.mp3',outputType:'mp3'}]}));if(url==='https://audio.example.test/voice.mp3')return new Response(new Uint8Array([73,68,51,0,1]));throw Error('Unexpected mocked request');};
 const first=await handleGenerations(request('',body),env,upstream);assert.equal(first.status,202);const {job}=await first.json();assert.equal(job.status,'queued');assert.equal((await handleGenerations(request('',body),env,upstream)).status,200);assert.equal(submitted,1);
 const synced=await handleGenerations(request('/'+job.id+'/sync',{}),env,upstream);assert.equal((await synced.json()).job.status,'succeeded');assert.equal((await env.DB.prepare('SELECT bytes FROM users WHERE id=?').bind(owner).first()).bytes,5);assert.equal((await library(env,owner,'/api/assets/music-'+job.id)).status,200);
 const next=await handleGenerations(request('',{...body,requestKey:'native-generation-test-0002'}),env,upstream);assert.equal(next.status,202);assert.equal(submitted,2);assert.equal(await syncPending(env,{fetcher:upstream}),1);assert.equal(submitted,2);assert.equal((await env.DB.prepare('SELECT bytes FROM users WHERE id=?').bind(owner).first()).bytes,10);
});

test('NAS disappearance and wrong mount marker fail closed; remount recovers original files',async t=>{
 const {env,media,marker}=await fixture(t);await env.BUCKET.put('audio/original',new Uint8Array([1,2,3]));
 await rename(media,media+'-disconnected');await assert.rejects(env.BUCKET.put('audio/new',new Uint8Array([4])),{code:'STORAGE_OFFLINE'});await assert.rejects(access(media));
 await mkdir(media);await writeFile(media+'/.sanzo-storage-id','wrong\n');await assert.rejects(env.BUCKET.check(),{code:'STORAGE_OFFLINE'});await rename(media,media+'-wrong');await rename(media+'-disconnected',media);
 assert.equal(await readFile(media+'/.sanzo-storage-id','utf8'),marker+'\n');assert.equal((await env.BUCKET.head('audio/original')).size,3);
});

test('restart repairs interrupted upload accounting only after media is available',async t=>{
 const {env,media}=await fixture(t);const owner=await enrolled(env,'repair@example.test');const store=new DataStore(env.DB);
 await store.reserve(owner,4);await store.startAsset(owner,'partial','audio/partial','partial.mp3','audio/mpeg',4,'upload-music');await env.BUCKET.put('audio/partial',new Uint8Array([73,68,51,1]));
 await rename(media,media+'-offline');await assert.rejects(repairStorage(env),{code:'STORAGE_OFFLINE'});assert.equal((await env.DB.prepare('SELECT bytes FROM users WHERE id=?').bind(owner).first()).bytes,4);
 await rename(media+'-offline',media);assert.equal((await repairStorage(env)).interruptedUploads,1);assert.equal((await env.DB.prepare('SELECT bytes FROM users WHERE id=?').bind(owner).first()).bytes,0);assert.equal(await env.BUCKET.head('audio/partial'),null);
 const now=new Date().toISOString();for(const [id,status,task] of [['planned','planning',null],['uncertain','submitting',null],['accepted','queued','existing-task']])await env.DB.prepare('INSERT INTO generations(id,owner,request_key,provider,input,status,task_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,owner,id,'cn','{}',status,task,now,now).run();
 await repairStorage(env);const states=(await env.DB.prepare('SELECT id,status FROM generations ORDER BY id').all()).results;assert.deepEqual(states,[{id:'accepted',status:'queued'},{id:'planned',status:'failed'},{id:'uncertain',status:'unknown'}]);
});

test('backup restores accounts, media and quota; rejects tampering and nonempty destinations',async t=>{
 const {env,root}=await fixture(t);const owner=await enrolled(env,'backup@example.test','admin');assert.equal((await library(env,owner,'/api/assets/backup-song',upload(new Uint8Array([73,68,51,7])))).status,201);
 await login(env,'backup@example.test');const result=await backupStorage(env,root+'/snapshot');assert.equal(result.files,1);
 const restored=await restoreStorage(root+'/snapshot',{dataDir:root+'/restored-db',mediaRoot:root+'/restored-media'});
 const copy=await selfHostedStorage({DATA_DIR:root+'/restored-db',MEDIA_ROOT:root+'/restored-media',MEDIA_STORAGE_ID:restored.storageId});
 try{assert.equal((await library(copy,owner,'/api/assets/backup-song')).status,200);assert.equal((await copy.DB.prepare('SELECT bytes FROM users WHERE id=?').bind(owner).first()).bytes,4);assert.equal((await copy.DB.prepare('SELECT COUNT(*) AS n FROM auth_sessions').first()).n,0);await login(copy,'backup@example.test');}finally{await copy.runtime.dispose();}
 await assert.rejects(restoreStorage(root+'/snapshot',{dataDir:root+'/restored-db',mediaRoot:root+'/other-media'}),/非空/);
 const manifest=JSON.parse(await readFile(root+'/snapshot/manifest.json','utf8'));const bucket=new FileBucket(root+'/snapshot/media',manifest.storageId);await writeFile(bucket.paths(manifest.assets[0].object_key).file,'xxxx');await assert.rejects(restoreStorage(root+'/snapshot',{dataDir:root+'/bad-db',mediaRoot:root+'/bad-media'}),/校验失败/);
});

test('HTTP login, forged identity rejection, admin authorization, HTTPS origin and offline generation gate',async t=>{
 const {env,media}=await fixture(t);const admin=await enrolled(env,'admin@example.test','admin'),user=await enrolled(env,'member@example.test');const cookie=await login(env,'admin@example.test'),memberCookie=await login(env,'member@example.test');
 const app=createApp(env,{origin:'https://sanzo.test',root:resolve('dist')});app.listen(0,'127.0.0.1');await once(app,'listening');t.after(()=>new Promise(r=>{app.close(r);app.closeAllConnections();}));
 const base='http://127.0.0.1:'+app.address().port;
 const call=(path,options={})=>new Promise((resolve,reject)=>{const req=http.request(base+path,{method:options.method||'GET',headers:{Host:'sanzo.test',...options.headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));});req.on('error',reject);req.end(options.body);});
 for(const path of ['/','/explore/','/create/','/studio/','/training/','/login/'])assert.equal((await call(path)).status,200,path);
 assert.equal((await call('/account/')).status,302);assert.equal((await call('/admin/')).status,302);
 for(const path of ['/api/assistant','/api/generations','/api/covers','/api/releases/'+crypto.randomUUID()])assert.equal((await call(path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401,path);
 assert.equal((await call('/api/releases')).status,200);
 const publicId=crypto.randomUUID(),publicBytes=new Uint8Array([73,68,51,9,8,7]);
 assert.equal((await library(env,admin,'/api/assets/published-song',upload(publicBytes))).status,201);
 const input={title:'Public song',model:'yue2',lyrics:'[Verse 1]\n原创歌词',styles:'indie pop',duration:60};
 await env.DB.prepare("INSERT INTO generations(id,owner,request_key,provider,input,status,asset_id,created_at,updated_at) VALUES(?,?,?,?,?,'succeeded',?,?,?)").bind(publicId,admin,'public-test-generation','cn',JSON.stringify(input),'published-song',new Date().toISOString(),new Date().toISOString()).run();
 assert.equal((await handleReleases(new Request('https://sanzo.test/api/releases/'+publicId,{method:'POST',headers:{'oai-authenticated-user-id':admin,'oai-authenticated-user-email':'admin@example.test'}}),env)).status,200);
 const catalogue=await (await call('/api/releases')).json();assert.equal(catalogue.tracks.length,1);assert.equal(catalogue.tracks[0].isMine,false);assert.equal(catalogue.tracks[0].model,'YUE2');
 const audio=await call('/api/releases/'+publicId+'/audio',{headers:{Range:'bytes=1-3'}});assert.equal(audio.status,206);assert.deepEqual([...new Uint8Array(await audio.arrayBuffer())],[68,51,9]);
 assert.equal((await call('/api/releases/'+publicId+'/audio',{method:'HEAD'})).status,200);
 assert.equal((await call('/api/releases/'+crypto.randomUUID()+'/audio')).status,404);
 assert.equal((await call('/api/assets/published-song')).status,401);
 assert.equal((await call('/api/releases/'+publicId,{method:'DELETE'})).status,401);
 assert.equal((await call('/api/account',{headers:{'oai-authenticated-user-id':admin,'oai-authenticated-user-email':'admin@example.test'}})).status,401);
 assert.equal((await call('/api/admin/users',{headers:{Cookie:memberCookie}})).status,403);
 const account=await call('/api/account',{headers:{Cookie:cookie}});assert.equal((await account.json()).profile.id,admin);
 const options={method:'PUT',headers:{Cookie:cookie,Origin:'https://sanzo.test','Content-Type':'application/json'},body:JSON.stringify({name:'管理员'})};assert.equal((await call('/api/account',options)).status,200);assert.equal((await call('/api/account',{...options,headers:{...options.headers,Origin:'https://evil.test'}})).status,403);
 await rename(media,media+'-offline');assert.equal((await call('/healthz')).status,503);assert.equal((await call('/api/generations',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'})).status,503);
 assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM generations').first()).n,1);await rename(media+'-offline',media);assert.equal((await call('/healthz')).status,200);
 const disabled=await call('/api/admin/users/'+user,{method:'PATCH',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({enabled:false})});assert.equal(disabled.status,200);assert.equal((await call('/api/account',{headers:{Cookie:memberCookie}})).status,401);
});
