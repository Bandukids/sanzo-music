import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceLibrarySamples,uploadedAudioAssets} from '../dist/voice-library.js';
const assets=[{id:'old',kind:'voice',name:'旧参考.mp3',mime:'audio/mpeg'},{id:'new',kind:'upload-speech',name:'新参考.mp3',mime:'audio/mpeg'},{id:'song',kind:'upload-music',name:'音乐.mp3',mime:'audio/mpeg'},{id:'result',kind:'speech',name:'生成.mp3',mime:'audio/mpeg'}];
test('音色选择只包含云端存在的参考素材，排除回收站与生成作品',()=>{
 const list=voiceLibrarySamples(assets,{items:[{id:'old',trashed:true}]});assert.equal(list.length,4);assert.equal(list.some(a=>a.id==='old'),false);assert.equal(list.some(a=>a.id==='song'||a.id==='result'),false);assert.equal(list.some(a=>a.id==='new'),true);
 assert.equal(voiceLibrarySamples([]).length,3);
 assert.equal(voiceLibrarySamples(assets,{items:[{id:'old',trashed:false,name:'已恢复音色'}]}).find(a=>a.id==='old').name,'已恢复音色');
});
test('旧版 voice 样本也出现在上传页面，能统一删除与恢复',()=>{
 const list=uploadedAudioAssets(assets);assert.deepEqual(list.map(a=>a.id),['old','new','song']);assert.equal(list[0].kind,'upload-speech');assert.equal(assets[0].kind,'voice');
});
