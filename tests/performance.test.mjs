import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createPlaybackClock} from '../dist/playback-clock.js';

test('playback UI has no idle timer, sleeps when hidden and catches up on return',()=>{
 const page=new EventTarget();page.hidden=false;
 const callbacks=new Map();let scheduled=0,updates=0;
 const clock=createPlaybackClock(()=>updates++,{page,schedule:callback=>{callbacks.set(++scheduled,callback);return scheduled;},cancel:id=>callbacks.delete(id)});
 assert.equal(callbacks.size,0);
 clock.setPlaying(true);clock.setPlaying(true);
 assert.equal(scheduled,1);assert.equal(callbacks.size,1);
 [...callbacks.values()][0]();assert.equal(updates,1);
 page.hidden=true;page.dispatchEvent(new Event('visibilitychange'));
 assert.equal(callbacks.size,0);
 page.hidden=false;page.dispatchEvent(new Event('visibilitychange'));
 assert.equal(updates,2);assert.equal(callbacks.size,1);
 clock.setPlaying(false);assert.equal(callbacks.size,0);
 page.dispatchEvent(new Event('visibilitychange'));assert.equal(updates,2);
 clock.setPlaying(true);clock.destroy();assert.equal(callbacks.size,0);
 page.dispatchEvent(new Event('visibilitychange'));assert.equal(updates,2);
});

const loaderSource=await readFile(new URL('../dist/abc-library.js',import.meta.url),'utf8');
function loader(){
 const scripts=[],timers=new Map();
 const context=vm.createContext({document:{createElement:()=>({remove(){this.removed=true;}}),head:{append:script=>scripts.push(script)}},setTimeout:callback=>{timers.set(timers.size+1,callback);return timers.size;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(loaderSource.replace('export function','function')+'\nthis.load=loadABCLibrary;',context);
 return {context,scripts,timers,load:context.load};
}
test('ABC library loads only on demand and shares one request',async()=>{
 const l=loader();assert.equal(l.scripts.length,0);
 const first=l.load(),second=l.load();assert.equal(first,second);assert.equal(l.scripts.length,1);
 l.context.ABCJS={renderAbc(){}};l.scripts[0].onload();
 assert.equal(await first,l.context.ABCJS);assert.equal(await l.load(),l.context.ABCJS);
 assert.equal(l.scripts.length,1);assert.equal(l.timers.size,0);
});
test('a failed ABC download can be retried without reloading the page',async()=>{
 const l=loader(),failed=l.load();l.scripts[0].onerror();
 await assert.rejects(failed,/加载失败/);assert.equal(l.scripts[0].removed,true);
 const next=l.load();assert.equal(l.scripts.length,2);
 l.context.ABCJS={};l.scripts[1].onload();assert.equal(await next,l.context.ABCJS);
});

const cloudBundle=await build({entryPoints:[fileURLToPath(new URL('../dist/cloud-state.js',import.meta.url))],bundle:true,write:false,format:'iife',globalName:'cloud',plugins:[{name:'frontend-root',setup(b){b.onResolve({filter:/^\/state-merge\.js$/},()=>({path:fileURLToPath(new URL('../dist/state-merge.js',import.meta.url))}));}}]});
function cloud(){
 const page=new EventTarget();page.hidden=false;page.querySelector=()=>null;
 const requests=[],context=vm.createContext({window:new EventTarget(),document:page,CustomEvent,setTimeout:()=>1,clearTimeout(){},fetch:path=>new Promise(resolve=>requests.push({path,resolve:result=>resolve({ok:true,json:async()=>result})}))});
 vm.runInContext(cloudBundle.outputFiles[0].text,context);
 return {api:context.cloud,requests};
}
test('concurrent state consumers wait for one loaded response instead of empty fallback',async()=>{
 const c=cloud(),first=c.api.openCloudState('workspace'),second=c.api.openCloudState('workspace');
 await c.api.flushCloudState('workspace');
 assert.equal(c.requests.length,1);
 c.requests[0].resolve({data:{drafts:[{id:'saved'}]},revision:1});
 const [a,b]=await Promise.all([first,second]);assert.equal(a.drafts[0].id,'saved');assert.equal(b.drafts[0].id,'saved');
 a.drafts[0].id='changed';assert.equal(b.drafts[0].id,'saved');
});
test('background refresh shares a request and cannot overwrite edits made during loading',async()=>{
 const c=cloud(),opened=c.api.openCloudState('workspace');c.requests[0].resolve({data:{drafts:[]},revision:1});await opened;
 const first=c.api.refreshCloudState('workspace'),second=c.api.refreshCloudState('workspace');assert.equal(c.requests.length,2);
 c.api.saveCloudState('workspace',{drafts:[{id:'local-edit'}]});
 c.requests[1].resolve({data:{drafts:[{id:'remote'}]},revision:2});await Promise.all([first,second]);
 assert.equal(c.api.peekCloudState('workspace').drafts[0].id,'local-edit');
});

test('checking a voice sample uses HEAD and never reads an audio body',async()=>{
 const source=await readFile(new URL('../dist/training-audio-store.js',import.meta.url),'utf8');
 const requests=[],context=vm.createContext({fetch:async(path,options)=>{requests.push({path,options});return{ok:true,blob(){throw Error('unexpected full download');}};}});
 vm.runInContext(source.replace(/^import .*\n/,'').replaceAll('export ', '')+'\nthis.check=checkAudio;',context);
 assert.equal(await context.check('sample /?#'),true);
 assert.equal(requests[0].path,'/api/assets/sample%20%2F%3F%23');assert.equal(requests[0].options.method,'HEAD');
});
