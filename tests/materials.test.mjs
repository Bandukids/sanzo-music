import test from 'node:test';
import assert from 'node:assert/strict';
import {collectMaterials,recycleJob,isHiddenJob} from '../dist/material-model.js';
test('统一素材列表包含生成音频、上传音频及 ABC，排除已删除的素材且不重复资产',()=>{
 const assets=[{id:'music-result',name:'result.mp3',kind:'music',bytes:10},{id:'uploaded',name:'ref.mp3',kind:'upload-music',bytes:20},{id:'voice',name:'voice.mp3',kind:'upload-speech'},{id:'art',kind:'cover'}];
 const drafts=[{id:'generated',assetId:'music-result',title:'生成歌曲',type:'songs'},{id:'score',title:'小夜曲',type:'abc',form:{abcNotation:'X:1\nK:C\nC D|'}},{id:'deleted',title:'删除作品',assetId:'missing',trashed:true}];
 const list=collectMaterials(assets,drafts,{items:[{id:'voice',trashed:true},{id:'uploaded',name:'参考歌曲'}]});assert.equal(list.length,3);assert.deepEqual(list.map(m=>m.title),['生成歌曲','小夜曲','参考歌曲']);assert.equal(list.filter(m=>m.assetId==='music-result').length,1);assert.equal(list[0].origin,'generated');assert.equal(list[1].notation,'X:1\nK:C\nC D|');assert.equal(list[2].origin,'uploaded');
});
test('Studio 删除的作品写入统一回收站，恢复和清空后生成记录不会重新导入',()=>{
 const state={drafts:[],generationSeen:[]},job={id:'task',status:'succeeded',assetId:'music-result',input:{model:'yue2-cover',type:'songs',title:'新曲名',lyrics:'唱词',coverStyles:'jazz'}};
 const d=recycleJob(state,job);assert.equal(d.id,'generation-task');assert.equal(d.assetId,'music-result');assert.equal(d.styles,'jazz');assert.equal(isHiddenJob(state,'task'),true);assert.equal(collectMaterials([{id:'music-result',kind:'music'}],state.drafts).length,0);recycleJob(state,job);assert.equal(state.drafts.length,1);d.trashed=false;assert.equal(isHiddenJob(state,'task'),false);state.drafts=[];assert.equal(isHiddenJob(state,'task'),true);
});
test('旧版清空留下的孤立音频不会重新出现在素材库，旧音色上传保留来源',()=>{const assets=[{id:'music-old-task',name:'已清空.mp3',kind:'music'},{id:'music-live-task',name:'新作品.mp3',kind:'music'},{id:'old-voice',name:'参考.mp3',kind:'voice'}];const list=collectMaterials(assets,[],{items:[]},['old-task']);assert.deepEqual(list.map(m=>m.id),['music-live-task','old-voice']);assert.equal(list[1].origin,'uploaded');});
