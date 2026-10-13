import test from 'node:test';
import assert from 'node:assert/strict';
import {seedVCInput,seedVCSamples} from '../server/seedvc.mjs';
import {musicInput,nodeInfoList} from '../server/generations.mjs';
import {MUSIC_WORKFLOWS} from '../server/music-routing.mjs';
const body={model:'seedvc-speech',type:'speech',studioTool:'speech',sourceAsset:'own-source',referenceAsset:'preset:warm',title:''};
test('SeedVC sends source to node 18, reference to node 2, and preserves workflow defaults',()=>{
 const input=musicInput(body);assert.equal(input.workspace,'speech');assert.equal(input.autoTitle,true);
 assert.deepEqual(nodeInfoList({...input,sourceAudio:'openapi/source.wav',referenceAudio:'openapi/ref.mp3'}),[{nodeId:'18',fieldName:'audio',fieldValue:'openapi/source.wav'},{nodeId:'2',fieldName:'audio',fieldValue:'openapi/ref.mp3'},{nodeId:'14',fieldName:'f0_condition',fieldValue:false},{nodeId:'14',fieldName:'auto_f0_adjust',fieldValue:true},{nodeId:'14',fieldName:'pitch_shift',fieldValue:0}]);
 assert.deepEqual(MUSIC_WORKFLOWS[input.model].apps,{cn:'2108209006111182850',ai:'2045880827887751169'});assert.equal(MUSIC_WORKFLOWS[input.model].outputNode,'30');assert.equal(MUSIC_WORKFLOWS[input.model].outputFormat,'mp3');
 for(const change of [{sourceAsset:'https://evil.test/a.wav'},{referenceAsset:'preset:unknown'},{type:'songs'},{studioTool:'song'},{sourceAsset:''}])assert.throws(()=>seedVCInput({...body,...change}));
});
test('SeedVC Songs preserves original pitch and shares the speech application without accepting conflicting modes',()=>{
 const input=musicInput({...body,model:'seedvc-song',type:'songs',studioTool:'song',f0_condition:false,auto_f0_adjust:true,pitch_shift:12});
 assert.equal(input.type,'songs');assert.equal(input.workspace,'default');assert.equal(input.studioTool,'song');
 assert.deepEqual(MUSIC_WORKFLOWS[input.model].apps,MUSIC_WORKFLOWS['seedvc-speech'].apps);
 const nodes=nodeInfoList({...input,sourceAudio:'openapi/song.mp3',referenceAudio:'openapi/voice.wav'});
 assert.deepEqual(nodes.slice(0,2),[{nodeId:'18',fieldName:'audio',fieldValue:'openapi/song.mp3'},{nodeId:'2',fieldName:'audio',fieldValue:'openapi/voice.wav'}]);
 assert.deepEqual(nodes.slice(2),[{nodeId:'14',fieldName:'f0_condition',fieldValue:true},{nodeId:'14',fieldName:'auto_f0_adjust',fieldValue:false},{nodeId:'14',fieldName:'pitch_shift',fieldValue:0}]);
 for(const change of [{type:'speech'},{studioTool:'speech'},{model:'seedvc-speech'}])assert.throws(()=>musicInput({...input,...change}));
});
test('SeedVC refuses deleted creations and does not read audio objects',async()=>{
 let reads=0;const store={document:async ns=>({data:{drafts:[{assetId:'own-source',trashed:true}]}}),asset:async()=>{reads++;}};
 await assert.rejects(seedVCSamples(seedVCInput(body),'alice',{},store),/回收站/);assert.equal(reads,0);
});
test('SeedVC reads only owner-scoped audio and preset assets',async()=>{
 const owners=[];const store={document:async()=>({data:{}}),asset:async(owner,id)=>{owners.push(owner);return {mime:'audio/wav',name:'原始.wav',bytes:4,object_key:'owned-source'};}};
 const env={BUCKET:{get:async()=>({arrayBuffer:async()=>new Uint8Array([1,2,3,4]).buffer})},ASSETS:{fetch:async()=>new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'audio/mpeg'}})}};
 const samples=await seedVCSamples(seedVCInput(body),'alice',env,store);assert.deepEqual(owners,['alice']);assert.equal(samples.source.name,'原始.wav');assert.equal(samples.reference.referenceName,'温暖女声');
});
