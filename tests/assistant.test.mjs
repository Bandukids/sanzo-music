import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAssistant } from '../server/assistant.mjs';
import worker from '../worker/index.js';
const env = { DEEPSEEK_API_KEY: 'test-server-only-secret' };
const input = { action: 'polish', kind: 'songs', text: '雨天的钢琴歌曲' };
const request = (body=input, headers={}) => new Request('https://sanzo.example/api/assistant', { method:'POST', headers:{'content-type':'application/json',origin:'https://sanzo.example',...headers}, body:JSON.stringify(body) });
const completion = result => new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]}));

test('风格输出超长、JSON不完整或被截断时修正一次，保留原始要求且仍执行长度限制',async()=>{
 const body={action:'polish',kind:'songs',target:'styles',text:'温暖女声爵士，90 BPM',context:{musicModel:'yue2',language:'ja',description:'夜晚重逢',lyrics:'[Verse 1]\n君とまた会う'}};
 for(const bad of [completion({text:'x'.repeat(1001)}),new Response(JSON.stringify({choices:[{message:{content:'{"text":'},finish_reason:'stop'}]})),new Response(JSON.stringify({choices:[{finish_reason:'length'}]}))]){
  let calls=0;const signals=[];
  const r=await handleAssistant(request(body),env,{rateLimit:false,fetchImpl:async(url,options)=>{const payload=JSON.parse(options.body),input=JSON.parse(payload.messages[1].content);signals.push(options.signal);assert.equal(input.context.description,'夜晚重逢');assert.equal(input.text,body.text);assert.equal(input.context.language,'ja');calls++;if(calls===1)return bad;assert.match(payload.messages[0].content,/上次/);return completion({text:'Warm female jazz vocals in Japanese, 90 BPM, piano and upright bass.'});}});
  assert.equal(r.status,200);assert.equal(calls,2);assert.equal(signals[0],signals[1]);assert.match((await r.json()).result.text,/90 BPM/);
 }
 let calls=0;const invalid=await handleAssistant(request(body),env,{rateLimit:false,fetchImpl:async()=>{calls++;return completion({text:'x'.repeat(1001)});}});assert.equal(invalid.status,502);assert.equal(calls,2);
 calls=0;const busy=await handleAssistant(request(body),env,{rateLimit:false,fetchImpl:async()=>{calls++;return new Response(null,{status:429});}});assert.equal(busy.status,429);assert.equal(calls,1);
});

test('voice design polish edits the voice profile and enforces its own input limit',async()=>{
 const input={action:'polish',kind:'speech',target:'voice-description',text:'低沉温暖的成年男声，语气舒缓'};
 let calls=0;
 const options={rateLimit:false,fetchImpl:async(url,options)=>{
  calls++;const messages=JSON.parse(options.body).messages;
  assert.match(messages[0].content,/音色设计/);
  assert.match(messages[0].content,/不要创作、修改或返回要说的话/);
  assert.equal(JSON.parse(messages[1].content).target,'voice-description');
  return completion({text:'温暖低沉的成年男声，略带沙哑，气息平稳，咬字清晰，语速舒缓。'});
 }};
 const response=await handleAssistant(request(input),env,options);
 assert.equal(response.status,200);assert.match((await response.json()).result.text,/成年男声/);
 assert.equal((await handleAssistant(request({...input,text:'长'.repeat(501)}),env,options)).status,400);
 assert.equal((await handleAssistant(request({...input,kind:'sounds'}),env,options)).status,400);
 assert.equal(calls,1);
});

test('rejects cross-origin and invalid input before spending API tokens',async()=>{
 let calls=0;const options={rateLimit:false,fetchImpl:()=>{calls++;throw new Error('Must not call upstream');}};
 for(const [req,status] of [[request(input,{origin:'https://other.example'}),403],[request({...input,text:'长'.repeat(501)}),400],[request({...input,kind:'sounds',action:'lyrics'}),400],[request(input,{'content-type':'text/plain'}),415]])assert.equal((await handleAssistant(req,env,options)).status,status);
 assert.equal(calls,0);
});
test('the credential reaches only the provider header, never the client response or model prompt',async()=>{
 let body;
 const result=await handleAssistant(request({...input,model:'caller-controlled'}),env,{rateLimit:false,fetchImpl:async(url,options)=>{
  assert.equal(url,'https://api.deepseek.com/chat/completions');
  assert.equal(options.headers.Authorization,'Bearer '+env.DEEPSEEK_API_KEY);
  assert.ok(!options.body.includes(env.DEEPSEEK_API_KEY));body=JSON.parse(options.body);
  return completion({text:'温柔钢琴与细雨环境声，缓慢而治愈。'});
 }});
 assert.equal(body.model,'deepseek-flash');assert.equal(body.thinking.type,'disabled');
 assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');
 const payload=await result.text();assert.ok(!payload.includes(env.DEEPSEEK_API_KEY));assert.ok(JSON.parse(payload).result.text);
});
test('provider failures are localized without forwarding secret-bearing bodies',async()=>{
 for(const [status,code] of [[401,'AUTH'],[402,'BALANCE'],[429,'UPSTREAM_BUSY'],[500,'UPSTREAM']]){
  const result=await handleAssistant(request(),env,{rateLimit:false,fetchImpl:async()=>new Response(env.DEEPSEEK_API_KEY,{status})});
  const payload=await result.json();assert.equal(payload.error.code,code);assert.ok(!JSON.stringify(payload).includes(env.DEEPSEEK_API_KEY));
 }
 assert.equal((await handleAssistant(request(),{},{rateLimit:false})).status,503);
});
test('incomplete or oversized provider output is never inserted into the editor',async()=>{
 const responses=[new Response('not json'),completion({text:'长'.repeat(501)}),new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{"text":"unfinished'}}]}))];
 for(const response of responses)assert.equal((await handleAssistant(request(),env,{rateLimit:false,fetchImpl:async()=>response})).status,502);
});
test('song plans contain bounded fields and instrumental plans never acquire lyrics',async()=>{
 const plan={description:'舒缓钢琴，适合雨夜。',styles:'piano, warm, slow',lyrics:'[主歌]\n雨落在窗边',title:'雨夜'};
 const result=await handleAssistant(request({action:'brief',kind:'songs',text:'纯音乐钢琴',context:{instrumental:true}}),env,{rateLimit:false,fetchImpl:async()=>completion(plan)});
 assert.equal(result.status,200);assert.equal((await result.json()).result.lyrics,'');
 assert.equal((await handleAssistant(request({action:'brief',kind:'songs',text:'夜晚'}),env,{rateLimit:false,fetchImpl:async()=>completion({...plan,lyrics:''})})).status,502);
});
test('vocal song plans require sung verse and chorus sections, while description polish keeps its own task',async()=>{
 const plan={description:'雨夜开车，温柔而自由。',styles:'dream pop, 90 BPM, warm bass, airy female vocal',lyrics:'[Verse 1]\n霓虹落在你的窗边\n[Chorus]\n让风带我走过长夜\n[Bridge]\n远方还有光',title:'长夜的光'};
 for(const lyrics of [plan.lyrics,'[主歌]\n霓虹落在你的窗边\n[副歌]\n让风带我走过长夜']){
  const response=await handleAssistant(request({action:'brief',kind:'songs',text:'深夜驾车的中文歌'}),env,{rateLimit:false,fetchImpl:async(url,options)=>{
   const instructions=JSON.parse(options.body).messages[0].content;
   assert.ok(instructions.includes('[Verse 1]'));assert.ok(instructions.includes('[Chorus]'));
   return completion({...plan,lyrics});
  }});
  assert.equal(response.status,200);assert.equal((await response.json()).result.lyrics,lyrics);
 }
 for(const lyrics of ['仅仅扩写了一段歌曲描述。','[Verse 1]\n只有主歌','[Verse 1]\n[Chorus]\n没有主歌唱词']){
  const response=await handleAssistant(request({action:'brief',kind:'songs',text:'深夜驾车的中文歌'}),env,{rateLimit:false,fetchImpl:async()=>completion({...plan,lyrics})});
  assert.equal(response.status,502);
 }
 await handleAssistant(request(),env,{rateLimit:false,fetchImpl:async(url,options)=>{
  assert.ok(JSON.parse(options.body).messages[0].content.includes('不要生成歌词'));
  return completion({text:'缓慢的钢琴流行曲，温暖而治愈。'});
 }});
});
test('the worker routes static assets separately from the private AI endpoint',async()=>{
 let assetCalls=0;
 const response=await worker.fetch(new Request('https://sanzo.example/explore/'),{ASSETS:{fetch:async()=>{assetCalls++;return new Response('Explore');}}});
 assert.equal(await response.text(),'Explore');assert.equal(assetCalls,1);
 assert.equal((await worker.fetch(new Request('https://sanzo.example/api/unknown'),{})).status,404);
});
test('simple song polish returns description and styles together and respects vocal-only settings',async()=>{
 const body={action:'polish-song',kind:'songs',text:'一首关于雨后出发的温暖歌曲',context:{gender:'female',backgroundMusic:false}};
 const refined={text:'温柔女声清唱雨后的希望与重新出发，旋律轻快，表达自然而温暖。',styles:'a cappella, solo female vocal, warm, hopeful, no instrumental backing'};
 const result=await handleAssistant(request(body),env,{rateLimit:false,fetchImpl:async(url,options)=>{
  const messages=JSON.parse(options.body).messages;
  assert.ok(messages[0].content.includes('必须只保留人声清唱'));assert.ok(messages[0].content.includes('明确使用女声演唱'));
  const context=JSON.parse(messages[1].content).context;assert.equal(context.backgroundMusic,false);assert.equal(context.gender,'female');
  return completion(refined);
 }});
 assert.equal(result.status,200);assert.deepEqual((await result.json()).result,refined);
 for(const output of [{text:refined.text},{...refined,styles:''},{...refined,styles:'长'.repeat(1001)},{...refined,text:'长'.repeat(501)}]){
  assert.equal((await handleAssistant(request(body),env,{rateLimit:false,fetchImpl:async()=>completion(output)})).status,502);
 }
});
test('invalid song option combinations are rejected before a provider call',async()=>{
 let calls=0;
 const options={rateLimit:false,fetchImpl:async()=>{calls++;return completion({text:'内容',styles:'pop'});}};
 const song={action:'polish-song',kind:'songs',text:'雨后的歌'};
 for(const body of [{...song,context:{gender:'invalid'}},{...song,context:{backgroundMusic:'false'}},{...song,context:{backgroundMusic:false,instrumental:true}},{...song,target:'lyrics'},{...song,kind:'speech'},{...song,text:'   '}]){
  assert.equal((await handleAssistant(request(body),env,options)).status,400);
 }
 assert.equal(calls,0);
});

test('double-escaped provider lyric line breaks become real sung sections',async()=>{
 const lyrics='[Verse 1]\\n海风吹过路灯\\n\\n[Chorus]\\n向着黎明出发';
 const plan={description:'海边出发的歌',styles:'dream pop, 95 BPM',title:'沿海黎明',lyrics};
 const result=await handleAssistant(request({action:'brief',kind:'songs',text:'沿海公路的夜晚'}),env,{rateLimit:false,fetchImpl:async()=>completion(plan)});
 assert.equal(result.status,200);assert.equal((await result.json()).result.lyrics,lyrics.replace(/\\n/g,'\n'));
 const written=await handleAssistant(request({action:'lyrics',kind:'songs',text:'沿海的歌'}),env,{rateLimit:false,fetchImpl:async()=>completion({text:lyrics})});
 assert.equal(written.status,200);assert.equal((await written.json()).result.text.includes('\\n'),false);
 const bad={...plan,lyrics:'[Verse 1]\\n\\n[Chorus]\\n只有副歌'};
 assert.equal((await handleAssistant(request({action:'brief',kind:'songs',text:'沿海'}),env,{rateLimit:false,fetchImpl:async()=>completion(bad)})).status,502);
});

test('AI 时长编排拒绝越界、非整数和缺失速度，不影响歌词文本生成',async()=>{
 const body={action:'timing',kind:'songs',text:'沿海公路',context:{lyrics:'[Verse]\n出发\n[Chorus]\n海风',styles:'piano, 72 BPM'}};
 const good=await handleAssistant(request(body),env,{rateLimit:false,fetchImpl:async()=>completion({duration:165,bpm:72})});
 assert.deepEqual((await good.json()).result,{duration:165,bpm:72});
 for(const output of [{duration:0,bpm:72},{duration:241,bpm:72},{duration:135.5,bpm:72},{duration:165},{duration:165,bpm:500}])assert.equal((await handleAssistant(request(body),env,{rateLimit:false,fetchImpl:async()=>completion(output)})).status,502);
});

test('歌词译配使用目标语言，保留标签并拒绝无效或缺少段落的结果',async()=>{
 const lyrics='[Verse 1]\n雨落窗前\n\n[Chorus]\n等你回来';
 const body={action:'translate',kind:'songs',target:'lyrics',text:lyrics,context:{language:'en'}};
 let calls=0;
 const options={rateLimit:false,fetchImpl:async(url,options)=>{
  calls++;const messages=JSON.parse(options.body).messages;
  assert.match(messages[0].content,/英语/);assert.match(messages[0].content,/保留所有方括号段落标签/);
  assert.equal(JSON.parse(messages[1].content).text,lyrics);
  return completion({text:'[Verse 1]\nRain falls by the window\n\n[Chorus]\nI wait for you to come home'});
 }};
 assert.equal((await handleAssistant(request(body),env,options)).status,200);
 for(const language of ['auto','xx',null])assert.equal((await handleAssistant(request({...body,context:{language}}),env,options)).status,400);
 assert.equal((await handleAssistant(request({...body,text:''}),env,options)).status,400);
 assert.equal((await handleAssistant(request({...body,text:'长'.repeat(5001)}),env,options)).status,400);
 assert.equal(calls,1);
 const missing={rateLimit:false,fetchImpl:async()=>completion({text:'[Verse 1]\nRain falls'})};
 assert.equal((await handleAssistant(request(body),env,missing)).status,502);
});

test('AI 选择的有效调性进入 ACE，截图外的调性被拒绝',async()=>{
 const input={action:'timing',kind:'songs',text:'夜色中的流行歌曲'};
 const valid=await handleAssistant(request(input),env,{rateLimit:false,fetchImpl:async()=>completion({duration:90,bpm:100,keyscale:'Ab major'})});
 assert.equal(valid.status,200);assert.equal((await valid.json()).result.keyscale,'Ab major');
 const invalid=await handleAssistant(request(input),env,{rateLimit:false,fetchImpl:async()=>completion({duration:90,bpm:100,keyscale:'H minor'})});
 assert.equal(invalid.status,502);
});

test('MiniMax 写词采用短歌结构，ACE 和翻译保持原来的任务规则',async()=>{
 const lyrics='[Verse 1]\n雨落窗前\n[Chorus]\n等你回来';
 for(const musicModel of ['minimax-music','ace-step'])for(const action of ['brief','lyrics','translate']){
  const body={action,kind:'songs',target:'lyrics',text:'雨夜思念',context:{musicModel,language:'zh'}};
  const result=action==='brief'?{description:'雨夜思念',styles:'piano',lyrics,title:'夜信'}:{text:lyrics};
  if(action==='translate')body.text=lyrics;
  const response=await handleAssistant(request(body),env,{rateLimit:false,fetchImpl:async(url,options)=>{
   const system=JSON.parse(options.body).messages[0].content;
   if(musicModel==='minimax-music'&&action!=='translate'){assert.match(system,/唱词合计8至12行/);assert.match(system,/只保留一个\[Verse 1\]和一个\[Chorus\]/);}
   else assert.doesNotMatch(system,/唱词合计8至12行/);
   return completion(result);
  }});
  assert.equal(response.status,200);
 }
});

test('越南语和俄语均支持歌词翻译及 AI 写词',async()=>{
 const lyrics='[Verse 1]\n一阵风\n[Chorus]\n一起唱';
 for(const [language,label]of [['vi','越南语'],['ru','俄语']])for(const action of ['translate','brief']){
  const result=action==='brief'?{description:'一阵风',styles:'piano',lyrics,title:'风'}:{text:lyrics};
  const r=await handleAssistant(request({action,kind:'songs',target:'lyrics',text:lyrics,context:{language}}),env,{rateLimit:false,fetchImpl:async(url,options)=>{
   assert.match(JSON.parse(options.body).messages[0].content,new RegExp(label));return completion(result);
  }});assert.equal(r.status,200);
 }
});


test('音乐描述指导覆盖三个创作入口，并保留模型、语言和高级约束',async()=>{
 for(const musicModel of ['minimax-music','yue2','ace-step'])for(const action of ['brief','styles','polish']){
  const context={musicModel,language:'ru',gender:'female',requestedBpm:'128',keyscale:'Db minor',timesignature:'6',lyrics:'[Verse 1]\n测试\n[Chorus]\n测试'};
  const body={action,kind:'songs',target:action==='polish'?'styles':'description',text:'温暖的流行歌曲',context};
  const response=await handleAssistant(request(body),env,{rateLimit:false,fetchImpl:async(url,options)=>{
   const messages=JSON.parse(options.body).messages,system=messages[0].content;
   for(const token of ['Genre','Vocals','Language','Tempo','Instruments','128 BPM','Db minor','6/8','俄语','female vocal'])assert.ok(system.includes(token),token);
   if(musicModel==='minimax-music')assert.match(system,/Global Metadata:.*Vocal Details:.*Arrangement:/);
   if(musicModel==='yue2')assert.match(system,/YUE2 使用紧凑连贯/);
   return completion(action==='brief'?{description:'温暖流行',styles:'Mandopop, warm vocals',lyrics:'[Verse 1]\n测试\n[Chorus]\n测试',title:'测试'}:{text:'Pop, warm vocals'});
  }});
  assert.equal(response.status,200);
 }
});
test('纯音乐指导明确不添加人声或演唱语言，非法高级参数不花费 token',async()=>{
 await handleAssistant(request({action:'styles',kind:'songs',text:'钢琴',context:{instrumental:true,musicModel:'minimax-music'}}),env,{rateLimit:false,fetchImpl:async(url,options)=>{
  assert.match(JSON.parse(options.body).messages[0].content,/不添加演唱语言或任何人声/);return completion({text:'Instrumental piano'});
 }});
 for(const context of [{requestedBpm:300},{requestedBpm:true},{keyscale:'H major'},{timesignature:'9'}])assert.equal((await handleAssistant(request({action:'styles',kind:'songs',text:'流行',context}),env,{rateLimit:false,fetchImpl:()=>{throw Error('must not call');}})).status,400);
});

test('作品命名支持语音、歌曲、纯音乐，限制标题长度',async()=>{
 for(const body of [{action:'name',kind:'speech',target:'speech',text:'欢迎回家',context:{styles:'温暖男声'}},{action:'name',kind:'songs',target:'lyrics',text:'海风吹过',context:{styles:'folk, guitar'}},{action:'name',kind:'songs',target:'lyrics',text:'',context:{styles:'ambient piano',description:'雨夜',instrumental:true}}]){
  const options={rateLimit:false,fetchImpl:async()=>completion({text:'归途微光'})};
  const r=await handleAssistant(request(body),env,options);assert.equal(r.status,200);assert.equal((await r.json()).result.text,'归途微光');
  const tooLong=await handleAssistant(request(body),env,{...options,fetchImpl:async()=>completion({text:'长'.repeat(31)})});assert.equal(tooLong.status,502);
 }
});

test('Index 情绪解析按固定顺序返回独立数值，拒绝非法输入与越界输出',async()=>{
 const body={action:'emotion',kind:'speech',target:'emotion-description',text:'平静温柔，有一点低落，不要愤怒'};
 const vector=[0,0,.1,0,0,.25,0,.6];let calls=0;
 const options={rateLimit:false,fetchImpl:async(url,opts)=>{calls++;const payload=JSON.parse(opts.body);assert.match(payload.messages[0].content,/高兴,愤怒,悲伤,恐惧,反感,低落,惊讶,平静/);assert.match(payload.messages[0].content,/不要归一化/);return completion({emotionVector:vector,summary:'平静为主，带少许低落。'});}};
 const response=await handleAssistant(request(body),env,options);assert.equal(response.status,200);assert.deepEqual((await response.json()).result,{emotionVector:vector,summary:'平静为主，带少许低落。'});
 for(const change of [{text:''},{text:42},{text:'a'.repeat(501)},{kind:'songs'},{target:'speech'}])assert.equal((await handleAssistant(request({...body,...change}),env,options)).status,400);
 assert.equal(calls,1);
 for(const emotionVector of [Array(8).fill(1.1),Array(8).fill(-.1),Array(8).fill('0'),[0]])assert.equal((await handleAssistant(request(body),env,{rateLimit:false,fetchImpl:async()=>completion({emotionVector,summary:'测试'})})).status,502);
});

test('ABC 简单合成命名只返回名称，支持乐谱与来源信息',async()=>{
 const body={action:'name',kind:'abc',target:'abc',text:'X:1\nT:晚风\nM:4/4\nK:C\nC D E F|',context:{description:'晚风，90 BPM，C大调',styles:'piano',instrumental:true}};
 let calls=0;const opts={rateLimit:false,fetchImpl:async(url,options)=>{calls++;const payload=JSON.parse(options.body);assert.match(payload.messages[0].content,/ABC 乐谱片段/);assert.match(payload.messages[0].content,/不改写乐谱/);return completion({text:'晚风小径'});}};
 const response=await handleAssistant(request(body),env,opts);assert.equal(response.status,200);assert.equal((await response.json()).result.text,'晚风小径');
 assert.equal((await handleAssistant(request({...body,text:'x'.repeat(1001)}),env,opts)).status,400);assert.equal(calls,1);
});
