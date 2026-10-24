import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import http from 'node:http';
import {initializeMedia} from '../server/file-bucket.mjs';
import {selfHostedStorage} from '../server/self-hosted-storage.mjs';
import {handleAuth,createInvite,sessionUser} from '../server/auth.mjs';
import {createApp} from '../server/http-app.mjs';
import {createOperations} from '../server/operations.mjs';
const password='registration-test-only-password';
async function fixture(t){const root=await mkdtemp(resolve(tmpdir(),'sanzo-registration-')),media=root+'/media',marker=await initializeMedia(media),env=await selfHostedStorage({DATA_DIR:root+'/data',MEDIA_ROOT:media,MEDIA_STORAGE_ID:marker});env.PUBLIC_REGISTRATION='true';env.OPS=createOperations(env);t.after(async()=>{await env.runtime.dispose();await rm(root,{recursive:true,force:true});});return env;}
const auth=(env,path,body,headers={})=>handleAuth(new Request('https://sanzo.test/api/auth/'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://sanzo.test',...headers},body:JSON.stringify(body)}),env,null,{client:'shared-exhibition-network'});
const register=(env,email,extra={})=>auth(env,'register',{email,password,...extra});

test('public registration is explicitly configurable and never exposes configuration secrets',async t=>{
 const env=await fixture(t);env.PUBLIC_REGISTRATION='false';env.DEEPSEEK_API_KEY='private-key-not-for-public-options';
 const options=()=>handleAuth(new Request('https://sanzo.test/api/auth/options'),env,null);
 assert.deepEqual(await (await options()).json(),{registrationOpen:false});assert.equal((await register(env,'closed@example.test')).status,403);assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n,0);
 env.PUBLIC_REGISTRATION='true';assert.deepEqual(await (await options()).json(),{registrationOpen:true});assert.equal((await register(env,'open@example.test')).status,201);
});

test('new users receive a hashed password, an automatic session and exactly 1 GiB with ordinary permissions',async t=>{
 const env=await fixture(t),response=await register(env,'  New.User@Example.Test  ',{name:' 展会用户 '});assert.equal(response.status,201);
 const cookie=response.headers.get('set-cookie');for(const flag of ['HttpOnly','Secure','SameSite=Strict'])assert.ok(cookie.includes(flag));
 const user=await sessionUser(new Request('https://sanzo.test/api/account',{headers:{Cookie:cookie.split(';')[0]}}),env.DB);assert.equal(user.role,'user');assert.equal(user.email,'new.user@example.test');assert.equal(user.name,'展会用户');
 const account=await env.DB.prepare('SELECT * FROM auth_accounts WHERE user_id=?').bind(user.id).first();assert.equal(account.enabled,1);assert.equal(account.quota_bytes,1073741824);assert.match(account.password_hash,/^scrypt\$/);assert.ok(!account.password_hash.includes(password));
 assert.ok(!(await env.DB.prepare('SELECT token_hash FROM auth_sessions').first()).token_hash.includes(cookie.split('=')[1].split(';')[0]));
 const login=await auth(env,'login',{email:'NEW.USER@EXAMPLE.TEST',password});assert.equal(login.status,200);
 const event=await env.DB.prepare("SELECT * FROM ops_events WHERE action='register'").first();assert.equal(event.actor_id,user.id);assert.ok(!JSON.stringify(event).includes(password));
});

test('concurrent duplicate registration is atomic and never takes over invited, disabled or administrator accounts',async t=>{
 const env=await fixture(t),responses=await Promise.all(Array.from({length:5},(_,index)=>register(env,index%2?'RACE@example.test':'race@example.test')));
 assert.equal(responses.filter(response=>response.status===201).length,1);assert.equal(responses.filter(response=>response.status===409).length,4);assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n,1);assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_accounts').first()).n,1);
 for(const role of ['admin','user']){const email=role+'-reserved@example.test',invite=await createInvite(env.DB,email,{role});const before=await env.DB.prepare('SELECT * FROM auth_accounts WHERE user_id=?').bind(invite.userId).first();assert.equal((await register(env,email)).status,409);assert.deepEqual(await env.DB.prepare('SELECT * FROM auth_accounts WHERE user_id=?').bind(invite.userId).first(),before);assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_invites WHERE user_id=?').bind(invite.userId).first()).n,1);}
 await env.DB.prepare("UPDATE auth_accounts SET enabled=0 WHERE email='race@example.test'").run();assert.equal((await register(env,'race@example.test')).status,409);
});

test('registration rejects malformed input, role/quota injection and cross-origin requests without creating users',async t=>{
 const env=await fixture(t);
 for(const body of [null,[],{},'string',{email:'bad',password},{email:'a@example.test',password:'short'},{email:'a@example.test',password:'x'.repeat(257)},{email:'a@example.test',password,name:' '},{email:'a@example.test',password,role:'admin'},{email:'a@example.test',password,quota_bytes:999999999999}])assert.equal((await auth(env,'register',body)).status,400);
 assert.equal((await auth(env,'register',{email:'cross@example.test',password},{Origin:'https://evil.test'})).status,403);assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n,0);
});

test('exhibition users sharing one proxy can sign up and log in without the old ten-request lockout',async t=>{
 const env=await fixture(t);
 for(let index=0;index<12;index++){const email='visitor-'+index+'@example.test';assert.equal((await register(env,email)).status,201,'register visitor '+index);assert.equal((await auth(env,'login',{email,password})).status,200,'login visitor '+index);}
 const email='visitor-0@example.test',key='login:email:'+createHash('sha256').update(email).digest('hex');await env.DB.prepare('INSERT INTO auth_attempts(client,count,expires_at) VALUES(?,10,?)').bind(key,Date.now()+900000).run();
 assert.equal((await auth(env,'login',{email,password})).status,429);assert.equal((await auth(env,'login',{email:'visitor-1@example.test',password})).status,200);
 await env.DB.prepare("UPDATE auth_attempts SET count=500 WHERE client='register:network:shared-exhibition-network'").run();assert.equal((await register(env,'flood@example.test')).status,429);assert.equal(await env.DB.prepare("SELECT user_id FROM auth_accounts WHERE email='flood@example.test'").first(),null);
});

test('a publicly registered session can access creation APIs but cannot access administration',async t=>{
 const env=await fixture(t),app=createApp(env,{origin:'https://sanzo.test',root:resolve('dist')});app.listen(0,'127.0.0.1');await once(app,'listening');t.after(()=>new Promise(resolve=>{app.close(resolve);app.closeAllConnections();}));
 const call=(path,options={})=>new Promise((resolve,reject)=>{const request=http.request('http://127.0.0.1:'+app.address().port+path,{method:options.method||'GET',headers:{Host:'sanzo.test',...options.headers}},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers:response.headers})));});request.on('error',reject);request.end(options.body);});
 const response=await call('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://sanzo.test'},body:JSON.stringify({email:'visitor@example.test',password})});assert.equal(response.status,201);const Cookie=response.headers.get('set-cookie').split(';')[0];
 assert.equal((await call('/api/auth/session',{headers:{Cookie}})).status,200);assert.equal((await call('/api/generations',{headers:{Cookie}})).status,200);assert.equal((await call('/api/assets',{headers:{Cookie}})).status,200);
 assert.equal((await call('/api/admin/users',{headers:{Cookie}})).status,403);assert.equal((await call('/admin/',{headers:{Cookie}})).status,403);assert.equal((await call('/api/generations')).status,401);
 const profile=await (await call('/api/account',{headers:{Cookie}})).json();assert.equal(profile.storage.limit,1073741824);assert.equal(profile.storage.used,0);
});
