import test from 'node:test';
import assert from 'node:assert/strict';
import {speechCloneInput,speechReference,uploadSpeechReference} from '../server/speech-clone.mjs';
const body={type:'speech',speechModel:'tts',ttsModel:'qwen-tts',speechText:'你好',libraryVoice:'preset:warm'};
test('克隆参数拒绝网址和不支持的模式',()=>{
 for(const change of [{speechText:''},{ttsModel:'unknown-tts'},{speechModel:'rvc'},{libraryVoice:'https://evil.example/a.mp3'},{libraryVoice:'preset:unknown'},{voiceSource:'upload',cloneSample:''}])assert.throws(()=>speechCloneInput({...body,...change}));
 assert.equal(speechCloneInput({...body,title:''}).autoTitle,true);
 assert.equal(speechCloneInput({...body,title:'手动名称'}).title,'手动名称');
});
test('引用样本验证格式与大小，远端下载 URL 不会成为上传文件名',async()=>{
 const input=speechCloneInput({...body,libraryVoice:'user-file'});
 for(const asset of [null,{mime:'image/png'},{mime:'audio/mp4',name:'voice.m4a',bytes:10},{mime:'audio/mpeg',name:'voice.mp3',bytes:33*1024*1024}])await assert.rejects(speechReference(input,'alice',{}, {document:async()=>({data:null}),asset:async()=>asset}));
 await assert.rejects(uploadSpeechReference({blob:new Blob(['ID3']),name:'voice.mp3'},{origin:'https://www.runninghub.cn'},'mock',async()=>new Response(JSON.stringify({code:0,data:{download_url:'https://media.example/audio.mp3'}}))),error=>error.rejected===true);
});

test('回收站音色不可复刻，恢复后可重新使用',async()=>{
 const input=speechCloneInput({...body,libraryVoice:'own-file'});
 let trashed=true,reads=0;
 const store={document:async()=>({data:{items:[{id:'own-file',trashed}]}}),asset:async()=>({mime:'audio/mpeg',name:'voice.mp3',bytes:3,object_key:'own-key'})};
 const env={BUCKET:{get:async()=>{reads++;return{arrayBuffer:async()=>new Uint8Array([73,68,51]).buffer}}}};
 await assert.rejects(speechReference(input,'alice',env,store),/回收站/);assert.equal(reads,0);
 trashed=false;assert.equal((await speechReference(input,'alice',env,store)).name,'voice.mp3');assert.equal(reads,1);
});

test('Index TTS 默认中性向量，不接受错配模型或非法数值',()=>{
 const index={...body,ttsModel:'index-tts',model:'index-voice-clone'};
 assert.deepEqual(speechCloneInput(index).emotionVector,[0,0,0,0,0,0,0,0]);
 for(const change of [{model:'qwen-voice-clone'},{emotionVector:[0,0,0,0,0,0,0,NaN]},{emotionVector:[0,0,0,0,0,0,0,Infinity]}])assert.throws(()=>speechCloneInput({...index,...change}));
 const emotionVector=[.123,0,0,0,0,0,.9,1];assert.deepEqual(speechCloneInput({...index,emotionVector}).emotionVector,emotionVector);
});
