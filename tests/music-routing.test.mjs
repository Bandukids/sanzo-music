import test from 'node:test';
import assert from 'node:assert/strict';
import { rankMusicProviders, routingStats, MUSIC_WORKFLOWS } from '../server/music-routing.mjs';
import { musicInput, planMusicTiming, nodeInfoList } from '../server/generations.mjs';
const env={RUNNINGHUB_CN_API_KEY:'cn',RUNNINGHUB_AI_API_KEY:'ai',DEEPSEEK_API_KEY:'deepseek'};
const sample={model:'ace-step',styles:'slow piano, 72 BPM',lyrics:'[Verse 1]\n海风\n[Chorus]\n重新出发',title:'海风'};
test('渠道统计并行读取两份数据，保留跨渠道拒绝、成功与旧任务的历史',async()=>{
 const calls=[],history=[{provider:'ai',status:'succeeded',usage:'{"taskCostTime":60}',updated_at:'new',input:JSON.stringify({routingAttempts:[{provider:'cn',outcome:'rejected',at:'rejected'},{provider:'ai',outcome:'accepted'}]})},{provider:'cn',status:'running',usage:null,updated_at:'old',input:'{}'}];
 const stats=await routingStats(query=>({all:async()=>{calls.push(query);return {results:query.includes('COUNT(*)')?[{provider:'cn',count:3},{provider:'ai',count:1}]:history};}}));
 assert.equal(calls.length,2);assert.equal(stats.cn.active,3);assert.equal(stats.ai.active,1);assert.equal(stats.cn.assigned,2);assert.equal(stats.ai.assigned,1);assert.equal(stats.cn.recent[0].status,'failed');assert.equal(stats.cn.recent[0].usage,null);assert.equal(stats.cn.recent[0].updated_at,'rejected');assert.equal(stats.ai.recent[0].usage,history[0].usage);assert.equal(stats.cn.recent[1].status,'running');
});
test('后台选择已配置渠道，避开占满和冷却渠道，考虑成功耗时和任务负载',()=>{
 const ranks=(stats={},config=env,excluded=[])=>rankMusicProviders('ace-step',config,stats,excluded);
 assert.equal(ranks()[0].id,'cn');
 assert.equal(ranks({}, {...env,RUNNINGHUB_CN_API_KEY:''})[0].id,'ai');
 assert.equal(ranks({cn:{active:3}})[0].id,'ai');
 const success=seconds=>({status:'succeeded',usage:JSON.stringify({taskCostTime:seconds}),updated_at:new Date().toISOString()});
 assert.equal(ranks({cn:{recent:[success(60)]},ai:{recent:[success(120)]}})[0].id,'cn');
 assert.equal(ranks({cn:{active:2,recent:[success(60)]},ai:{recent:[success(120)]}})[0].id,'ai');
 const failures=Array.from({length:3},()=>({status:'failed',updated_at:new Date().toISOString()}));
 assert.equal(ranks({cn:{recent:failures}})[0].id,'ai');
 const expired=failures.map(r=>({...r,updated_at:new Date(Date.now()-6*60000).toISOString()}));
 assert.equal(ranks({cn:{recent:expired}})[0].id,'cn');
 assert.equal(ranks({},env,['cn'])[0].id,'ai');
 assert.equal(rankMusicProviders('unconnected',env,{}).length,0);
 assert.match(MUSIC_WORKFLOWS['ace-step'].apps.cn,/^\d{19}$/);
 assert.equal(rankMusicProviders('minimax-music',env,{cn:{active:3}})[0].appId,'2088299904677462017');
 assert.equal(rankMusicProviders('minimax-music',env,{ai:{active:3}})[0].appId,'2091156951802662914');
 assert.deepEqual(rankMusicProviders('minimax-music',env,{cn:{active:3},ai:{active:3}}),[]);
 assert.deepEqual(rankMusicProviders('toString',env,{}),[]);
});
test('浏览器无法指定渠道、时长或 BPM；AI 根据完整歌词安排时间，不使用静默默认时长',async()=>{
 const input=musicInput(sample);
 assert.deepEqual(musicInput({...sample,provider:'ai',duration:999,bpm:1}),input);
 const result=await planMusicTiming(input,env,async(url,options)=>{
  assert.equal(url,'https://api.deepseek.com/chat/completions');
  const body=JSON.parse(options.body),context=JSON.parse(body.messages[1].content).context;
  assert.equal(context.lyrics,sample.lyrics);assert.equal(context.styles,sample.styles);
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({duration:165,bpm:72})}}]}));
 });
 assert.deepEqual(result,{duration:165,bpm:72});
 await assert.rejects(()=>planMusicTiming(input,env,async()=>new Response('unavailable',{status:503})),/尚未提交音乐生成/);
});

test('MiniMax 的时长规划使用短歌规则，ACE 保留正常长度',async()=>{
 for(const model of ['ace-step','minimax-music']){
  const result=await planMusicTiming(musicInput({...sample,model}),{DEEPSEEK_API_KEY:'mock'},async(url,options)=>{
   const messages=JSON.parse(options.body).messages;
   if(model==='minimax-music')assert.match(messages[0].content,/优先安排60至90秒/);
   else assert.doesNotMatch(messages[0].content,/优先安排60至90秒/);
   return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"duration":75,"bpm":100}'}}]}));
  });
  assert.equal(result.duration,75);
 }
});


test('高级拍号和调式通过 ACE 节点或其他模型的后台风格传递',()=>{
 for(const model of ['ace-step','minimax-music','yue2']){
  const input=musicInput({...sample,model,keyscale:'Db minor',timesignature:'6'});
  const nodes=nodeInfoList({...input,duration:75,bpm:100});
  const styles=nodes.find(n=>n.nodeId===(model==='ace-step'?'41':'15')).fieldValue;
  assert.equal(input.styles,sample.styles);
  if(model==='ace-step'){
   assert.equal(nodes.find(n=>n.fieldName==='keyscale').fieldValue,'Db minor');
   assert.equal(nodes.find(n=>n.fieldName==='timesignature').fieldValue,'6');
   assert.doesNotMatch(styles,/key of|time signature/);
  }else{
   assert.match(styles,/key of Db minor/);assert.match(styles,/6\/8 time signature/);
   const defaults=nodeInfoList({...musicInput({...sample,model}),duration:75,bpm:100});
   assert.doesNotMatch(defaults[0].fieldValue,/key of|time signature/);
  }
 }
 assert.throws(()=>musicInput({...sample,keyscale:'H major'}),/调式/);
 assert.throws(()=>musicInput({...sample,timesignature:'9'}),/拍号/);
});


test('填写 BPM 优先于 AI 速度及原曲风，三个模型按各自方式传递',async()=>{
 for(const model of ['ace-step','minimax-music','yue2']){
  const input=musicInput({...sample,model,requestedBpm:'128',keyscale:'D major'});
  const timing=await planMusicTiming(input,env,async(url,options)=>{
   const context=JSON.parse(options.body).messages[1].content;
   assert.match(context,/128 BPM/);assert.doesNotMatch(context,/72 BPM/);
   return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"duration":75,"bpm":80,"keyscale":"E minor"}'}}]}));
  });
  assert.equal(timing.bpm,128);assert.equal(timing.keyscale,'D major');
  const nodes=nodeInfoList({...input,...timing});
  if(model==='ace-step')assert.equal(nodes.find(n=>n.fieldName==='value'&&n.nodeId==='44').fieldValue,'128');
  else assert.match(nodes[0].fieldValue,/128 BPM/);
  assert.doesNotMatch(nodes[0].fieldValue,/72 BPM/);assert.equal(input.styles,sample.styles);
 }
 assert.equal(musicInput({...sample,requestedBpm:''}).requestedBpm,null);
 for(const requestedBpm of [39,221,80.5,'abc',true,' '])assert.throws(()=>musicInput({...sample,requestedBpm}),/BPM/);
});
