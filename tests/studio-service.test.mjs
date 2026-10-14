import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const bundle=await build({entryPoints:[fileURLToPath(new URL('../dist/studio-seedvc.js',import.meta.url))],bundle:true,write:false,format:'iife',globalName:'studio',plugins:[{name:'frontend-root',setup(b){b.onResolve({filter:/^\//},args=>({path:fileURLToPath(new URL('../dist'+args.path,import.meta.url))}));}}]});
const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function service(fetcher,initial='{}'){
 const document=new EventTarget(),window=new EventTarget(),storage=new Map([['sanzo-studio-submissions',initial]]),timers=new Map();document.hidden=false;document.querySelector=()=>null;let serial=0;
 const context=vm.createContext({document,window,CustomEvent,AbortSignal,crypto:{randomUUID},fetch:fetcher,setTimeout:(callback,delay)=>{timers.set(++serial,{callback,delay});return serial;},clearTimeout:id=>timers.delete(id),sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}});
 vm.runInContext(bundle.outputFiles[0].text,context);const jobs=[],errors=[];
 return {api:context.studio.initStudioSeedVC({onJob:job=>jobs.push(job),onError:error=>errors.push(error)}),jobs,errors,timers,storage};
}
test('Studio uploads both samples concurrently and coalesces identical submissions',async()=>{
 const uploads=[],posted=[];const s=service((path,options)=>{
  if(path.startsWith('/api/assets/')){const gate=deferred();uploads.push({gate,kind:options.headers['X-Asset-Kind']});return gate.promise;}
  posted.push(JSON.parse(options.body));return Promise.resolve(response({job:{id:'job',status:'queued',input:posted.at(-1)}}));
 });
 const files={source:new File(['source'],'source.mp3'),target:new File(['voice'],'voice.mp3')};
 const a=s.api.submit({}, {},files,'歌曲','song'),b=s.api.submit({}, {},files,'歌曲','song');
 assert.equal(uploads.length,2);assert.deepEqual(uploads.map(u=>u.kind),['upload-music','upload-speech']);assert.equal(posted.length,0);
 uploads.forEach(u=>u.gate.resolve(response({id:'uploaded'})));await Promise.all([a,b]);
 assert.equal(posted.length,1);assert.equal(s.jobs.length,1);assert.equal(posted[0].model,'seedvc-song');s.api.destroy();
});
test('ambiguous failures retain the same request key for an explicit retry, including corrupt browser storage',async()=>{
 const posted=[];const s=service((path,options)=>{const body=JSON.parse(options.body);posted.push(body);if(posted.length===1)return Promise.reject(Error('network timeout'));return Promise.resolve(response({job:{id:'job',status:'unknown',input:body}}));},'null');
 await assert.rejects(s.api.submit({id:'source'},{id:'preset:warm'},{},'语音'),/network timeout/);
 assert.equal(posted.length,1);await s.api.submit({id:'source'},{id:'preset:warm'},{},'语音');assert.equal(posted[0].requestKey,posted[1].requestKey);s.api.destroy();
});
test('concurrent Studio loads share one request and timestamp-only updates preserve the existing UI',async()=>{
 let reads=0;const gate=deferred();const input={model:'seedvc-speech',sourceAsset:'source'};
 const s=service(()=>{reads++;return reads===1?gate.promise:Promise.resolve(response({jobs:[{id:'a',status:'succeeded',updatedAt:'2026-10-14T02:00:00Z',input}]}));});
 const first=s.api.load(),second=s.api.load();assert.equal(reads,1);gate.resolve(response({jobs:[{id:'a',status:'succeeded',updatedAt:'2026-10-14T01:00:00Z',input}]}));await Promise.all([first,second]);await s.api.load();
 assert.equal(reads,2);assert.equal(s.jobs.length,1);assert.equal(s.timers.size,1);assert.equal([...s.timers.values()][0].delay,60000);s.api.destroy();assert.equal(s.timers.size,0);
});
