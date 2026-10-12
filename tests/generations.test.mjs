import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { readdir, readFile } from 'node:fs/promises';
import { handleGenerations as generationHandler, musicInput, nodeInfoList, abcResult } from '../server/generations.mjs';
import { handleLibrary } from '../server/library.mjs';

const input={provider:'cn',model:'ace-step',title:'沿海回声',lyrics:'[Verse]\n风吹过港湾\n[Chorus]\n沿海回声',styles:'dream pop, piano, warm bass',duration:120,gender:'female',workspace:'default',requestKey:'test-submission-0001'};
const handleGenerations=(request,env,fetcher)=>generationHandler(request,env,(url,options)=>url==='https://api.deepseek.com/chat/completions'?response({choices:[{finish_reason:'stop',message:{content:JSON.stringify({duration:135,bpm:95})}}]}):fetcher(url,options));
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});

test('Cover 双站解析：节点 30 输入、31 ABC、34 歌词，结果保存与幂等重试',async()=>setup(async({env,request})=>{
 const bytes=new Uint8Array([73,68,51,4]);
 await handleLibrary(new Request('https://sanzo.test/api/account',{headers:{'oai-authenticated-user-id':'alice','oai-authenticated-user-email':'alice@example.test'}}),env);
 await env.BUCKET.put('cover-source',bytes);
 await env.DB.prepare("INSERT INTO assets (owner,id,object_key,name,mime,bytes,kind,status,created_at) VALUES ('alice','cover-source','cover-source','原曲.mp3','audio/mpeg',?,'upload-music','ready',?)").bind(bytes.length,new Date().toISOString()).run();
 for(const provider of ['cn','ai']){
  let uploads=0,runs=0,lyricsReady=false;const config={...env,DEEPSEEK_API_KEY:'',...(provider==='cn'?{RUNNINGHUB_AI_API_KEY:''}:{RUNNINGHUB_CN_API_KEY:''})};
  const body={model:'cover-inference',studioTool:'cover',type:'analysis',sourceAsset:'cover-source',requestKey:'cover-inference-'+provider+'-0001'};
  const upstream=async(url,options)=>{
   if(url.endsWith('/media/upload/binary')){uploads++;assert.equal(options.body.get('file').name,'原曲.mp3');return response({code:0,data:{fileName:'openapi/original.mp3'}});}
   if(url.endsWith('/ai-app/run')){runs++;const payload=JSON.parse(options.body);assert.equal(payload.webappId,provider==='cn'?'2107851228599382017':'2107851452228509697');assert.deepEqual(payload.nodeInfoList,[{nodeId:'30',fieldName:'audio',fieldValue:'openapi/original.mp3'}]);return response({code:0,data:{taskId:'analysis-'+provider}});}
   if(url.endsWith('/v2/query'))return response({status:'SUCCESS',results:[{nodeId:'23',text:'wrong output'},{nodeId:'31',url:'https://media.test/abc.md'},{nodeId:'34',url:'https://media.test/lyrics.md'}]});
   if(url==='https://media.test/abc.md')return new Response('```abc\nX:1\nT:原曲\nM:4/4\nK:C\nCDEF|\n```');
   assert.equal(url,'https://media.test/lyrics.md');assert.equal(options.redirect,'manual');return lyricsReady?new Response('```text\n[Verse]\n让音乐再次响起\n```'):new Response(null,{status:503});
  };
  const {job}=await(await generationHandler(request('',body),config,upstream)).json();assert.equal(job.status,'queued');assert.equal(job.input.sourceName,'原曲.mp3');assert.equal(job.input.sourceAudio,undefined);
  const {job:duplicate}=await(await generationHandler(request('',body),config,upstream)).json();assert.equal(job.id,duplicate.id);assert.equal(runs,1);assert.equal(uploads,1);
  const {job:partial}=await(await generationHandler(request('/'+job.id+'/sync',{}),config,upstream)).json();assert.match(partial.input.abcNotation,/K:C/);assert.equal(partial.status,'queued');assert.match(partial.error,/歌词/);
  lyricsReady=true;await config.DB.prepare('UPDATE generations SET checked_at=0 WHERE id=?').bind(job.id).run();
  const {job:done}=await(await generationHandler(request('/'+job.id+'/sync',{}),config,upstream)).json();assert.equal(done.status,'succeeded');assert.equal(done.input.inferredLyrics,'[Verse]\n让音乐再次响起');assert.equal(done.audioURL,null);assert.equal(done.assetId,null);assert.equal(runs,1);assert.equal(uploads,1);
  assert.equal((await generationHandler(request('/'+job.id,undefined,'bob'),config,upstream)).status,404);
  const {job:foreign}=await(await generationHandler(request('',{...body,requestKey:'cover-foreign-'+provider+'-0001'},'bob'),config,upstream)).json();assert.equal(foreign.status,'failed');assert.equal(runs,1);
 }
 await env.DB.prepare("INSERT INTO documents(owner,namespace,data,revision,updated_at) VALUES ('alice','uploads',?,1,?)").bind(JSON.stringify({items:[{id:'cover-source',trashed:true}]}),new Date().toISOString()).run();
 const {job:trashed}=await(await generationHandler(request('',{model:'cover-inference',studioTool:'cover',type:'analysis',sourceAsset:'cover-source',requestKey:'cover-trashed-00001'}),env,()=>{throw Error('Trashed source must not submit');})).json();assert.equal(trashed.status,'failed');assert.match(trashed.error,/回收站/);
}));

test('Cover timestamps and DeepSeek organization persist once; formatting retry never resubmits RunningHub',async()=>setup(async({env,request})=>{
 await handleLibrary(new Request('https://sanzo.test/api/account',{headers:{'oai-authenticated-user-id':'alice','oai-authenticated-user-email':'alice@example.test'}}),env);
 await env.BUCKET.put('aligned-source',new Uint8Array([73,68,51]));
 await env.DB.prepare("INSERT INTO assets (owner,id,object_key,name,mime,bytes,kind,status,created_at) VALUES ('alice','aligned-source','aligned-source','测试.mp3','audio/mpeg',3,'upload-music','ready',?)").bind(new Date().toISOString()).run();
 let runs=0,queries=0,formats=0,rewrite=false,block=false,entered,release;
 const upstream=async(url,options)=>{
  if(url.endsWith('/media/upload/binary'))return response({code:0,data:{fileName:'openapi/source.mp3'}});
  if(url.endsWith('/ai-app/run')){runs++;return response({code:0,data:{taskId:'aligned-task'}});}
  if(url.endsWith('/v2/query')){queries++;return response({status:'SUCCESS',results:[{nodeId:'31',text:'X:1\nK:C\nCDEF|'},{nodeId:'34',text:'风吹过夜未央风吹过夜未央'},{nodeId:'40',text:JSON.stringify([{text:'风吹过夜未央',start_time:1,end_time:4},{text:'风吹过夜未央',start_time:6,end_time:9}])}]});}
  assert.equal(url,'https://api.deepseek.com/chat/completions');formats++;
  const context=JSON.parse(JSON.parse(options.body).messages[1].content);assert.equal(context.timestamps.length,2);assert.equal(context.timestamps[1].start,6);
  if(block){entered();await new Promise(resolve=>{release=resolve;});}
  return response({choices:[{finish_reason:'stop',message:{content:JSON.stringify({lyrics:rewrite?'风吹过夜未央':'[Chorus]\n风吹过\n夜未央\n\n[Chorus]\n风吹过\n夜未央'})}}]});
 };
 const {job}=await(await generationHandler(request('',{model:'cover-inference',studioTool:'cover',type:'analysis',sourceAsset:'aligned-source',requestKey:'alignment-integration-0001'}),env,upstream)).json();
 const {job:done}=await(await generationHandler(request('/'+job.id+'/sync',{}),env,upstream)).json();
 assert.equal(done.status,'succeeded');assert.equal(done.input.lyricsTimestampStatus,'ready');assert.equal(done.input.lyricsArrangement.status,'succeeded');assert.equal(done.input.lyricsArrangement.timed,true);assert.equal(done.input.inferredLyrics,'风吹过夜未央风吹过夜未央');assert.match(done.input.structuredLyrics,/\[Chorus\]/);
 await generationHandler(request('/'+job.id+'/sync',{}),env,upstream);await generationHandler(request('/'+job.id+'/lyrics',{}),env,upstream);assert.equal(formats,1);assert.equal(runs,1);assert.equal(queries,1);
 assert.equal((await generationHandler(request('/'+job.id+'/lyrics',{},'bob'),env,upstream)).status,404);
 assert.equal((await generationHandler(request('/'+job.id+'/lyrics',{},'alice',{origin:'https://foreign.test'}),env,upstream)).status,403);
 const old={...done.input,lyricsArrangement:{...done.input.lyricsArrangement,updatedAt:'2000-01-01T00:00:00.000Z'}};
 await env.DB.prepare('UPDATE generations SET input=? WHERE id=?').bind(JSON.stringify(old),job.id).run();
 rewrite=true;const {job:failed}=await(await generationHandler(request('/'+job.id+'/lyrics',{}),env,upstream)).json();assert.equal(failed.status,'succeeded');assert.equal(failed.input.lyricsArrangement.status,'failed');assert.equal(failed.input.inferredLyrics,done.input.inferredLyrics);assert.equal(failed.input.structuredLyrics,done.input.structuredLyrics);
 rewrite=false;block=true;const started=new Promise(resolve=>{entered=resolve;});const retry=generationHandler(request('/'+job.id+'/lyrics',{}),env,upstream);await started;
 const busy=await generationHandler(request('/'+job.id+'/lyrics',{}),env,upstream);assert.equal(busy.status,409);release();const {job:retried}=await(await retry).json();assert.equal(retried.input.lyricsArrangement.status,'succeeded');assert.equal(formats,3);assert.equal(queries,1);assert.equal(runs,1);
 const {job:restored}=await(await generationHandler(request('/'+job.id),env,upstream)).json();assert.equal(restored.input.structuredLyrics,retried.input.structuredLyrics);assert.deepEqual(restored.input.lyricsTimestamps,retried.input.lyricsTimestamps);
 const interrupted={...restored.input,lyricsArrangement:{...restored.input.lyricsArrangement,status:'running'}};
 await env.DB.prepare('UPDATE generations SET input=?,lease_until=0 WHERE id=?').bind(JSON.stringify(interrupted),job.id).run();
 const {job:recoverable}=await(await generationHandler(request('/'+job.id),env,upstream)).json();assert.equal(recoverable.input.lyricsArrangement.status,'failed');assert.match(recoverable.input.lyricsArrangement.message,/重试/);assert.equal(recoverable.input.structuredLyrics,restored.input.structuredLyrics);
 block=false;const {job:recovered}=await(await generationHandler(request('/'+job.id+'/lyrics',{}),env,upstream)).json();assert.equal(recovered.input.lyricsArrangement.status,'succeeded');assert.equal(formats,4);assert.equal(runs,1);
}));

test('SeedVC dual-channel upload, idempotency, ownership and MP3 output persistence',async()=>setup(async({env,request})=>{
 const audio=new Uint8Array([82,73,70,70]);
 await handleLibrary(new Request('https://sanzo.test/api/account',{headers:{'oai-authenticated-user-id':'alice','oai-authenticated-user-email':'alice@example.test'}}),env);
 await env.BUCKET.put('seed-source',audio);
 await env.DB.prepare("INSERT INTO assets (owner,id,object_key,name,mime,bytes,kind,status,created_at) VALUES ('alice','seed-source','seed-source','原始.wav','audio/wav',?,'upload-speech','ready',?)").bind(audio.length,new Date().toISOString()).run();
 for(const provider of ['cn','ai']){
  let uploads=0,runs=0;const config={...env,DEEPSEEK_API_KEY:'',ASSETS:{fetch:async()=>new Response(audio)},...(provider==='ai'?{RUNNINGHUB_CN_API_KEY:''}:{})};
  const body={model:'seedvc-speech',type:'speech',studioTool:'speech',sourceAsset:'seed-source',referenceAsset:'preset:warm',title:'',requestKey:'seedvc-test-'+provider+'-0001'};
  const upstream=async(url,options)=>{
   if(url.endsWith('/media/upload/binary')){uploads++;assert.match(url,new RegExp('runninghub\\.'+provider));return response({code:0,data:{fileName:'openapi/'+(uploads%2===1?'source.wav':'ref.mp3')}});}
   if(url.endsWith('/ai-app/run')){runs++;const payload=JSON.parse(options.body);assert.equal(payload.webappId,provider==='cn'?'2108209006111182850':'2045880827887751169');assert.deepEqual(payload.nodeInfoList,[{nodeId:'18',fieldName:'audio',fieldValue:'openapi/source.wav'},{nodeId:'2',fieldName:'audio',fieldValue:'openapi/ref.mp3'}]);return response({code:0,data:{taskId:'seedvc-'+provider}});}
   if(url.endsWith('/v2/query'))return response({status:'SUCCESS',results:[{nodeId:'28',url:'https://media.example/wrong.wav'},{nodeId:'30',url:'https://media.example/result.mp3'}]});
   assert.equal(url,'https://media.example/result.mp3');return new Response(new Uint8Array([73,68,51,4]));
  };
  const {job}=await(await generationHandler(request('',body),config,upstream)).json();assert.equal(job.status,'queued');assert.equal(job.input.title,'原始 · 温暖女声');assert.equal(job.input.sourceAudio,undefined);assert.equal(job.input.referenceAudio,undefined);
  assert.equal((await generationHandler(request('',body),config,upstream)).status,200);assert.equal(uploads,2);assert.equal(runs,1);
  const {job:done}=await(await generationHandler(request('/'+job.id+'/sync',{}),config,upstream)).json();assert.equal(done.status,'succeeded');
  const saved=await env.DB.prepare('SELECT mime,name,kind FROM assets WHERE id=?').bind(done.assetId).first();assert.equal(saved.mime,'audio/mpeg');assert.equal(saved.kind,'speech');assert.match(saved.name,/\.mp3$/);
  const foreign=await generationHandler(request('',{...body,requestKey:'seedvc-foreign-'+provider},'bob'),config,upstream);assert.equal((await foreign.json()).job.status,'failed');assert.equal(runs,1);
 }
}));
async function setup(run){
 const runtime=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2025-10-01',d1Databases:['DB'],r2Buckets:['BUCKET']});
 try{
  const DB=await runtime.getD1Database('DB'),BUCKET=await runtime.getR2Bucket('BUCKET');
  for(const name of (await readdir(new URL('../drizzle',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){
   const sql=await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8');await DB.batch(sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>DB.prepare(s)));
  }
  const env={DB,BUCKET,DEEPSEEK_API_KEY:'mock-deepseek',RUNNINGHUB_CN_API_KEY:'mock-cn-key',RUNNINGHUB_AI_API_KEY:'mock-ai-key'};
  const request=(path,body,user='alice',extra={})=>new Request('https://sanzo.test/api/generations'+path,{method:body?'POST':'GET',headers:{...(user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}:{}),...(body?{'content-type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});
  await run({env,request});
 }finally{await runtime.dispose();}
}

test('Studio YUE2 Cover reuses owned ABC on both channels, fixed 600 cap, idempotency and MP3 storage',async()=>setup(async({env,request})=>{
 const analysisId='11111111-1111-4111-8111-111111111111',abc='X:1\nT:原曲\nM:4/4\nK:C\nCDEF|',saved={model:'cover-inference',sourceAsset:'cover-song',abcNotation:abc,inferredLyrics:'原歌词',sourceName:'原曲.mp3'};
 await handleLibrary(new Request('https://sanzo.test/api/account',{headers:{'oai-authenticated-user-id':'alice','oai-authenticated-user-email':'alice@example.test'}}),env);
 await env.DB.prepare("INSERT INTO assets(owner,id,object_key,name,mime,bytes,kind,status,created_at) VALUES ('alice','cover-song','cover-song','原曲.mp3','audio/mpeg',3,'upload-music','ready',?)").bind(new Date().toISOString()).run();
 await env.DB.prepare("INSERT INTO generations(id,owner,request_key,provider,input,status,created_at,updated_at) VALUES (?,'alice','saved-analysis-0001','cn',?,'succeeded',?,?)").bind(analysisId,JSON.stringify(saved),new Date().toISOString(),new Date().toISOString()).run();
 let runs=0,queries=0,downloads=0;
 for(const provider of ['cn','ai']){
  const config={...env,DEEPSEEK_API_KEY:'',...(provider==='cn'?{RUNNINGHUB_AI_API_KEY:''}:{RUNNINGHUB_CN_API_KEY:''})},body={model:'yue2-cover',studioTool:'cover',type:'songs',sourceAsset:'cover-song',analysisJobId:analysisId,lyrics:'[Chorus]\nNew lyrics',styles:'jazz, piano',language:'en',title:'我的翻唱',duration:10,abcNotation:'X:999\nK:D\nD|',requestKey:'studio-cover-'+provider+'-0001'};
  const upstream=async(url,options)=>{
   if(url.endsWith('/ai-app/run')){runs++;const payload=JSON.parse(options.body);assert.equal(payload.webappId,provider==='cn'?'2101611194623807489':'2101611337957187585');assert.deepEqual(payload.nodeInfoList,[{nodeId:'15',fieldName:'text',fieldValue:'jazz, piano, English lyrics, English singing'},{nodeId:'16',fieldName:'text',fieldValue:body.lyrics},{nodeId:'31',fieldName:'text',fieldValue:abc},{nodeId:'32',fieldName:'value',fieldValue:false},{nodeId:'14',fieldName:'value',fieldValue:600}]);return response({code:0,data:{taskId:'cover-'+provider}});}
   if(url.endsWith('/v2/query')){queries++;return response({status:'SUCCESS',results:[{nodeId:'23',url:'https://media.test/ignored.md'},{nodeId:'7',url:'https://media.test/cover.mp3'}]});}
   assert.equal(url,'https://media.test/cover.mp3');downloads++;return new Response(new Uint8Array([73,68,51,4]));
  };
  const {job}=await(await generationHandler(request('',body),config,upstream)).json();assert.equal(job.status,'queued');assert.equal(job.input.duration,600);assert.equal(job.input.abcNotation,abc);assert.equal(job.input.styles,body.styles);assert.equal(job.input.workspace,'default');
  const {job:duplicate}=await(await generationHandler(request('',body),config,upstream)).json();assert.equal(duplicate.id,job.id);assert.equal(runs,provider==='cn'?1:2);
  const {job:done}=await(await generationHandler(request('/'+job.id+'/sync',{}),config,upstream)).json();assert.equal(done.status,'succeeded');assert.ok(done.audioURL);const asset=await env.DB.prepare('SELECT * FROM assets WHERE id=?').bind(done.assetId).first();assert.equal(asset.mime,'audio/mpeg');assert.equal(asset.kind,'music');assert.equal(asset.name,'我的翻唱.mp3');
  await generationHandler(request('/'+job.id+'/sync',{}),config,upstream);assert.equal(downloads,provider==='cn'?1:2);
  assert.equal((await generationHandler(request('/'+job.id,undefined,'bob'),config,upstream)).status,404);
  const before=runs;const {job:foreign}=await(await generationHandler(request('',{...body,requestKey:'foreign-cover-'+provider+'-0001'},'bob'),config,upstream)).json();assert.equal(foreign.status,'failed');assert.equal(runs,before);
  const {job:mismatch}=await(await generationHandler(request('',{...body,sourceAsset:'other-source',requestKey:'mismatch-cover-'+provider+'-0001'}),config,upstream)).json();assert.equal(mismatch.status,'failed');assert.equal(runs,before);
 }
 assert.equal(queries,2);assert.equal(downloads,2);
 await env.DB.prepare("UPDATE generations SET status='running' WHERE id=?").bind(analysisId).run();
 const {job:pending}=await(await generationHandler(request('',{model:'yue2-cover',type:'songs',studioTool:'cover',sourceAsset:'cover-song',analysisJobId:analysisId,styles:'pop',lyrics:'歌词',title:'未完成解析',requestKey:'cover-pending-analysis-0001'}),env,()=>{throw Error('Must not call upstream');})).json();assert.equal(pending.status,'failed');assert.equal(runs,2);
}));

test('Studio Cover empty style uses DeepSeek, automatic naming and long lyrics without timing or audio inference',async()=>setup(async({env,request})=>{
 const analysisId='22222222-2222-4222-8222-222222222222',abc='X:1\nK:C\nCD|';
 await handleLibrary(new Request('https://sanzo.test/api/account',{headers:{'oai-authenticated-user-id':'alice','oai-authenticated-user-email':'alice@example.test'}}),env);
 await env.DB.prepare("INSERT INTO assets(owner,id,object_key,name,mime,bytes,kind,status,created_at) VALUES ('alice','style-source','style-source','原曲.mp3','audio/mpeg',3,'upload-music','ready',?)").bind(new Date().toISOString()).run();
 await env.DB.prepare("INSERT INTO generations(id,owner,request_key,provider,input,status,created_at,updated_at) VALUES (?,'alice','cover-style-analysis-0001','cn',?,'succeeded',?,?)").bind(analysisId,JSON.stringify({model:'cover-inference',sourceAsset:'style-source',abcNotation:abc}),new Date().toISOString(),new Date().toISOString()).run();
 const actions=[];let runs=0;
 const upstream=async(url,options)=>{
  if(url==='https://api.deepseek.com/chat/completions'){const input=JSON.parse(JSON.parse(options.body).messages[1].content);actions.push(input.action);assert.ok(['styles','name'].includes(input.action));assert.ok(input.text.length<=5000);const first=actions.filter(a=>a===input.action).length===1;return response({choices:[{message:{content:JSON.stringify({text:first?'x'.repeat(input.action==='styles'?1001:31):input.action==='styles'?'pop, warm vocals, piano':'窗前的雨'})},finish_reason:'stop'}]});}
  assert.ok(url.endsWith('/ai-app/run'));runs++;const nodes=JSON.parse(options.body).nodeInfoList;assert.equal(nodes.find(n=>n.nodeId==='31').fieldValue,abc);assert.equal(nodes.find(n=>n.nodeId==='16').fieldValue.length,15000);return response({code:0,data:{taskId:'long-cover'}});
 };
 const body={model:'yue2-cover',studioTool:'cover',type:'songs',sourceAsset:'style-source',analysisJobId:analysisId,lyrics:'风'.repeat(15000),styles:'',title:'',requestKey:'cover-empty-style-auto-0001'};
 const {job}=await(await generationHandler(request('',body),env,upstream)).json();assert.equal(job.status,'queued');assert.equal(job.input.title,'窗前的雨');assert.equal(job.input.coverStyles,'pop, warm vocals, piano');assert.equal(job.input.styles,'');assert.deepEqual(actions,['styles','styles','name','name']);
 const duplicate=await generationHandler(request('',body),env,upstream);assert.equal(duplicate.status,200);assert.equal(runs,1);assert.deepEqual(actions,['styles','styles','name','name']);
 let badNames=0;const {job:unnamed}=await(await generationHandler(request('',{...body,styles:'pop',requestKey:'cover-name-invalid-0001'}),env,async(url)=>{assert.equal(url,'https://api.deepseek.com/chat/completions');badNames++;return response({choices:[{message:{content:JSON.stringify({text:'x'.repeat(31)})},finish_reason:'stop'}]});})).json();assert.equal(unnamed.status,'failed');assert.match(unnamed.error,/尚未提交翻唱/);assert.equal(badNames,2);assert.equal(runs,1);
 assert.equal((await generationHandler(request('',{...input,padding:'x'.repeat(45000)}),env,()=>{throw Error('No call');})).status,400);
}));
test('ACE-Step 参数映射只发送公开的七个节点字段',()=>{
 const nodes=nodeInfoList({...musicInput(input),duration:135,bpm:95});assert.equal(nodes.length,7);assert.equal(nodes.find(n=>n.nodeId==='36'&&n.fieldName==='language').fieldValue,'zh');
 assert.equal(nodes.find(n=>n.nodeId==='43').fieldValue,'135');assert.match(nodes[0].fieldValue,/female vocals/);
 assert.equal(musicInput({...input,instrumental:true,lyrics:'不应传入的歌词'}).lyrics,'');
 for(const invalid of [{model:'unknown-model'},{lyrics:''},{styles:''},{backgroundMusic:false},{songRvcModel:'trained'},{exclude:'guitar'}])assert.throws(()=>musicInput({...input,...invalid}));
});

test('MiniMax 使用官方公开的三个输入字段，速度和人声通过曲风引导',()=>{
 const base=musicInput({...input,model:'minimax-music'});
 assert.deepEqual(nodeInfoList({...base,duration:135,bpm:95}),[
  {nodeId:'15',fieldName:'text',fieldValue:input.styles+', 95 BPM, female vocals'},
  {nodeId:'16',fieldName:'text',fieldValue:input.lyrics},
  {nodeId:'14',fieldName:'value',fieldValue:'135'}
 ]);
 const instrumental=nodeInfoList({...musicInput({...input,model:'minimax-music',instrumental:true,lyrics:'',styles:'piano, 72 BPM'}),duration:150,bpm:72});
 assert.equal(instrumental[0].fieldValue,'piano, 72 BPM, instrumental, no vocals');
 assert.equal(instrumental[1].fieldValue,'');
 for(const model of ['unknown-model','toString','__proto__',null])assert.throws(()=>musicInput({...input,model}));
});

test('MiniMax 两站提交、幂等、模型隔离和节点 7 MP3 保存',async()=>setup(async({env,request})=>{
 let submissions=0,downloads=0;const bytes=new Uint8Array([73,68,51,4,0,0,0,0,0,0]);
 for(const [provider,appId] of [['cn','2091156951802662914'],['ai','2088299904677462017']]){
  const config={...env,...(provider==='ai'?{RUNNINGHUB_CN_API_KEY:''}:{})};
  const body={...input,model:'minimax-music',requestKey:'minimax-submission-'+provider};
  const fake=async(url,options)=>{
   assert.equal(new URL(url).hostname,url.includes('/result.mp3')?'media.runninghub.test':'www.runninghub.'+provider);
   if(url.endsWith('/ai-app/run')){
    submissions++;const payload=JSON.parse(options.body);
    assert.equal(payload.webappId,appId);assert.equal(payload.apiKey,env['RUNNINGHUB_'+provider.toUpperCase()+'_API_KEY']);
    assert.equal(payload.nodeInfoList.length,3);assert.equal(payload.nodeInfoList.find(n=>n.nodeId==='14').fieldValue,'120');
    return response({code:0,data:{taskId:'minimax-'+provider,taskStatus:'QUEUED'}});
   }
   if(url.endsWith('/v2/query'))return response({status:'SUCCESS',results:[{nodeId:'38',url:'https://media.runninghub.test/wrong.jpg',outputType:'image'},{nodeId:'7',url:'https://media.runninghub.test/result.mp3'}]});
   downloads++;assert.equal(options.redirect,'manual');return new Response(bytes);
  };
  const first=(await (await handleGenerations(request('',body),config,fake)).json()).job;
  assert.equal(first.status,'queued');assert.equal(first.input.model,'minimax-music');assert.equal(first.input.duration,120);assert.equal(first.provider,undefined);
  const duplicate=(await (await handleGenerations(request('',body),config,fake)).json()).job;
  assert.equal(duplicate.id,first.id);
  assert.equal((await handleGenerations(request('',{...body,model:'ace-step'}),config,fake)).status,409);
  const done=(await (await handleGenerations(request('/'+first.id+'/sync',{}),config,fake)).json()).job;
  assert.equal(done.status,'succeeded');assert.equal(done.assetId,'music-'+first.id);
  const asset=await env.BUCKET.get('users/alice/'+done.assetId);
  assert.deepEqual(new Uint8Array(await asset.arrayBuffer()),bytes);
  assert.equal((await handleGenerations(request('/'+first.id,undefined,'bob'),config,fake)).status,404);
 }
 assert.equal(submissions,2);assert.equal(downloads,2);
}));
test('任务鉴权、参数校验、两站路由、幂等提交、账号隔离及 MP3 云端保存',async()=>setup(async({env,request})=>{
 let submissions=0,downloads=0,queries=0;
 const bytes=new Uint8Array([73,68,51,4,0,0,0,0,0,2,255,251,0]);
 const fake=async(url,options)=>{
  if(url.endsWith('/ai-app/run')){submissions++;const payload=JSON.parse(options.body);assert.equal(payload.webappId,submissions===1?'2077026060922871809':'2044441753280847873');assert.equal(payload.apiKey,submissions===1?'mock-cn-key':'mock-ai-key');return response({code:0,data:{taskId:'upstream-'+submissions,taskStatus:'QUEUED'}});}
  if(url.endsWith('/v2/query')){queries++;return response({status:'SUCCESS',results:[{nodeId:'38',outputType:'mp3',url:'https://media.runninghub.test/result.mp3'}],usage:{consumeMoney:'0.1',taskCostTime:'35',consumeCoins:null,unexpectedSecret:'do not expose'}});}
  downloads++;assert.equal(options.headers,undefined);assert.equal(options.redirect,'manual');return new Response(bytes,{headers:{'Content-Type':'audio/mpeg'}});
 };
 assert.equal((await handleGenerations(request('',input,null),env,fake)).status,401);
 assert.equal((await handleGenerations(request('',input,'alice',{origin:'https://other.test'}),env,fake)).status,403);
 assert.equal((await handleGenerations(request('',{...input,backgroundMusic:false}),env,fake)).status,400);
 const first=(await (await handleGenerations(request('',input),env,fake)).json()).job;
 assert.equal(first.status,'queued');assert.equal(submissions,1);assert.equal(first.input.duration,135);assert.equal(first.provider,undefined);
 const duplicate=(await (await handleGenerations(request('',input),env,fake)).json()).job;assert.equal(duplicate.id,first.id);assert.equal(submissions,1);
 assert.equal((await handleGenerations(request('',{...input,title:'Changed'}),env,fake)).status,409);
 assert.equal((await handleGenerations(request('/'+first.id,undefined,'bob'),env,fake)).status,404);
 const finished=(await (await handleGenerations(request('/'+first.id+'/sync',{}),env,fake)).json()).job;
 assert.equal(finished.status,'succeeded');assert.equal(finished.assetId,'music-'+first.id);assert.equal(downloads,1);assert.equal(finished.usage.unexpectedSecret,undefined);
 assert.equal(finished.usage.consumeMoney,.1);assert.equal(finished.usage.taskCostTime,35);assert.equal(finished.usage.consumeCoins,undefined);
 const audioRequest=user=>new Request('https://sanzo.test'+finished.audioURL,{headers:{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}});
 assert.deepEqual(new Uint8Array(await (await handleLibrary(audioRequest('alice'),env)).arrayBuffer()),bytes);
 assert.equal((await handleLibrary(audioRequest('bob'),env)).status,404);
 await handleGenerations(request('/'+first.id+'/sync',{}),env,fake);assert.equal(downloads,1);assert.equal(queries,1);
 assert.equal((await env.DB.prepare('SELECT bytes FROM users WHERE id=?').bind('alice').first()).bytes,bytes.length);
 const international=(await (await handleGenerations(request('',{...input,provider:'cn',requestKey:'test-submission-0002'}),{...env,RUNNINGHUB_CN_API_KEY:''},fake)).json()).job;assert.equal((await env.DB.prepare('SELECT provider FROM generations WHERE id=?').bind(international.id).first()).provider,'ai');assert.equal(submissions,2);
 const all=(await (await handleGenerations(request(''),env,fake)).json()).jobs;assert.equal(all.length,2);assert.equal((await (await handleGenerations(request('',undefined,'bob'),env,fake)).json()).jobs.length,0);
}));
test('失败与超时不会自动再次收费，服务端错误隐去密钥',async()=>setup(async({env,request})=>{
 let calls=0;
 const failure=async()=>{calls++;return response({code:1,msg:'denied mock-cn-key'});};
 const row=(await (await handleGenerations(request('',input),env,failure)).json()).job;
 assert.equal(row.status,'failed');assert.equal(row.error.includes(env.RUNNINGHUB_CN_API_KEY),false);
 await handleGenerations(request('',input),env,failure);assert.equal(calls,2);
 const timed={...input,requestKey:'test-submission-timeout'};
 const timeout=async()=>{calls++;throw Error('simulated network timeout');};
 const unknown=(await (await handleGenerations(request('',timed),env,timeout)).json()).job;assert.equal(unknown.status,'unknown');assert.match(unknown.error,/不会自动重复提交/);
 await handleGenerations(request('',timed),env,timeout);await handleGenerations(request('/'+unknown.id+'/sync',{}),env,timeout);assert.equal(calls,3);
}));
test('并发查询只导入一份音频，导入失败可恢复且不重新提交任务',async()=>setup(async({env,request})=>{
 let runCount=0,queryCount=0,downloadCount=0;
 const fake=async(url)=>{
  if(url.endsWith('/ai-app/run')){runCount++;return response({code:0,data:{taskId:'upstream',taskStatus:'RUNNING'}});}
  if(url.endsWith('/v2/query')){queryCount++;return response({status:'SUCCESS',results:[{nodeId:'38',url:'https://media.runninghub.test/song.mp3'}]});}
  downloadCount++;await new Promise(r=>setTimeout(r,30));return new Response(new Uint8Array([73,68,51,4,0,0,0,0,0,0]));
 };
 const row=(await (await handleGenerations(request('',input),env,fake)).json()).job;
 const badEnv={...env,BUCKET:{put:async()=>{throw Error('write failed');},delete:async()=>{}}};
 const failedImport=(await (await handleGenerations(request('/'+row.id+'/sync',{}),badEnv,fake)).json()).job;
 assert.equal(failedImport.status,'running');assert.ok(failedImport.error);assert.equal((await env.DB.prepare('SELECT bytes FROM users WHERE id=?').bind('alice').first()).bytes,0);
 await env.DB.prepare('UPDATE generations SET checked_at=0 WHERE id=?').bind(row.id).run();
 await Promise.all([handleGenerations(request('/'+row.id+'/sync',{}),env,fake),handleGenerations(request('/'+row.id+'/sync',{}),env,fake)]);
 const ready=(await (await handleGenerations(request('/'+row.id),env,fake)).json()).job;
 assert.equal(ready.status,'succeeded');assert.equal(queryCount,2);assert.equal(downloadCount,2);assert.equal(runCount,1);
 assert.equal((await env.DB.prepare('SELECT bytes FROM users WHERE id=?').bind('alice').first()).bytes,10);
}));

test('自动分配仅在明确拒绝后切换，编排幂等，收到任务 ID 后固定原站查询',async()=>setup(async({env,request})=>{
 let plans=0,runs=0;const origins=[];
 const fake=async(url,options)=>{
  if(url==='https://api.deepseek.com/chat/completions'){plans++;return response({choices:[{finish_reason:'stop',message:{content:'{"duration":165,"bpm":72}'}}]});}
  if(url.endsWith('/ai-app/run')){
   runs++;origins.push(new URL(url).hostname);
   assert.equal(JSON.parse(options.body).nodeInfoList.find(n=>n.nodeId==='43').fieldValue,'165');
   if(runs===1)return response({code:1,msg:'submission rejected'});
   return new Response(JSON.stringify({code:0,data:{taskId:'accepted-ai',taskStatus:'QUEUED'}}),{status:429});
  }
  assert.equal(new URL(url).hostname,'www.runninghub.ai');return response({status:'RUNNING'});
 };
 const responses=await Promise.all([generationHandler(request('',input),env,fake),generationHandler(request('',input),env,fake)]);
 const jobs=await Promise.all(responses.map(r=>r.json()));assert.equal(jobs[0].job.id,jobs[1].job.id);
 assert.equal(plans,1);assert.equal(runs,2);assert.deepEqual(origins,['www.runninghub.cn','www.runninghub.ai']);
 const row=(await (await generationHandler(request(''),env,fake)).json()).jobs[0];
 assert.equal(row.status,'queued');assert.equal(row.input.duration,165);assert.equal(row.input.routingAttempts,undefined);assert.equal(row.input.provider,undefined);
 await generationHandler(request('/'+row.id+'/sync',{}),env,fake);assert.equal(runs,2);
 let musicCalls=0;
 const fail=async(url)=>{if(url!=='https://api.deepseek.com/chat/completions')musicCalls++;return new Response('{}',{status:500});};
 const rejected=(await (await generationHandler(request('',{...input,requestKey:'test-planning-failure'}),env,fail)).json()).job;
 assert.equal(rejected.status,'failed');assert.equal(musicCalls,0);
}));

test('音频下载兼容 Workers，重定向不跟随；恢复同步不会重新生成',async()=>setup(async({env,request})=>{
 let runs=0,downloads=0;const visited=[];
 const fake=async(url,options)=>{
  if(url.endsWith('/ai-app/run')){runs++;return response({code:0,data:{taskId:'download-recovery',taskStatus:'RUNNING'}});}
  if(url.endsWith('/v2/query'))return response({status:'SUCCESS',results:[{nodeId:'38',url:'https://media.runninghub.test/recovery.mp3'}]});
  visited.push(url);downloads++;
  // Reproduce the production runtime restriction, rather than accepting all Node fetch options.
  if(!['manual','follow'].includes(options.redirect))throw Error('Invalid redirect value');
  if(downloads===1)return new Response(null,{status:302,headers:{Location:'https://other.test/redirect.mp3'}});
  return new Response(new Uint8Array([73,68,51,4,0,0,0,0,0,0]));
 };
 const job=(await (await handleGenerations(request('',input),env,fake)).json()).job;
 const pending=(await (await handleGenerations(request('/'+job.id+'/sync',{}),env,fake)).json()).job;
 assert.equal(pending.status,'running');assert.equal(pending.assetId,null);assert.match(pending.error,/保存暂未完成/);
 assert.equal((await env.DB.prepare('SELECT bytes FROM users WHERE id=?').bind('alice').first()).bytes,0);
 await env.DB.prepare('UPDATE generations SET checked_at=0 WHERE id=?').bind(job.id).run();
 const done=(await (await handleGenerations(request('/'+job.id+'/sync',{}),env,fake)).json()).job;
 assert.equal(done.status,'succeeded');assert.equal(done.error,null);assert.ok(done.assetId);assert.equal(runs,1);
 assert.deepEqual(visited,['https://media.runninghub.test/recovery.mp3','https://media.runninghub.test/recovery.mp3']);
}));

test('后台人声选项覆盖相反标签，纯音乐两模型均不发送歌词，原始曲风保持不变',()=>{
 for(const model of ['ace-step','minimax-music']){
  for(const gender of ['female','male']){
   const styles='piano, '+(gender==='female'?'male vocals':'female vocals');
   const form=musicInput({...input,model,styles,gender});
   const nodes=nodeInfoList({...form,duration:90,bpm:95});
   assert.equal(form.styles,styles);
   assert.match(nodes[0].fieldValue,new RegExp(gender+' vocals'));
   assert.doesNotMatch(nodes[0].fieldValue,new RegExp('\\b'+(gender==='female'?'male':'female')+' vocals\\b'));
  }
  const nodes=nodeInfoList({...musicInput({...input,model,instrumental:true,styles:'piano, female vocals',lyrics:'不要发送'}),duration:90,bpm:95});
  assert.match(nodes[0].fieldValue,/instrumental, no vocals/);
  assert.doesNotMatch(nodes[0].fieldValue,/female vocals/);
  assert.equal(nodes.find(n=>n.fieldName==='text'&&n.nodeId===(model==='ace-step'?'40':'16')).fieldValue,'');
 }
});

test('ACE-Step 传递所选歌词语言，MiniMax 不发送语言节点',()=>{
 for(const language of ['zh','en','ja','ko','es','fr','de','vi','ru']){
  const ace=nodeInfoList({...musicInput({...input,language}),duration:90,bpm:95});
  assert.equal(ace.find(n=>n.nodeId==='36'&&n.fieldName==='language').fieldValue,language);
  const mini=nodeInfoList({...musicInput({...input,model:'minimax-music',language}),duration:90,bpm:95});
  assert.equal(mini.length,3);assert.equal(mini.some(n=>n.fieldName==='language'),false);
 }
});

test('ACE 工作流语言和调性使用用户提供的有效值',()=>{
 for(const language of ['ar','yue','unknown','zh','ja'])assert.equal(musicInput({...input,language}).language,language);
 assert.throws(()=>musicInput({...input,language:'xx'}));
 const nodes=nodeInfoList({...musicInput(input),duration:90,bpm:100,keyscale:'Ab major'});
 assert.equal(nodes.find(n=>n.fieldName==='keyscale').fieldValue,'Ab major');
});

test('YUE2 两站直接成曲，24 永远传布尔 false，完成后只保存节点 7 MP3',async()=>setup(async({env,request})=>{
 const bytes=new Uint8Array([73,68,51,4,0,0,0,0,0,0]);let runs=0;
 for(const [provider,appId]of [['cn','2101473616566243329'],['ai','2101472878767497218']]){
  const config={...env,...(provider==='ai'?{RUNNINGHUB_CN_API_KEY:''}:{})};
  const body={...input,model:'yue2',useABC:true,abc:true,requestKey:'yue2-submission-'+provider};
  const fake=async(url,options)=>{
   if(url.includes('/apiCallDemo'))throw Error('不应通过公开参数列表拦截直接传参');
   if(url.endsWith('/ai-app/run')){runs++;const payload=JSON.parse(options.body);assert.equal(payload.webappId,appId);
    const nodes=payload.nodeInfoList;assert.equal(nodes.length,4);assert.equal(nodes.find(n=>n.nodeId==='24').fieldValue,false);assert.equal(typeof nodes.find(n=>n.nodeId==='24').fieldValue,'boolean');assert.equal(nodes.find(n=>n.nodeId==='14').fieldValue,'135');assert.equal(nodes.find(n=>n.nodeId==='16').fieldValue,input.lyrics);assert.equal(nodes.some(n=>n.nodeId==='26'),false);return response({code:0,data:{taskId:'yue-'+provider,taskStatus:'QUEUED'}});}
   if(url.endsWith('/v2/query'))return response({status:'SUCCESS',results:[{nodeId:'22',url:'https://media.test/abc.md'},{nodeId:'7',url:'https://media.test/yue.mp3'}]});
   assert.equal(url,'https://media.test/yue.mp3');return new Response(bytes);
  };
  const first=(await(await handleGenerations(request('',body),config,fake)).json()).job;assert.equal(first.status,'queued');
  const duplicate=(await(await handleGenerations(request('',body),config,fake)).json()).job;assert.equal(duplicate.id,first.id);
  const done=(await(await handleGenerations(request('/'+first.id+'/sync',{}),config,fake)).json()).job;assert.equal(done.status,'succeeded');assert.equal(done.assetId,'music-'+first.id);
 }
 assert.equal(runs,2);
}));

test('YUE2 直接传参被明确拒绝时可切换渠道，含任务 ID 的响应不会重复提交',async()=>setup(async({env,request})=>{
 let calls=0;
 const fake=async(url,options)=>{
  assert.ok(url.endsWith('/ai-app/run'));calls++;
  const nodes=JSON.parse(options.body).nodeInfoList;
  assert.equal(nodes.find(n=>n.nodeId==='24').fieldValue,false);
  if(url.includes('runninghub.cn'))return response({code:400,msg:'明确拒绝测试'});
  return response({code:0,data:{taskId:'direct-ai',taskStatus:'QUEUED'}});
 };
 const body={...input,model:'yue2',requestKey:'yue2-direct-failover'};
 const first=(await(await handleGenerations(request('',body),env,fake)).json()).job;
 assert.equal(first.status,'queued');assert.equal(calls,2);
 const again=(await(await handleGenerations(request('',body),env,fake)).json()).job;
 assert.equal(again.id,first.id);assert.equal(calls,2);
}));


test('Qwen 音色设计双站仅传文字与音色，不调用 DeepSeek，MP3 保存且幂等',async()=>setup(async({env,request})=>{
 delete env.DEEPSEEK_API_KEY;
 for(const provider of ['cn','ai']){
  const config={...env,...(provider==='ai'?{RUNNINGHUB_CN_API_KEY:''}:{RUNNINGHUB_AI_API_KEY:''})};let runs=0;
  const body={type:'speech',speechModel:'design',model:'qwen-voice-design',title:'音色设计',designText:'你好，欢迎来到 Sanzo。',voiceDescription:'低沉温暖的男声。',designVoice:'soft',requestKey:'speech-test-'+provider+'-000001'};
  const upstream=async(url,options)=>{
   if(url.endsWith('/ai-app/run')){runs++;const payload=JSON.parse(options.body);assert.equal(payload.webappId,provider==='cn'?'2091093839124717570':'2045683032845197314');assert.deepEqual(payload.nodeInfoList,[{nodeId:'15',fieldName:'text',fieldValue:body.designText},{nodeId:'16',fieldName:'text',fieldValue:body.voiceDescription}]);return response({code:0,data:{taskId:'speech-task-'+provider}});}
   if(url.endsWith('/openapi/v2/query'))return response({status:'SUCCESS',results:[{nodeId:'17',url:'https://audio.example/voice.mp3',outputType:'mp3'}]});
   if(url==='https://audio.example/voice.mp3')return new Response(new Uint8Array([0x49,0x44,0x33,0,1]));
   throw Error('Unexpected API '+url);
  };
  const first=await generationHandler(request('',body),config,upstream);assert.equal(first.status,202);const {job}=await first.json();assert.equal(job.input.type,'speech');assert.equal(job.input.workspace,'speech');
  const duplicate=await generationHandler(request('',body),config,upstream);assert.equal(duplicate.status,200);assert.equal(runs,1);
  const synced=await generationHandler(request('/'+job.id+'/sync',{}),config,upstream);assert.equal(synced.status,200);assert.equal((await synced.json()).job.status,'succeeded');
  const asset=await config.DB.prepare('SELECT kind FROM assets WHERE id=?').bind('music-'+job.id).first();assert.equal(asset.kind,'speech');
 }
}));
test('音色设计为空描述采用预设，不接受空文字或未支持语音模式',()=>{
 const body={model:'qwen-voice-design',type:'speech',speechModel:'design',designText:'测试',designVoice:'deep',voiceDescription:''};
 const parsed=musicInput(body);assert.match(nodeInfoList(parsed)[1].fieldValue,/低沉磁性/);
 assert.throws(()=>musicInput({...body,designText:''}));assert.throws(()=>musicInput({...body,speechModel:'rvc'}));
});

test('自动命名综合素材并保持重复提交幂等，手动名称跳过命名',async()=>setup(async({env,request})=>{
 for(const type of ['speech','songs']){
  const body=type==='speech'?{type,speechModel:'design',model:'qwen-voice-design',designText:'海风吹来，欢迎回家。',voiceDescription:'温暖低沉的男声',designVoice:'deep',title:'',requestKey:'auto-name-speech-001'}:{...input,title:'',requestKey:'auto-name-songs-001'};
  let names=0,runs=0;
  const upstream=async(url,options)=>{
   if(url==='https://api.deepseek.com/chat/completions'){
    const prompt=JSON.parse(JSON.parse(options.body).messages[1].content);
    if(prompt.action==='name'){names++;assert.equal(prompt.text,type==='speech'?body.designText:body.lyrics);assert.equal(prompt.context.styles,type==='speech'?body.voiceDescription:body.styles);return response({choices:[{finish_reason:'stop',message:{content:JSON.stringify({text:'海风归途'})}}]});}
    return response({choices:[{finish_reason:'stop',message:{content:JSON.stringify({duration:90,bpm:95})}}]});
   }
   if(url.endsWith('/ai-app/run')){runs++;return response({code:0,data:{taskId:'named-'+type}});}throw Error('Unexpected '+url);
  };
  const first=await generationHandler(request('',body),env,upstream);const {job}=await first.json();assert.equal(job.input.title,'海风归途');
  const second=await generationHandler(request('',body),env,upstream);assert.equal(second.status,200);assert.equal((await second.json()).job.input.title,'海风归途');assert.equal(names,1);assert.equal(runs,1);
  const manual=await generationHandler(request('',{...body,title:'我的标题',requestKey:body.requestKey+'-manual'}),env,upstream);assert.equal((await manual.json()).job.input.title,'我的标题');assert.equal(names,1);
  await env.DB.prepare("UPDATE generations SET status='succeeded'").run();
 }
}));

test('Qwen TTS 双站先上传参考音色，再提交节点 4/6，节点 9 保存且重复提交幂等',async()=>setup(async({env,request})=>{
 delete env.DEEPSEEK_API_KEY;
 const bytes=new Uint8Array([73,68,51,4,0,0,0,0,0,0]);
 env.ASSETS={fetch:async request=>{assert.equal(new URL(request.url).pathname,'/voices/warm.mp3');return new Response(bytes,{headers:{'content-type':'audio/mpeg'}});}};
 for(const provider of ['cn','ai']){
  const config={...env,...(provider==='cn'?{RUNNINGHUB_AI_API_KEY:''}:{RUNNINGHUB_CN_API_KEY:''})},calls=[];
  const body={model:'qwen-voice-clone',type:'speech',speechModel:'tts',ttsModel:'qwen-tts',speechText:'你好，欢迎回家。',title:'温暖问候',voiceSource:'library',libraryVoice:'preset:warm',requestKey:'clone-test-'+provider+'-0001'};
  const upstream=async(url,options)=>{
   calls.push(url);
   if(url.endsWith('/media/upload/binary')){
    assert.equal(new URL(url).hostname,'www.runninghub.'+provider);
    assert.equal(options.headers.Authorization,'Bearer mock-'+provider+'-key');
    assert.ok(options.body instanceof FormData);const file=options.body.get('file');
    assert.equal(file.name,'warm.mp3');assert.deepEqual(new Uint8Array(await file.arrayBuffer()),bytes);
    return response(provider==='cn'?{code:0,data:{fileName:'openapi/cn.mp3'}}:{code:200,data:{filename:'openapi/ai.mp3'}});
   }
   if(url.endsWith('/ai-app/run')){
    const payload=JSON.parse(options.body);assert.equal(payload.webappId,provider==='cn'?'2107755708744818689':'2107755813385740290');
    assert.deepEqual(payload.nodeInfoList,[{nodeId:'6',fieldName:'text',fieldValue:body.speechText},{nodeId:'4',fieldName:'audio',fieldValue:'openapi/'+provider+'.mp3'}]);
    return response({code:0,data:{taskId:'clone-'+provider}});
   }
   if(url.endsWith('/v2/query'))return response({status:'SUCCESS',results:[{nodeId:'4',url:'https://media.example/wrong.wav'},{nodeId:'9',url:'https://media.example/clone.mp3'}]});
   assert.equal(url,'https://media.example/clone.mp3');return new Response(bytes);
  };
  const {job}=await(await generationHandler(request('',body),config,upstream)).json();
  assert.equal(job.status,'queued');assert.equal(job.input.workspace,'speech');assert.equal(job.input.referenceAudio,undefined);assert.equal(job.input.referenceName,'温暖女声');assert.equal(job.input.title,'温暖问候');
  const duplicate=await generationHandler(request('',body),config,upstream);assert.equal(duplicate.status,200);assert.equal(calls.length,2);
  assert.equal((await generationHandler(request('',{...body,speechText:'不同的文字'}),config,upstream)).status,409);
  const done=(await(await generationHandler(request('/'+job.id+'/sync',{}),config,upstream)).json()).job;assert.equal(done.status,'succeeded');
  assert.equal((await env.DB.prepare('SELECT kind FROM assets WHERE id=?').bind(done.assetId).first()).kind,'speech');
 }
}));

test('Qwen TTS 自有上传音色，其他用户不能引用且不提交付费任务',async()=>setup(async({env,request})=>{
 const audio=new Uint8Array([73,68,51,1,2,3]);
 await handleLibrary(new Request('https://sanzo.test/api/account',{headers:{'oai-authenticated-user-id':'alice','oai-authenticated-user-email':'alice@example.test'}}),env);
 await env.BUCKET.put('reference-object',audio);
 await env.DB.prepare("INSERT INTO assets (owner,id,object_key,name,mime,bytes,kind,status,created_at) VALUES ('alice','own-reference','reference-object','参考.mp3','audio/mpeg',?,'upload-speech','ready',?)").bind(audio.length,new Date().toISOString()).run();
 const body={model:'qwen-voice-clone',type:'speech',speechModel:'tts',ttsModel:'qwen-tts',speechText:'这是我的新声音。',title:'新声音',voiceSource:'upload',cloneSample:'own-reference',requestKey:'clone-owned-reference-001'};
 let calls=0;
 const upstream=async(url,options)=>{calls++;
  if(url.endsWith('/media/upload/binary')){assert.equal(options.body.get('file').name,'参考.mp3');return response({code:0,data:{fileName:'openapi/own.mp3'}});}
  assert.ok(url.endsWith('/ai-app/run'));return response({code:0,data:{taskId:'own-clone'}});
 };
 const other=await(await generationHandler(request('',body,'bob'),env,upstream)).json();assert.equal(other.job.status,'failed');assert.match(other.job.error,/属于你的/);assert.equal(calls,0);
 const own=await(await generationHandler(request('',body),env,upstream)).json();assert.equal(own.job.status,'queued');assert.equal(own.job.input.referenceName,'参考.mp3');assert.equal(calls,2);
}));

test('Qwen TTS 上传失败可换渠道，付费提交不明时不能重复运行',async()=>setup(async({env,request})=>{
 env.ASSETS={fetch:async()=>new Response(new Uint8Array([73,68,51]),{headers:{'content-type':'audio/mpeg'}})};
 const body={model:'qwen-voice-clone',type:'speech',speechModel:'tts',ttsModel:'qwen-tts',speechText:'测试语音。',title:'测试语音',libraryVoice:'preset:warm',requestKey:'clone-failover-00001'};
 let uploads=0,runs=0;
 const upstream=async(url)=>{
  if(url.endsWith('/media/upload/binary')){uploads++;if(url.includes('runninghub.cn'))throw Error('upload timeout');return response({code:0,data:{fileName:'openapi/ai.mp3'}});}
  assert.ok(url.includes('runninghub.ai'));runs++;throw Error('paid run timeout');
 };
 const first=await(await generationHandler(request('',body),env,upstream)).json();assert.equal(first.job.status,'unknown');assert.equal(uploads,2);assert.equal(runs,1);
 await generationHandler(request('',body),env,upstream);assert.equal(uploads,2);assert.equal(runs,1);
}));

test('Index TTS 验证八维向量，双站传 vector 模式和 JSON 字符串，节点 18 保存且幂等',async()=>setup(async({env,request})=>{
 const bytes=new Uint8Array([73,68,51,4,0,0,0,0,0,0]);env.ASSETS={fetch:async()=>new Response(bytes,{headers:{'content-type':'audio/mpeg'}})};
 const base={model:'index-voice-clone',type:'speech',speechModel:'tts',ttsModel:'index-tts',speechText:'欢迎来到 Sanzo。',title:'情绪问候',libraryVoice:'preset:clear',emotionVector:[.4,.1,0,.2,0,0,.3,.5],emotionDescription:'高兴中带一点惊讶',emotionSummary:'以高兴为主，略带惊讶。',emotionSource:'ai'};
 let runs=0,uploads=0;
 const upstream=async(url,options)=>{
  const provider=new URL(url).hostname.endsWith('.cn')?'cn':'ai';
  if(url.endsWith('/media/upload/binary')){uploads++;return response({code:0,data:{fileName:'openapi/'+provider+'.mp3'}});}
  if(url.endsWith('/ai-app/run')){
   runs++;const payload=JSON.parse(options.body);assert.equal(payload.webappId,provider==='cn'?'2107769776520122369':'2088285539253633025');
   assert.deepEqual(payload.nodeInfoList,[{nodeId:'17',fieldName:'text',fieldValue:base.speechText},{nodeId:'16',fieldName:'audio',fieldValue:'openapi/'+provider+'.mp3'},{nodeId:'15',fieldName:'emotion_mode',fieldValue:'vector'},{nodeId:'15',fieldName:'emotion_vector',fieldValue:JSON.stringify(base.emotionVector)}]);
   return response({code:0,data:{taskId:'index-'+provider}});
  }
  if(url.endsWith('/v2/query'))return response({status:'SUCCESS',results:[{nodeId:'15',url:'https://media.test/wrong.json'},{nodeId:'18',url:'https://media.test/index.mp3'}]});
  assert.equal(url,'https://media.test/index.mp3');return new Response(bytes);
 };
 for(const invalid of [[0],Array(8).fill(1.1),Array(8).fill(-.1),Array(8).fill('0'),null]){
  const result=await generationHandler(request('',{...base,emotionVector:invalid,requestKey:'index-invalid-0001'}),env,upstream);
  // Explicit null is invalid too; absence alone defaults to neutral.
  assert.equal(result.status,400);
 }
 assert.equal(runs,0);assert.equal(uploads,0);
 for(const provider of ['cn','ai']){
  const config={...env,...(provider==='cn'?{RUNNINGHUB_AI_API_KEY:''}:{RUNNINGHUB_CN_API_KEY:''})},body={...base,requestKey:'index-clone-'+provider+'-0001'};
  const {job}=await(await generationHandler(request('',body),config,upstream)).json();assert.equal(job.status,'queued');assert.equal(job.input.ttsModel,'index-tts');assert.equal(job.input.emotionDescription,base.emotionDescription);assert.equal(job.input.emotionSummary,base.emotionSummary);assert.equal(job.input.emotionSource,'ai');assert.equal(job.input.referenceName,'清澈男声');
  const duplicate=await generationHandler(request('',body),config,upstream);assert.equal(duplicate.status,200);
  assert.equal((await generationHandler(request('',{...body,emotionVector:Array(8).fill(0)}),config,upstream)).status,409);
  const done=(await(await generationHandler(request('/'+job.id+'/sync',{}),config,upstream)).json()).job;assert.equal(done.status,'succeeded');
  assert.equal((await env.DB.prepare('SELECT kind FROM assets WHERE id=?').bind(done.assetId).first()).kind,'speech');
 }
 assert.equal(runs,2);assert.equal(uploads,2);
}));

const abcText='X:1\nT:Test\nM:4/4\nL:1/4\nQ:1/4=90\nK:C\nC D E F|';
test('ABC 与普通 YUE2 使用同一应用，仅布尔开关不同',()=>{
 const score=musicInput({...input,model:'yue2-abc'});assert.equal(score.type,'abc');
 const abcNodes=nodeInfoList({...score,duration:30,bpm:90}),songNodes=nodeInfoList({...musicInput({...input,model:'yue2'}),duration:30,bpm:90});
 assert.equal(abcNodes.find(n=>n.nodeId==='24').fieldValue,true);assert.equal(songNodes.find(n=>n.nodeId==='24').fieldValue,false);
 assert.deepEqual(abcNodes.filter(n=>n.nodeId!=='24'),songNodes.filter(n=>n.nodeId!=='24'));
});
test('ABC 节点22支持 MD、围栏文本，拒绝错误节点及超大输出',async()=>{
 const workflow={abcNode:'22'};
 assert.equal(await abcResult([{nodeId:'22',text:abcText}],workflow),abcText);
 assert.equal(await abcResult([{nodeId:'22',url:'https://media.test/score.md'}],workflow,async()=>new Response('```abc\n'+abcText+'\n```')),abcText);
 await assert.rejects(abcResult([{nodeId:'23',text:abcText}],workflow),/节点 22/);
 await assert.rejects(abcResult([{nodeId:'22',text:abcText+'x'.repeat(50000)}],workflow),/50000/);
 await assert.rejects(abcResult([{nodeId:'22',url:'http://media.test/score.md'}],workflow),/地址无效/);
});
test('ABC 两站双输出保存，MD 保存失败可同步恢复而不会重复提交',async()=>setup(async({env,request})=>{
 for(const provider of ['cn','ai']){
 let submits=0,downloads=0,ready=false;const config={...env,...(provider==='ai'?{RUNNINGHUB_CN_API_KEY:''}:{})};
 const fake=async(url,options)=>{
  if(url.endsWith('/ai-app/run')){submits++;const payload=JSON.parse(options.body);assert.equal(payload.webappId,provider==='cn'?'2101473616566243329':'2101472878767497218');assert.equal(payload.nodeInfoList.find(n=>n.nodeId==='24').fieldValue,true);return response({code:0,data:{taskId:'abc-'+provider,taskStatus:'RUNNING'}});}
  if(url.endsWith('/v2/query'))return response({status:'SUCCESS',results:[{nodeId:'22',outputType:'md',url:'https://media.test/score.md'},{nodeId:'7',outputType:'mp3',url:'https://media.test/score.mp3'}]});
  if(url.endsWith('.md'))return ready?new Response(abcText):new Response('unavailable',{status:503});
  downloads++;return new Response(new Uint8Array([73,68,51,0,0,0]));
 };
 const body={...input,model:'yue2-abc',workspace:'abc',requestKey:'abc-submission-'+provider};
 const first=(await (await handleGenerations(request('',body),config,fake)).json()).job;
 const waiting=(await (await handleGenerations(request('/'+first.id+'/sync',{}),config,fake)).json()).job;
 assert.equal(waiting.status,'running');assert.match(waiting.error,/ABC/);assert.equal(downloads,0);
 ready=true;await env.DB.prepare('UPDATE generations SET checked_at=0 WHERE id=?').bind(first.id).run();
 const done=(await (await handleGenerations(request('/'+first.id+'/sync',{}),config,fake)).json()).job;
 assert.equal(done.status,'succeeded');assert.equal(done.input.abcNotation,abcText);assert.equal(done.input.type,'abc');assert.equal(done.input.workspace,'abc');assert.ok(await config.BUCKET.get('users/alice/'+done.assetId));
 await handleGenerations(request('',body),config,fake);await handleGenerations(request('/'+first.id+'/sync',{}),config,fake);assert.equal(submits,1);assert.equal(downloads,1);
 assert.equal((await handleGenerations(request('/'+first.id,undefined,'bob'),config,fake)).status,404);
 }
}));
