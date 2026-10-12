import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';
import {handleCovers,coverNodes,fallbackCover,imageType} from '../server/covers.mjs';
import {handleLibrary} from '../server/library.mjs';
import {handleReleases} from '../server/releases.mjs';
const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
const json=d=>new Response(JSON.stringify(d));
async function setup(run){const runtime=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2025-10-01',d1Databases:['DB'],r2Buckets:['BUCKET']});try{
 const env={DB:await runtime.getD1Database('DB'),BUCKET:await runtime.getR2Bucket('BUCKET'),RUNNINGHUB_CN_API_KEY:'mock-cn',RUNNINGHUB_AI_API_KEY:'mock-ai'};
 for(const name of(await readdir(new URL('../drizzle',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){const sql=await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8');await env.DB.batch(sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>env.DB.prepare(s)));}
 const auth=user=>({'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@test.local'});
 for(const user of['alice','bob'])await handleLibrary(new Request('https://site.test/api/account',{headers:auth(user)}),env);
 const job='00000000-0000-4000-8000-000000000001';
 await env.DB.prepare('INSERT INTO generations (id,owner,request_key,provider,input,status,asset_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(job,'alice','music-original','cn',JSON.stringify({title:'雨夜来信',styles:'lo-fi, piano',lyrics:'[Verse]\n雨落窗前',description:'深夜的回忆'}),'succeeded','music',new Date().toISOString(),new Date().toISOString()).run();
 await env.DB.prepare('INSERT INTO documents (owner,namespace,data,updated_at) VALUES (?,?,?,?)').bind('alice','workspace',JSON.stringify({albums:[{id:'album-test',title:'海岸',description:'日落的故事',tracks:[]}]}),new Date().toISOString()).run();
 const req=(path='',body,method=body?'POST':'GET',user='alice')=>new Request('https://site.test/api/covers'+path,{method,headers:{...(user?auth(user):{}),'Content-Type':method==='PUT'?'image/png':'application/json'},...(body?{body:method==='PUT'?body:JSON.stringify(body)}:{})});
 await run({env,req,job,auth});
 }finally{await runtime.dispose();}}
test('工作流映射、主题备用封面和上传格式校验',()=>{assert.equal(coverNodes('prompt')[0].nodeId,'98');assert.equal(coverNodes('prompt')[0].fieldName,'text_b');assert.equal(fallbackCover({title:'海边日落'}),'covers/folk.webp');assert.equal(fallbackCover({styles:'cinematic'}),'covers/cinematic.webp');assert.equal(fallbackCover({title:'雨夜',styles:'electronic pop'}),'covers/electronic.webp');assert.equal(fallbackCover({styles:'warm jazz, piano'}),'covers/jazz.webp');assert.equal(fallbackCover({styles:'alternative rock'}),'covers/rock.webp');assert.equal(imageType(png),'image/png');assert.throws(()=>imageType(new TextEncoder().encode('<svg></svg>')));});

test('Studio 翻唱封面使用新曲名、修改后的歌词和后台构思风格，自动提交幂等并保留上传封面',async()=>setup(async({env,req,job})=>{
 const input={model:'yue2-cover',title:'夜航的新灯',lyrics:'[Verse 1]\n新灯照着我的归程',styles:'',coverStyles:'warm jazz, piano and upright bass',sourceName:'原歌曲.mp3'};
 await env.DB.prepare('UPDATE generations SET input=? WHERE id=?').bind(JSON.stringify(input),job).run();env.DEEPSEEK_API_KEY='mock-deepseek';let plans=0,runs=0;
 const fake=async(url,options)=>{const body=JSON.parse(options.body);if(url==='https://api.deepseek.com/chat/completions'){plans++;const prompt=JSON.parse(body.messages[1].content);assert.equal(prompt.context.title,input.title);assert.equal(prompt.context.styles,input.coverStyles);assert.equal(prompt.context.lyrics,input.lyrics);return json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({text:'Square photograph of a lantern by a jazz piano, amber light, deep blue night, no typography, no logo, no watermark.'})}}]});}runs++;return json({code:0,data:{taskId:'studio-art'}});};
 const body={requestKey:'auto-'+job,auto:true};const {cover}=await(await handleCovers(req('/song/'+job,body),env,fake)).json();assert.equal(cover.art,'covers/jazz.webp');assert.equal(cover.status,'queued');
 await handleCovers(req('/song/'+job,body),env,fake);assert.equal(plans,1);assert.equal(runs,1);
 const uploaded=(await(await handleCovers(req('/song/'+job,png,'PUT'),env,fake)).json()).cover;assert.equal(uploaded.status,'succeeded');assert.match(uploaded.art,/api\/assets\/cover-/);
 const restored=(await(await handleCovers(req('/song/'+job,body),env,fake)).json()).cover;assert.equal(restored.art,uploaded.art);assert.equal(plans,1);assert.equal(runs,1);
}));
test('封面两站调度、幂等、同步保存、上传覆盖和发布封面权限',async()=>setup(async({env,req,job,auth})=>{
 let runs=0,downloads=0;
 const fake=async(url,options)=>{if(url.endsWith('/ai-app/run')){runs++;const body=JSON.parse(options.body);assert.match(body.nodeInfoList[0].fieldValue,/雨夜来信/);assert.equal(body.nodeInfoList[1].fieldValue,'1:1 (Square)');if(runs===1)return json({code:429});assert.equal(body.webappId,'2107460374575480833');return json({code:0,data:{taskId:'cover-ai'}});}if(url.endsWith('/v2/query')){assert.match(url,/runninghub.ai/);return json({status:'SUCCESS',results:[{nodeId:'95',url:'https://images.test/cover.png'}]});}downloads++;assert.equal(options.redirect,'manual');return new Response(png);};
 const body={requestKey:'auto-'+job,auto:true};
 assert.equal((await handleCovers(req('/song/'+job,body,'POST','bob'),env,fake)).status,404);
 const first=(await(await handleCovers(req('/song/'+job,body),env,fake)).json()).cover;assert.equal(first.status,'queued');assert.equal(runs,2);
 await handleCovers(req('/song/'+job,body),env,fake);assert.equal(runs,2);
 const done=(await(await handleCovers(req('/'+first.id+'/sync',{}),env,fake)).json()).cover;assert.equal(done.status,'succeeded');assert.match(done.art,/api\/assets\/cover-/);assert.equal(downloads,1);
 const ownRequest=path=>new Request('https://site.test'+path,{headers:auth('alice')});assert.deepEqual(new Uint8Array(await(await handleLibrary(ownRequest(done.art),env)).arrayBuffer()),png);
 assert.equal((await handleLibrary(new Request('https://site.test'+done.art,{headers:auth('bob')}),env)).status,404);
 await env.DB.prepare('INSERT INTO assets (id,owner,object_key,name,mime,bytes,kind,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind('music','alice','test/music','music.mp3','audio/mpeg',10,'music','ready',new Date().toISOString()).run();await env.BUCKET.put('test/music',new Uint8Array([73,68,51,4,0,0,0,0,0,0]));
 const published=await(await handleReleases(new Request('https://site.test/api/releases/'+job,{method:'POST',headers:auth('alice')}),env)).json();assert.equal(published.track.art,'/api/releases/'+job+'/cover');assert.deepEqual(new Uint8Array(await(await handleReleases(new Request('https://site.test'+published.track.art),env)).arrayBuffer()),png);
 const upload=(await(await handleCovers(req('/song/'+job,png,'PUT'),env,fake)).json()).cover;assert.notEqual(upload.id,first.id);assert.equal(upload.status,'succeeded');
 assert.equal((await handleCovers(req('/album/album-test',new TextEncoder().encode('<svg>'),'PUT'),env,fake)).status,400);
 const album=(await(await handleCovers(req('/album/album-test',png,'PUT'),env,fake)).json()).cover;assert.equal(album.targetType,'album');assert.equal(album.status,'succeeded');
}));
test('两站满载立即降级，不提交生成；自动请求不覆盖用户上传',async()=>setup(async({env,req,job})=>{
 for(const provider of['cn','ai'])for(let i=0;i<3;i++)await env.DB.prepare('INSERT INTO generations (id,owner,request_key,provider,input,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(provider+i,'bob',provider+i,provider,'{}','running',new Date().toISOString(),new Date().toISOString()).run();
 let calls=0;const fake=async()=>{calls++;throw Error('should not call');};
 const result=(await(await handleCovers(req('/song/'+job,{requestKey:'auto-'+job,auto:true}),env,fake)).json()).cover;assert.equal(result.status,'fallback');assert.equal(result.art,'covers/lofi.webp');assert.equal(calls,0);
 const uploaded=(await(await handleCovers(req('/song/'+job,png,'PUT'),env,fake)).json()).cover;
 const again=(await(await handleCovers(req('/song/'+job,{requestKey:'auto-'+job,auto:true}),env,fake)).json()).cover;assert.equal(again.id,uploaded.id);assert.equal(calls,0);
}));

test('单曲和专辑的自定义描述进入实际图片节点，空描述回到自动设计，无效描述不提交',async()=>setup(async({env,req,job})=>{
 const submitted=[];
 const fake=async(url,options)=>{assert.ok(url.endsWith('/ai-app/run'));const body=JSON.parse(options.body);submitted.push(body.nodeInfoList[0].fieldValue);return json({code:0,data:{taskId:'custom-cover-'+submitted.length}});};
 const custom='橙色星球漂浮在蓝色海面上，极简摄影与柔和光影。';
 const body={requestKey:'manual-song-cover-001',prompt:'  '+custom+'  '};
 assert.equal((await handleCovers(req('/song/'+job,body,'POST','bob'),env,fake)).status,404);
 const song=await handleCovers(req('/song/'+job,body),env,fake);assert.equal(song.status,202);
 assert.ok(submitted[0].endsWith(custom));assert.ok(!submitted[0].includes('雨夜来信'));
 const stored=await env.DB.prepare('SELECT prompt FROM covers WHERE target_id=?').bind(job).first();assert.equal(stored.prompt,submitted[0]);
 await handleCovers(req('/song/'+job,body),env,fake);assert.equal(submitted.length,1);
 for(const prompt of [null,123,{},'蓝'.repeat(2001)]){
  assert.equal((await handleCovers(req('/album/album-test',{requestKey:'invalid-cover-request',prompt}),env,fake)).status,400);
 }
 assert.equal((await handleCovers(req('/album/album-test',{requestKey:'oversized-cover-request',prompt:'蓝'.repeat(6000)}),env,fake)).status,400);assert.equal(submitted.length,1);
 const longPrompt='蓝'.repeat(2000);
 assert.equal((await handleCovers(req('/album/album-test',{requestKey:'manual-album-cover-001',prompt:longPrompt}),env,fake)).status,202);
 assert.ok(submitted[1].endsWith(longPrompt));assert.equal(submitted.length,2);
 await env.DB.prepare("UPDATE covers SET status='fallback' WHERE target_id=?").bind(job).run();
 assert.equal((await handleCovers(req('/song/'+job,{requestKey:'manual-blank-cover-001',prompt:'  '}),env,fake)).status,202);
 assert.match(submitted[2],/雨夜来信/);assert.match(submitted[2],/lo-fi, piano/);
}));

test('DeepSeek 为专辑设计视觉提示词，实际提交专业提示词且重复提交不重新规划',async()=>setup(async({env,req})=>{
 env.DEEPSEEK_API_KEY='mock-deepseek';let plans=0,runs=0;
 const professional='Square editorial photograph of a lone figure on an orange shoreline, blue twilight, off-center composition, fine grain, soft rim light, no text, no typography, no logo, no watermark.';
 const fake=async(url,options)=>{
  const body=JSON.parse(options.body);
  if(url==='https://api.deepseek.com/chat/completions'){
   plans++;assert.match(body.messages[0].content,/艺术总监/);assert.match(body.messages[0].content,/不得把歌名或歌词作为画中文字/);
   const brief=JSON.parse(body.messages[1].content);assert.equal(brief.context.title,'海岸');assert.equal(brief.text,'蓝橙海岸摄影');
   return json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({text:professional})}}]});
  }
  runs++;assert.equal(body.nodeInfoList[0].fieldValue,professional);return json({code:0,data:{taskId:'album-art'}});
 };
 const body={requestKey:'professional-album-001',prompt:'蓝橙海岸摄影'};
 assert.equal((await handleCovers(req('/album/album-test',body),env,fake)).status,202);
 assert.equal((await handleCovers(req('/album/album-test',body),env,fake)).status,200);
 assert.equal(plans,1);assert.equal(runs,1);
 const stored=await env.DB.prepare('SELECT prompt FROM covers WHERE target_id=?').bind('album-test').first();assert.equal(stored.prompt,professional);
}));
