import test from 'node:test';
import assert from 'node:assert/strict';
import {safeReturnPath,loginURL} from '../dist/auth-routing.js';
import {currentUser,clearAuthSession,requireSignIn} from '../dist/auth-session.js';
import {communityTracks} from '../dist/music-catalog.js';
import {communityAudio} from '../dist/community-audio.js';
import {loadPublishedTracks} from '../dist/published-music.js';

test('login defaults to homepage and only accepts internal return paths',()=>{
 for(const value of [null,undefined,'https://evil.test','//evil.test','/\\evil.test','/login/','/login/?next=/admin/','/\n/evil.test'])assert.equal(safeReturnPath(value),'/');
 assert.equal(safeReturnPath('/create/?mode=custom#songs'),'/create/?mode=custom#songs');
 assert.equal(loginURL('/studio/?edit=test'),'/login/?next=%2Fstudio%2F%3Fedit%3Dtest');
});
test('guest creation preserves the draft and asks for login while signed-in users continue',async t=>{
 const previous={fetch:globalThis.fetch,location:globalThis.location,window:globalThis.window};t.after(()=>{Object.assign(globalThis,previous);clearAuthSession();});
 const navigations=[];globalThis.location={pathname:'/create/',search:'',hash:'#create',assign:value=>navigations.push(value)};globalThis.window=new EventTarget();
 let requests=0,saved=0,events=0;window.addEventListener('sanzo-before-sign-in',()=>events++);
 globalThis.fetch=async()=>{requests++;return new Response(JSON.stringify({error:{message:'请先登录。'}}),{status:401});};clearAuthSession();
 assert.equal(await currentUser(),null);assert.equal(await requireSignIn({beforeRedirect:()=>saved++}),false);assert.equal(requests,1);assert.equal(saved,1);assert.equal(events,1);assert.deepEqual(navigations,['/login/?next=%2Fcreate%2F%23create']);
 globalThis.fetch=async()=>new Response(JSON.stringify({user:{id:'test-user'}}));clearAuthSession();assert.equal(await requireSignIn(),true);assert.equal(navigations.length,1);
});
test('all twelve curated songs use published YUE2 audio and preserve existing covers',()=>{
 assert.equal(communityTracks.length,12);const releases=new Set();
 for(const track of communityTracks){assert.equal(track.model,'YUE2');assert.equal(track.generated,true);assert.match(track.audioURL,/^\/api\/releases\/[a-f0-9-]{36}\/audio$/);assert.ok(track.bytes>1000);assert.ok(track.lyrics.includes('[Verse 1]'));assert.ok(['forest.jpg','coast.jpg','mountains.jpg','liquid-glass.png'].includes(track.art));releases.add(track.releaseId);}
 assert.equal(releases.size,12);
});
test('curated audio is not duplicated in the published music list',async t=>{
 const previous=globalThis.fetch;t.after(()=>globalThis.fetch=previous);
 const curated=Object.values(communityAudio)[0];globalThis.fetch=async()=>new Response(JSON.stringify({tracks:[{id:'release-'+curated.releaseId},{id:'release-another-user-song'}]}));
 assert.deepEqual(await loadPublishedTracks(),[{id:'release-another-user-song'}]);
});
