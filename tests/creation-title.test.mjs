import test from 'node:test';
import assert from 'node:assert/strict';
import {creationTitle} from '../dist/creation-title.js';
test('克隆作品附参考名称，保留原名称且音色设计和音乐不附加',()=>{
 const work={type:'speech',title:'海风问候',form:{speechModel:'tts',voiceSource:'library',libraryVoice:'preset:warm'}};
 assert.equal(creationTitle(work),'海风问候 · 温暖女声');assert.equal(work.title,'海风问候');
 assert.equal(creationTitle({...work,form:{...work.form,voiceSource:'upload',cloneSample:'one',cloneName:'旁白.wav'}}),'海风问候 · 旁白.wav');
 assert.equal(creationTitle({...work,form:{...work.form,referenceName:'生成时音色'}}),'海风问候 · 生成时音色');
 assert.equal(creationTitle({...work,form:{speechModel:'tts',libraryVoice:'one'}},{voices:[{id:'one',name:'自有音色'}]}),'海风问候 · 自有音色');
 assert.equal(creationTitle({...work,form:{speechModel:'design'}}),'海风问候');assert.equal(creationTitle({...work,type:'songs'}),'海风问候');
 assert.equal(creationTitle({...work,form:{speechModel:'tts',libraryVoice:'missing'}}),'海风问候');
});
