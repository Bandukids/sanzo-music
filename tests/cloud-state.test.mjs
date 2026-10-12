import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup({fail=false}={}){
 const handlers={},requests=[],navigations=[];
 const source=fs.readFileSync(new URL('../dist/cloud-state.js',import.meta.url),'utf8').replace(/^import .*\n/,'').replace(/export /g,'');
 const context=vm.createContext({URL,JSON,Map,Promise,Error,BroadcastChannel:undefined,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},setTimeout:()=>1,clearTimeout:()=>{},mergeState:(base,local)=>local,
  window:{addEventListener:(type,fn)=>handlers[type]=fn,dispatchEvent:()=>{}},
  document:{addEventListener:(type,fn)=>handlers[type]=fn,querySelector:()=>null,activeElement:null},
  location:{href:'https://sanzo.test/create/',origin:'https://sanzo.test',pathname:'/create/',search:'',assign:url=>navigations.push(url)},
  fetch:async(path,options)=>{requests.push({path,options});return {ok:!(fail&&options.method==='PUT'),status:fail?503:200,json:async()=>options.method==='PUT'?(fail?{error:{message:'保存失败'}}:{revision:2}):{data:{title:'原内容'},revision:1}};}
 });
 vm.runInContext(source+'\nglobalThis.state={openCloudState,saveCloudState,flushCloudState,exportPending};',context);
 const click=(href='https://sanzo.test/studio/',extra={})=>{const event={button:0,target:{closest:()=>({href,target:'',hasAttribute:()=>false})},preventDefault(){this.prevented=true;},...extra};return {event,done:handlers.click(event)};};
 const unload=()=>{const event={preventDefault(){this.prevented=true;}};handlers.beforeunload(event);return event;};
 return {state:context.state,requests,navigations,click,unload};
}
test('unchanged state neither starts saving nor warns on leaving',async()=>{
 const f=setup();await f.state.openCloudState('workspace');f.state.saveCloudState('workspace',{title:'原内容'});assert.equal(f.unload().prevented,undefined);assert.equal(f.requests.length,1);
});
test('internal navigation flushes pending edits before leaving',async()=>{
 const f=setup();await f.state.openCloudState('workspace');f.state.saveCloudState('workspace',{title:'修改'});assert.equal(f.unload().prevented,true);
 const {event,done}=f.click();assert.equal(event.prevented,true);assert.equal(f.navigations.length,0);await done;assert.deepEqual(f.navigations,['https://sanzo.test/studio/']);assert.equal(f.requests.at(-1).options.method,'PUT');assert.equal(f.unload().prevented,undefined);
});
test('failed save keeps edits and blocks navigation',async()=>{
 const f=setup({fail:true});await f.state.openCloudState('workspace');f.state.saveCloudState('workspace',{title:'修改'});await f.click().done;
 assert.equal(f.navigations.length,0);assert.equal(f.state.exportPending().workspace.title,'修改');assert.equal(f.unload().prevented,true);
});
test('hash links and modified clicks preserve normal browser behavior',async()=>{
 const f=setup();await f.state.openCloudState('workspace');f.state.saveCloudState('workspace',{title:'修改'});
 const hash=f.click('https://sanzo.test/create/#uploads');await hash.done;assert.equal(hash.event.prevented,undefined);
 const modified=f.click(undefined,{ctrlKey:true});await modified.done;assert.equal(modified.event.prevented,undefined);assert.equal(f.requests.length,1);
});
