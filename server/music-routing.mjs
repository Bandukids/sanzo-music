// Register each model's verified pair of application IDs here. Secrets stay in env.
export const MUSIC_PROVIDERS=Object.freeze({
 cn:{origin:'https://www.runninghub.cn',secret:'RUNNINGHUB_CN_API_KEY',capacity:3,weight:1},
 ai:{origin:'https://www.runninghub.ai',secret:'RUNNINGHUB_AI_API_KEY',capacity:3,weight:1}
});
export const MUSIC_WORKFLOWS=Object.freeze({
 'yue2-cover':{apps:{cn:'2101611194623807489',ai:'2101611337957187585'},outputNode:'7',outputFormat:'mp3'},
 'cover-inference':{apps:{cn:'2107851228599382017',ai:'2107851452228509697'},textOnly:true,abcNode:'31',lyricsNode:'34',timestampsNode:'40',nodes:{sourceAudio:['30','audio']}},
 'seedvc-speech':{apps:{cn:'2108209006111182850',ai:'2045880827887751169'},outputNode:'30',outputFormat:'mp3',nodes:{sourceAudio:['18','audio'],referenceAudio:['2','audio']}},
 'index-voice-clone':{apps:{cn:'2107769776520122369',ai:'2088285539253633025'},outputNode:'18',nodes:{speechText:['17','text'],referenceAudio:['16','audio']}},
 'qwen-voice-clone':{apps:{cn:'2107755708744818689',ai:'2107755813385740290'},outputNode:'9',nodes:{speechText:['6','text'],referenceAudio:['4','audio']}},
 'qwen-voice-design':{apps:{cn:'2091093839124717570',ai:'2045683032845197314'},outputNode:'17',nodes:{speechText:['15','text'],voiceDescription:['16','text']}},
 'ace-step':{apps:{cn:'2077026060922871809',ai:'2044441753280847873'},duration:{min:30,max:240},outputNode:'38',
  nodes:{styles:['41','text'],lyrics:['40','text'],duration:['43','value'],language:['36','language'],keyscale:['36','keyscale'],timesignature:['36','timesignature'],bpm:['44','value']}},
 'minimax-music':{apps:{cn:'2091156951802662914',ai:'2088299904677462017'},duration:{min:30,max:120},outputNode:'7',captionBpm:true,
  nodes:{styles:['15','text'],lyrics:['16','text'],duration:['14','value']}},
 'yue2-abc':{apps:{cn:'2101473616566243329',ai:'2101472878767497218'},duration:{min:30,max:240},outputNode:'7',abcNode:'22',captionBpm:true,
  nodes:{styles:['15','text'],lyrics:['16','text'],duration:['14','value']},fixedNodes:[{nodeId:'24',fieldName:'value',fieldValue:true}]},
 'yue2':{apps:{cn:'2101473616566243329',ai:'2101472878767497218'},duration:{min:30,max:240},outputNode:'7',captionBpm:true,
  nodes:{styles:['15','text'],lyrics:['16','text'],duration:['14','value']},fixedNodes:[{nodeId:'24',fieldName:'value',fieldValue:false}]}
});
const COOLDOWN=5*60*1000;
export function rankMusicProviders(model,env,stats,excluded=[],now=Date.now()) {
 const workflow=Object.hasOwn(MUSIC_WORKFLOWS,model)?MUSIC_WORKFLOWS[model]:null;if(!workflow)return [];
 return Object.entries(MUSIC_PROVIDERS).filter(([id,p])=>workflow.apps[id]&&env[p.secret]&&!excluded.includes(id)).map(([id,p])=>{
  const state=stats[id]||{},recent=state.recent||[];
  const consecutive=recent.slice(0,3);
  const cooling=consecutive.length===3&&consecutive.every(r=>['failed','unknown'].includes(r.status))&&now-Date.parse(consecutive[0].updated_at)<COOLDOWN;
  const durations=recent.filter(r=>r.status==='succeeded').map(r=>{try{return Number(JSON.parse(r.usage||'null')?.taskCostTime);}catch{return 0;}}).filter(n=>n>0&&n<3600).sort((a,b)=>a-b);
  const latency=durations.length?durations[Math.floor(durations.length/2)]:90;
  const active=Number(state.active)||0;
  return {id,...p,appId:workflow.apps[id],active,cooling,score:(active+1)*Math.max(30,latency)/p.weight,assigned:Number(state.assigned)||0};
 }).filter(p=>!p.cooling&&p.active<p.capacity).sort((a,b)=>a.score-b.score||a.assigned-b.assigned||(a.id==='cn'?-1:1));
}
export async function routingStats(sql) {
 const stats={};
 const history=(await sql('SELECT provider,input,status,usage,updated_at FROM generations ORDER BY created_at DESC LIMIT 100').all()).results;
 for(const id of Object.keys(MUSIC_PROVIDERS)){
  const active=await sql("SELECT ((SELECT COUNT(*) FROM generations WHERE provider=? AND status IN ('submitting','queued','running'))+(SELECT COUNT(*) FROM covers WHERE provider=? AND status IN ('submitting','queued','running'))) AS count",id,id).first();
  const recent=history.flatMap(row=>{
   let attempts;try{attempts=JSON.parse(row.input).routingAttempts;}catch{}
   if(!Array.isArray(attempts))return row.provider===id?[row]:[];
   return attempts.filter(a=>a.provider===id).map(a=>({status:a.outcome==='rejected'?'failed':a.outcome==='unknown'?'unknown':row.status,usage:row.provider===id?row.usage:null,updated_at:a.outcome==='accepted'?row.updated_at:a.at}));
  }).slice(0,12);
  stats[id]={active:active.count,assigned:recent.length,recent};
 }
 return stats;
}
