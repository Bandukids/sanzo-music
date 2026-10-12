import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { readdir,readFile } from 'node:fs/promises';
import { handleReleases } from '../server/releases.mjs';
import { handleLibrary } from '../server/library.mjs';
import { handleGenerations } from '../server/generations.mjs';

test('单曲发布、浏览、真实音频范围读取、撤回与账号隔离',async()=>{
 const runtime=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2025-10-01',d1Databases:['DB'],r2Buckets:['BUCKET']});
 try{
  const env={DB:await runtime.getD1Database('DB'),BUCKET:await runtime.getR2Bucket('BUCKET')};
  for(const name of (await readdir(new URL('../drizzle',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){
   const sql=await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8');await env.DB.batch(sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>env.DB.prepare(s)));
  }
  const id='00000000-0000-4000-8000-000000000001',queued='00000000-0000-4000-8000-000000000002',bytes=new Uint8Array([73,68,51,4,0,0,0,0,0,0]);
  const req=(path,method='GET',user='alice',extra={})=>new Request('https://sanzo.test/api/releases'+path,{method,headers:{...(user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}:{}),...extra}});
  for(const user of ['alice','bob'])await handleLibrary(new Request('https://sanzo.test/api/account',{headers:{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}}),env);
  await env.DB.prepare('INSERT INTO assets (id,owner,object_key,name,mime,bytes,kind,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind('song','alice','test/song','song.mp3','audio/mpeg',bytes.length,'music','ready',new Date().toISOString()).run();await env.BUCKET.put('test/song',bytes);
  const input={model:'ace-step',title:'星河来信',lyrics:'[Verse]\n星光落在信纸上',styles:'dream pop, piano',duration:135,routingAttempts:[{provider:'cn'}]};
  for(const [job,status]of[[id,'succeeded'],[queued,'queued']])await env.DB.prepare('INSERT INTO generations (id,owner,request_key,provider,input,status,asset_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(job,'alice',job,'cn',JSON.stringify(input),status,'song',new Date().toISOString(),new Date().toISOString()).run();
  assert.equal((await handleReleases(req('/'+id+'/audio'),env)).status,404);
  assert.equal((await handleReleases(req('/'+id,'POST',null),env)).status,401);
  assert.equal((await handleReleases(req('/'+id,'POST','bob'),env)).status,404);
  assert.equal((await handleReleases(req('/'+id,'POST','alice',{origin:'https://other.test'}),env)).status,403);
  assert.equal((await handleReleases(req('/'+queued,'POST'),env)).status,404);
  const published=await (await handleReleases(req('/'+id,'POST'),env)).json();assert.equal(published.published,true);assert.equal(published.track.title,'星河来信');assert.equal(published.track.isMine,true);
  await handleReleases(req('/'+id,'POST'),env);
  const list=await (await handleReleases(req('','GET','bob'),env)).json();assert.equal(list.tracks.length,1);assert.equal(list.tracks[0].isMine,false);assert.equal(list.tracks[0].owner,undefined);assert.equal(list.tracks[0].provider,undefined);assert.equal(list.tracks[0].routingAttempts,undefined);
  const jobs=await (await handleGenerations(new Request('https://sanzo.test/api/generations',{headers:{'oai-authenticated-user-id':'alice','oai-authenticated-user-email':'alice@example.test'}}),env)).json();assert.equal(jobs.jobs.find(j=>j.id===id).published,true);
  const full=await handleReleases(req('/'+id+'/audio','GET','bob'),env);assert.deepEqual(new Uint8Array(await full.arrayBuffer()),bytes);
  const part=await handleReleases(req('/'+id+'/audio','GET','bob',{range:'bytes=2-4'}),env);assert.equal(part.status,206);assert.deepEqual(new Uint8Array(await part.arrayBuffer()),bytes.slice(2,5));
  assert.equal((await handleReleases(req('/'+id+'/audio','HEAD',null),env)).headers.get('Content-Length'),'10');
  assert.equal((await handleReleases(req('/'+id+'/audio','GET','bob',{range:'bytes=100-'}),env)).status,416);
  await handleReleases(req('/'+id,'DELETE','bob'),env);assert.equal((await (await handleReleases(req(''),env)).json()).tracks.length,1);
  await handleReleases(req('/'+id,'DELETE'),env);assert.equal((await (await handleReleases(req(''),env)).json()).tracks.length,0);assert.equal((await handleReleases(req('/'+id+'/audio'),env)).status,404);
  assert.ok(await env.BUCKET.head('test/song'));assert.equal((await env.DB.prepare('SELECT status FROM generations WHERE id=?').bind(id).first()).status,'succeeded');
 }finally{await runtime.dispose();}
});
