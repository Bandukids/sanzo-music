import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCollections,createWorkspace,deleteWorkspace,moveCreation,restoreCreation,emptyTrash} from '../dist/creator-collections.js';
const fixture=()=>({drafts:[{id:'a',workspace:'night',form:{workspace:'night'}},{id:'b',workspace:'default',form:{workspace:'default'}}],albums:[{tracks:['a','b','community']}],liked:['a','community']});
test('existing workspace assignments survive migration and unknown destinations fall back',()=>{const state=fixture();state.drafts.push({id:'old',workspace:'unknown',form:{workspace:'unknown'}});normalizeCollections(state);assert.equal(state.drafts[0].workspace,'night');assert.equal(state.drafts[2].workspace,'default');assert.equal(state.drafts[2].form.workspace,'default');const saved=JSON.parse(JSON.stringify(state));normalizeCollections(saved);assert.deepEqual(saved,state);});
test('custom workspaces reject blank/duplicate names and enforce twenty',()=>{const state=fixture();state.workspaces=[];normalizeCollections(state);assert.throws(()=>createWorkspace(state,'  ','x'));createWorkspace(state,'Podcast','p');assert.throws(()=>createWorkspace(state,' podcast ','q'));for(let i=1;i<20;i++)createWorkspace(state,'Project '+i,'p'+i);assert.equal(state.workspaces.filter(w=>!['speech','abc'].includes(w.id)).length,20);assert.throws(()=>createWorkspace(state,'Overflow','overflow'));});
test('deleting a workspace preserves creations, trash, albums and favorites',()=>{const state=fixture();normalizeCollections(state);state.form={workspace:'night',title:'Unfinished'};state.drafts.push({id:'removed',workspace:'night',trashed:true,removedAt:100,form:{workspace:'night',lyrics:'Keep these lyrics'}});const albums=structuredClone(state.albums),liked=[...state.liked];const deleted=deleteWorkspace(state,'night');assert.deepEqual(deleted.movedIds,['a','removed']);assert.equal(state.workspaces.some(w=>w.id==='night'),false);assert.equal(state.drafts.length,3);assert.equal(state.drafts[0].workspace,'default');assert.equal(state.drafts[0].form.workspace,'default');assert.equal(state.drafts[2].workspace,'default');assert.equal(state.drafts[2].form.workspace,'default');assert.equal(state.drafts[2].form.lyrics,'Keep these lyrics');assert.equal(state.drafts[2].trashed,true);assert.equal(state.drafts[2].removedAt,100);assert.equal(state.form.workspace,'default');assert.deepEqual(state.albums,albums);assert.deepEqual(state.liked,liked);const saved=JSON.parse(JSON.stringify(state));normalizeCollections(saved);assert.deepEqual(saved,state);});
test('invalid workspace deletion leaves collections unchanged',()=>{const state=fixture();normalizeCollections(state);const before=structuredClone(state);for(const id of ['default','all','trash','missing'])assert.equal(deleteWorkspace(state,id),null);assert.deepEqual(state,before);});
test('moving, trash restoration and clearing retain consistent albums and form destinations',()=>{const state=fixture();normalizeCollections(state);createWorkspace(state,'Voice','voice');assert.equal(moveCreation(state,'a','missing'),false);assert.equal(moveCreation(state,'a','voice'),true);assert.equal(state.drafts[0].form.workspace,'voice');moveCreation(state,'a','trash');assert.equal(state.drafts[0].trashed,true);restoreCreation(state,'a');assert.equal(state.drafts[0].workspace,'voice');moveCreation(state,'a','trash');const ids=emptyTrash(state);assert.deepEqual([...ids],['a']);assert.deepEqual(state.drafts.map(d=>d.id),['b']);assert.deepEqual(state.albums[0].tracks,['b','community']);assert.deepEqual(state.liked,['community']);});


test('Speech 固定工作区自动恢复，不可删除且不占自定义额度',()=>{
 const state=fixture();state.workspaces=[{id:'speech',name:'changed'}];state.drafts.push({id:'voice',type:'speech',workspace:'default',form:{workspace:'default'}});normalizeCollections(state);
 assert.deepEqual(state.workspaces[0],{id:'speech',name:'Speech',fixed:true});assert.equal(state.drafts[2].workspace,'speech');
 assert.equal(deleteWorkspace(state,'speech'),null);
 for(let i=0;i<20;i++)createWorkspace(state,'Workspace '+i,'w'+i);
 assert.equal(state.workspaces.length,22);assert.throws(()=>createWorkspace(state,'Overflow','w21'));
});

 test('ABC 固定工作区自动恢复并与自定义工作区分开',()=>{
 const state=fixture();state.workspaces=[];state.drafts.push({id:'score',type:'abc',workspace:'default',form:{workspace:'default'}});normalizeCollections(state);
 assert.equal(state.drafts[2].workspace,'abc');assert.equal(state.drafts[2].form.workspace,'abc');assert.equal(deleteWorkspace(state,'abc'),null);
 for(let i=0;i<20;i++)createWorkspace(state,'Collection '+i,'c'+i);assert.equal(state.workspaces.length,22);
 });
