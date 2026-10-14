import test from 'node:test';
import assert from 'node:assert/strict';
import {createTaskPoller,observeTaskPolling} from '../dist/task-poller.js';
const job=(id,status='queued',second=0)=>({id,status,updatedAt:new Date(second*1000).toISOString(),input:{model:'seedvc-song'}});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const settle=()=>new Promise(setImmediate);

test('history reads coalesce, pending tasks sync without rereading history, idle discovery slows down',async()=>{
 let clock=0,reads=0,syncs=0;const gate=deferred(),batches=[];
 const p=createTaskPoller({now:()=>clock,fetchJobs:()=>{reads++;return reads===1?gate.promise:Promise.resolve([job('a','succeeded',80)]);},syncJob:async j=>{syncs++;return job(j.id,'succeeded',1);},onJobs:jobs=>batches.push(jobs)});
 const first=p.load(),second=p.load();assert.equal(first,second);assert.equal(reads,1);
 gate.resolve([job('a')]);await first;await p.poll();assert.equal(reads,1);assert.equal(syncs,1);
 assert.equal(p.nextDelay(12000),60000);clock=12000;await p.poll();assert.equal(reads,1);assert.equal(syncs,1);
 clock=60000;await p.poll();assert.equal(reads,2);assert.equal(syncs,1);assert.equal(batches.length,2);
});

test('bounded parallel synchronization lets other tasks finish when one is slow, and coalesces polls',async()=>{
 const gates=new Map(['a','b','c'].map(id=>[id,deferred()])),started=[],batches=[];
 const p=createTaskPoller({concurrency:2,fetchJobs:async()=>[],syncJob:j=>{started.push(j.id);return gates.get(j.id).promise;},onJobs:jobs=>batches.push(...jobs)});
 await p.load();p.accept(['a','b','c'].map(id=>job(id)));
 const first=p.poll(),second=p.poll();assert.equal(first,second);assert.deepEqual(started,['a','b']);
 gates.get('b').resolve(job('b','succeeded',1));await settle();assert.deepEqual(started,['a','b','c']);assert.equal(batches.at(-1).id,'b');
 gates.get('c').resolve(job('c','succeeded',1));gates.get('a').resolve(job('a','succeeded',1));await first;
});

test('unchanged status timestamps do not redraw; stale snapshots cannot undo completion or trigger another sync',async()=>{
 let notifications=0,syncs=0;const p=createTaskPoller({fetchJobs:async()=>[],syncJob:async j=>{syncs++;return j;},onJobs:()=>notifications++});
 await p.load();p.accept([job('a','running',10)]);p.accept([job('a','running',20)]);assert.equal(notifications,1);
 p.accept([job('a','queued',15)]);assert.equal(notifications,1);
 p.accept([job('a','succeeded',30)]);p.accept([job('a','queued',25)]);await p.poll();assert.equal(notifications,2);assert.equal(syncs,0);
});

test('a failed history request or single synchronization does not block other tasks',async()=>{
 const completed=[],errors=[];const p=createTaskPoller({fetchJobs:async()=>{throw Error('history offline');},syncJob:async j=>{if(j.id==='a')throw Error('a offline');return job(j.id,'succeeded',1);},onJobs:jobs=>completed.push(...jobs.filter(j=>j.status==='succeeded')),onError:e=>errors.push(e.message)});
 p.accept(['a','b'].map(id=>job(id)));await p.poll();assert.deepEqual(completed.map(j=>j.id),['b']);assert.deepEqual(errors,['history offline']);
});

test('hidden pages have no polling timer, Back restores discovery, and teardown discards late responses',async()=>{
 const page=new EventTarget(),host=new EventTarget();page.hidden=false;const timers=new Map();let serial=0,reads=0;
 const p=createTaskPoller({now:()=>0,fetchJobs:async()=>{reads++;return [];},syncJob:async j=>j,onJobs:()=>{}});await p.load();
 const observer=observeTaskPolling(p,{page,host,schedule:(callback,delay)=>{timers.set(++serial,{callback,delay});return serial;},cancel:id=>timers.delete(id)});
 observer.start({immediate:false});assert.equal(timers.size,1);assert.equal([...timers.values()][0].delay,60000);
 page.hidden=true;page.dispatchEvent(new Event('visibilitychange'));assert.equal(timers.size,0);
 page.hidden=false;page.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal(reads,2);assert.equal(timers.size,1);
 const event=type=>Object.assign(new Event(type),{persisted:true});host.dispatchEvent(event('pagehide'));assert.equal(timers.size,0);host.dispatchEvent(event('pageshow'));await settle();assert.equal(reads,3);assert.equal(timers.size,1);
 observer.destroy();page.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal(timers.size,0);assert.equal(reads,3);
 const gate=deferred();let notifications=0;const late=createTaskPoller({fetchJobs:()=>gate.promise,syncJob:async j=>j,onJobs:()=>notifications++});const loading=late.load();late.destroy();gate.resolve([job('late')]);await loading;assert.equal(notifications,0);
});
