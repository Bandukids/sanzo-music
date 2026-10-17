import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {versionFrontendAssets} from '../scripts/frontend-versioning.mjs';

test('an audio catalogue update invalidates entry points and their cached dependencies together',async t=>{
 const root=await mkdtemp(join(tmpdir(),'sanzo-asset-version-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const sources={
  'explore/index.html':'<script type="module" src="/explore.js"></script><link rel="stylesheet" href="/explore.css"><img src="/cover.jpg">',
  'explore.js':"import {tracks} from '/music-catalog.js'; import './shared.js'; export {tracks} from './music-catalog.js'; const load=()=>import('./shared.js'); const api='/api/releases'; import 'external-package';",
  'music-catalog.js':"import {audio} from './community-audio.js'; export const tracks=audio;",
  'community-audio.js':"export const audio={blue:'/api/releases/old/audio'};",
  'shared.js':"import 'https://example.com/remote.js'; export const shared=true;",
  'explore.css':'body{color:white}'
 };
 async function build(name,changed={}) {
  const folder=join(root,name);await mkdir(join(folder,'explore'),{recursive:true});
  for(const [path,source] of Object.entries({...sources,...changed}))await writeFile(join(folder,path),source);
  return {folder,version:await versionFrontendAssets(folder)};
 }
 const first=await build('first'),identical=await build('identical'),next=await build('next',{'community-audio.js':"export const audio={blue:'/api/releases/new/audio'};"});
 assert.equal(first.version,identical.version);assert.notEqual(first.version,next.version);
 for(const release of [first,next]) {
  const page=await readFile(join(release.folder,'explore/index.html'),'utf8');
  assert.ok(page.includes('/explore.js?v='+release.version));assert.ok(page.includes('/explore.css?v='+release.version));assert.ok(page.includes('src="/cover.jpg"'));
  const entry=await readFile(join(release.folder,'explore.js'),'utf8');
  assert.ok(entry.includes("from '/music-catalog.js?v="+release.version+"'"));assert.ok(entry.includes("import './shared.js?v="+release.version+"'"));assert.ok(entry.includes("import('./shared.js?v="+release.version+"')"));
  assert.ok(entry.includes("const api='/api/releases'"));assert.ok(entry.includes("import 'external-package'"));
  assert.ok((await readFile(join(release.folder,'music-catalog.js'),'utf8')).includes('./community-audio.js?v='+release.version));
  assert.equal(await readFile(join(release.folder,'shared.js'),'utf8'),sources['shared.js']);
 }
});
