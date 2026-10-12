import test from 'node:test';
import assert from 'node:assert/strict';
import {alignmentItems,validateStructuredLyrics,organizeLyrics} from '../server/lyrics-structure.mjs';

test('Qwen alignment normalizes nested words, keeps timing precision and rejects invalid timestamps',()=>{
 const words=[{text:'风',start_time:0.12,end_time:0.4},{text:'再次吹过',start_time:2,end_time:3.01}];
 assert.deepEqual(alignmentItems('```json\n'+JSON.stringify({time_stamps:{items:words}})+'\n```'),[{text:'风',start:0.12,end:0.4},{text:'再次吹过',start:2,end:3.01}]);
 assert.deepEqual(alignmentItems(JSON.stringify({segments:[{words}]})),alignmentItems(JSON.stringify(words)));
 for(const value of ['bad','[]',JSON.stringify([{text:'风',start:-1,end:1}]),JSON.stringify([{text:'风',start:2,end:1}]),JSON.stringify([{text:'风',start:2,end:3},{text:'雨',start:1,end:2}]),JSON.stringify([{text:'风',start:'0',end:2}])])assert.throws(()=>alignmentItems(value));
});
test('Lyric validation preserves repeated choruses and punctuation, allows only layout and known section labels',()=>{
 const raw='风吹过，夜未央。\n让音乐响起！让音乐响起！';
 const result='[Verse 1]\n风吹过，\n夜未央。\n\n[Chorus]\n让音乐响起！\n\n[Chorus]\n让音乐响起！';
 assert.equal(validateStructuredLyrics(raw,result),result);
 for(const value of ['[Verse 1]\n风吹过，夜未央。\n[Chorus]\n让音乐响起！',result.replace('风','雨'),result.replace('，',''),result+'\n这是整理后的歌词',result.replace('[Verse 1]','[自由发挥]')])assert.throws(()=>validateStructuredLyrics(raw,value));
 assert.equal(validateStructuredLyrics('[Verse]\n原歌词','[Verse 1]\n原歌词'),'[Verse 1]\n原歌词');
});
test('DeepSeek receives raw lyrics plus timestamps and returns validated, separately saved lyrics',async()=>{
 const input={inferredLyrics:'风吹过夜未央',lyricsTimestamps:[{text:'风吹过',start:1,end:2},{text:'夜未央',start:3,end:4}],abcNotation:'X:1\nK:C'};
 let calls=0;
 const result=await organizeLyrics(input,{DEEPSEEK_API_KEY:'test-private'},async(url,options)=>{
  calls++;assert.equal(url,'https://api.deepseek.com/chat/completions');const body=JSON.parse(options.body),context=JSON.parse(body.messages[1].content);
  assert.equal(body.response_format.type,'json_object');assert.equal(context.rawLyrics,input.inferredLyrics);assert.deepEqual(context.timestamps,input.lyricsTimestamps);assert.match(body.messages[0].content,/重复/);
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({lyrics:'[Verse 1]\n风吹过\n夜未央'})}}]});
 });
 assert.equal(calls,1);assert.equal(result.inferredLyrics,input.inferredLyrics);assert.equal(result.abcNotation,input.abcNotation);assert.equal(result.structuredLyrics,'[Verse 1]\n风吹过\n夜未央');assert.equal(result.lyricsArrangement.timed,true);assert.equal(result.lyricsArrangement.status,'succeeded');
});
test('Unavailable, incomplete or rewritten AI output retains ASR text with a safe retry message',async()=>{
 const input={inferredLyrics:'原文原文'};
 const rewrite=await organizeLyrics(input,{DEEPSEEK_API_KEY:'secret'},async()=>Response.json({choices:[{message:{content:'{"lyrics":"原文"}'},finish_reason:'stop'}]}));
 assert.equal(rewrite.lyricsArrangement.status,'failed');assert.equal(rewrite.inferredLyrics,input.inferredLyrics);assert.equal(rewrite.structuredLyrics,undefined);
 const outage=await organizeLyrics(input,{DEEPSEEK_API_KEY:'secret'},async()=>{throw Error('secret upstream exception');});assert.doesNotMatch(outage.lyricsArrangement.message,/secret/);
 const incomplete=await organizeLyrics(input,{DEEPSEEK_API_KEY:'secret'},async()=>Response.json({choices:[{message:{content:'{"lyrics":"原文原文"}'},finish_reason:'length'}]}));assert.equal(incomplete.lyricsArrangement.status,'failed');
 const unavailable=await organizeLyrics(input,{},()=>{throw Error('Must not call');});assert.equal(unavailable.lyricsArrangement.status,'unavailable');
 assert.equal((await organizeLyrics({inferredLyrics:''},{},()=>{throw Error('Must not call');})).lyricsArrangement.status,'empty');
});
