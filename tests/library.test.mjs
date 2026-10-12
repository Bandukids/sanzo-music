import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import {readFile} from 'node:fs/promises';
import {handleLibrary} from '../server/library.mjs';
import {mergeState} from '../dist/state-merge.js';
import {build} from 'esbuild';
test('账号、手动用户管理、版本冲突、素材读取与账号隔离',async()=>{
 const bundle=await build({entryPoints:['worker/index.js'],bundle:true,format:'esm',platform:'browser',write:false});
 const runtime=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2025-10-01',d1Databases:['DB'],r2Buckets:['BUCKET']});
 try{
  const DB=await runtime.getD1Database('DB'),BUCKET=await runtime.getR2Bucket('BUCKET'),env={DB,BUCKET};
  const sql=await readFile(new URL('../drizzle/0000_deep_preak.sql',import.meta.url),'utf8');await DB.batch(sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>DB.prepare(s)));
  const request=(path,user='alice',options={})=>new Request('https://sanzo.test'+path,{...options,headers:{...(user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}:{}),...options.headers}});
  const call=(path,user,options={})=>runtime.dispatchFetch('https://sanzo.test'+path,{...options,headers:{...(user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}:{}),...options.headers}});
  const put=(data,revision)=>({method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({data,revision})});
  assert.equal((await call('/api/account',null)).status,401);
  assert.equal((await call('/api/account','alice')).status,200);
  assert.equal((await call('/api/account','alice',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({name:'夜晚电台'})})).status,200);
  assert.equal((await (await call('/api/account','alice')).json()).profile.name,'夜晚电台');
  assert.equal((await call('/api/state/workspace','alice',put({drafts:[{id:'first',title:'第一首'}]},0))).status,200);
  assert.equal((await call('/api/state/workspace','alice',put({drafts:[]},0))).status,409);
  assert.equal((await (await call('/api/state/workspace','bob')).json()).data,null);
  assert.equal((await call('/api/state/workspace','alice',{...put({},1),headers:{'content-type':'application/json',origin:'https://hostile.test'}})).status,403);
  assert.equal((await call('/api/state/workspace','alice',{method:'PUT',headers:{'content-type':'application/json'},body:'{'})).status,400);
  assert.equal((await call('/api/state/workspace','alice',put({workspaces:Array.from({length:21},(_,i)=>({id:String(i)}))},1))).status,400);
  assert.equal((await call('/api/state/workspace','alice',put({workspaces:[{id:'speech',name:'Speech',fixed:true},...Array.from({length:20},(_,i)=>({id:String(i)}))]},1))).status,200);
  assert.equal((await call('/api/state/uploads','alice',put({items:[{id:'music-u',name:'我的伴奏',trashed:true}]},0))).status,200);
  assert.equal((await (await call('/api/state/uploads','bob')).json()).data,null);
  assert.equal((await call('/api/state/uploads','alice',put({items:[{id:'bad',name:'x',trashed:'wrong'}]},1))).status,400);
  for(const kind of ['upload-music','upload-speech']){
   assert.equal((await call('/api/assets/'+kind,'upload-owner',{method:'PUT',headers:{'content-length':'3','x-file-name':'upload.mp3','x-asset-kind':kind},body:new Uint8Array([73,68,51])})).status,201);
   assert.equal((await call('/api/assets/'+kind,'bob')).status,404);
  }
  const uploadedAssets=(await (await call('/api/assets','upload-owner')).json()).assets;assert.ok(uploadedAssets.some(a=>a.kind==='upload-music'));assert.ok(uploadedAssets.some(a=>a.kind==='upload-speech'));
  const abc='X:1\nT:测试乐谱\nM:4/4\nL:1/4\nK:C\nC D E F|G A B c|';
  const abcUpload=text=>({method:'PUT',headers:{'content-length':String(Buffer.byteLength(text)),'x-file-name':'score.abc','x-asset-kind':'upload-abc'},body:text});
  assert.equal((await call('/api/assets/abc-one','upload-owner',abcUpload(abc))).status,201);
  const abcResponse=await call('/api/assets/abc-one','upload-owner');assert.equal(abcResponse.headers.get('content-type'),'text/plain; charset=utf-8');assert.equal(await abcResponse.text(),abc);
  assert.equal((await call('/api/assets/abc-one','bob')).status,404);
  assert.ok((await (await call('/api/assets','upload-owner')).json()).assets.some(a=>a.id==='abc-one'&&a.kind==='upload-abc'));
  assert.equal((await call('/api/assets/abc-invalid','upload-owner',abcUpload('<html>not a score</html>'))).status,400);
  assert.equal((await call('/api/assets/abc-large','upload-owner',abcUpload('x'.repeat(200001)))).status,413);
  assert.equal((await handleLibrary(request('/api/assets/abc-mismatch','upload-owner',{...abcUpload(abc),headers:{...abcUpload(abc).headers,'content-length':'1'}}),env)).status,400);
  assert.equal((await call('/api/assets/abc-wrong-kind','upload-owner',{...abcUpload(abc),headers:{...abcUpload(abc).headers,'x-asset-kind':'upload-speech'}})).status,400);
  assert.equal((await call('/api/assets/upload-music','bob',{method:'DELETE'})).status,404);
  assert.equal((await call('/api/assets/upload-music','upload-owner',{method:'DELETE'})).status,409);
  const usedBefore=(await (await call('/api/account','upload-owner')).json()).storage.used;
  assert.equal((await call('/api/state/uploads','upload-owner',put({items:[{id:'upload-music',trashed:true}]},0))).status,200);
  assert.equal((await call('/api/assets/upload-music','upload-owner',{method:'DELETE'})).status,200);
  assert.equal((await call('/api/assets/upload-music','upload-owner')).status,404);
  assert.equal((await call('/api/assets/upload-music','upload-owner',{method:'DELETE'})).status,404);
  assert.equal((await (await call('/api/account','upload-owner')).json()).storage.used,usedBefore-3);
  assert.equal((await call('/api/assets/upload-speech','upload-owner')).status,200);
  const person={id:'creator-1',name:'内测创作者',email:'creator@example.test',notes:'喜欢爵士',status:'active',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  assert.equal((await call('/api/state/people',null)).status,401);
  assert.equal((await call('/api/state/people','alice',put({users:[person]},0))).status,200);
  assert.deepEqual((await (await call('/api/state/people','alice')).json()).data.users,[person]);
  assert.equal((await (await call('/api/state/people','bob')).json()).data,null);
  assert.equal((await call('/api/state/people','alice',put({users:[{...person,status:'admin'}]},1))).status,400);
  assert.equal((await call('/api/state/people','alice',put({users:[person,person]},1))).status,400);
  assert.equal((await call('/api/state/people','alice',put({users:[{...person,name:'',email:'invalid'}]},1))).status,400);
  assert.equal((await call('/api/state/people','alice',put({users:[{...person,name:'新的昵称',status:'inactive'}]},1))).status,200);
  assert.equal((await call('/api/state/people','alice',put({users:[person]},1))).status,409);
  const savedPerson=(await (await call('/api/state/people','alice')).json()).data.users[0];assert.equal(savedPerson.status,'inactive');assert.equal(savedPerson.name,'新的昵称');assert.equal(savedPerson.id,person.id);
  const body=new Uint8Array([82,73,70,70,10,20,30,40]);const upload={method:'PUT',headers:{'content-length':String(body.length),'x-file-name':encodeURIComponent('测试.wav')},body};
  assert.equal((await call('/api/assets/audio-one','alice',upload)).status,201);
  assert.equal((await call('/api/assets/audio-one','alice',upload)).status,200);
  assert.deepEqual(new Uint8Array(await (await call('/api/assets/audio-one','alice')).arrayBuffer()),body);
  assert.equal((await call('/api/assets/audio-one','bob')).status,404);
  const partial=await call('/api/assets/audio-one','alice',{headers:{range:'bytes=2-4'}});assert.equal(partial.status,206);assert.equal(partial.headers.get('content-range'),'bytes 2-4/8');assert.deepEqual(new Uint8Array(await partial.arrayBuffer()),body.slice(2,5));
  // Browser media requests use open-ended/suffix ranges; also test the Node RPC bridge.
  for(const invoke of [options=>call('/api/assets/audio-one','alice',options),options=>handleLibrary(request('/api/assets/audio-one','alice',options),env)]){
   const full=await invoke({});assert.equal(full.status,200);assert.equal(full.headers.get('content-range'),null);assert.deepEqual(new Uint8Array(await full.arrayBuffer()),body);
   const head=await invoke({method:'HEAD',headers:{range:'bytes=2-4'}});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),'8');assert.equal((await head.arrayBuffer()).byteLength,0);
   for(const [range,start,end] of [['bytes=0-',0,8],['bytes=2-',2,8],['bytes=-3',5,8],['bytes=2-999',2,8],['bytes=0-0',0,1]]){
    const response=await invoke({headers:{range}});assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes ${start}-${end-1}/8`);assert.equal(response.headers.get('content-length'),String(end-start));assert.deepEqual(new Uint8Array(await response.arrayBuffer()),body.slice(start,end));
   }
   for(const range of ['bytes=8-','bytes=5-2','bytes=-0','bytes=-','bytes=0-1,3-4','bytes=9007199254740992-'])assert.equal((await invoke({headers:{range}})).status,416);
  }
  assert.equal((await (await call('/api/account','alice')).json()).storage.used,8);
  assert.equal((await call('/api/assets/bad','alice',{...upload,headers:{...upload.headers,'x-file-name':'file.html'}})).status,400);
  const failing={DB,BUCKET:{put:async()=>{throw Error('simulated');},delete:async()=>{}}};
  assert.equal((await handleLibrary(request('/api/assets/failure','alice',upload),failing)).status,503);
  assert.equal((await (await call('/api/account','alice')).json()).storage.used,8);
 }finally{await runtime.dispose();}
});
test('不同记录的并发编辑合并，同一字段冲突保留两边',()=>{
 const base={drafts:[{id:'a',title:'old'}],liked:['blue']};
 const local={drafts:[{id:'a',title:'new'}],liked:['blue']};
 const remote={drafts:[{id:'a',title:'old'},{id:'b',title:'remote'}],liked:['blue','jazz']};
 assert.deepEqual(mergeState(base,local,remote),{drafts:[{id:'a',title:'new'},{id:'b',title:'remote'}],liked:['blue','jazz']});
 assert.throws(()=>mergeState(base,local,{drafts:[{id:'a',title:'other'}],liked:['blue']}),/另一页面/);
});
