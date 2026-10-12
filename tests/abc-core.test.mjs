import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseScore, numberedNotes, numberedSVG, synthesizePCM, encodeWAV } from '../dist/abc-core.js';
const sandbox={};vm.runInNewContext(fs.readFileSync(new URL('../dist/vendor/abcjs-6.7.1.min.js',import.meta.url),'utf8'),sandbox);
const parse=(abc,options={})=>parseScore(abc,{library:sandbox.ABCJS,...options});
const header='X:1\nT:测试乐谱\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\n';

test('audio follows pitches, rests, chords, ties and repeats rather than a canned demo',()=>{
 const score=parse(header+'|: [CEG] z C-C :|');
 assert.equal(score.events.length,8);
 assert.deepEqual(Array.from(score.events.slice(0,3),n=>n.midi),[60,64,67]);
 assert.equal(score.events[3].start,1);
 assert.equal(score.events[3].duration,1);
 assert.equal(score.duration,4);
 const faster=parse(header+'C D E F|',{tempo:240});
 assert.equal(faster.duration,1);
});
test('compound meter and dotted-quarter tempo keep correct timing',()=>{
 const score=parse('X:1\nM:6/8\nL:1/8\nQ:3/8=60\nK:G\nGABcde|');
 assert.ok(Math.abs(score.duration-2)<.00001);
 assert.ok(Math.abs(score.events[1].start-1/3)<.00001);
 assert.equal(score.bpm,90);
});
test('numbered notation respects key, carried accidentals, octave, rests and dotted values',()=>{
 const score=parse('X:1\nT:<script>test</script>\nM:4/4\nL:1/8\nK:G\nG2 F =F F | f3 z g2 |');
 const notes=numberedNotes(score).filter(n=>n.kind==='note');
 assert.equal(notes[0].pitches[0].degree,1);
 assert.equal(notes[1].pitches[0].degree,7);
 assert.equal(notes[1].pitches[0].accidental,0);
 assert.equal(notes[2].pitches[0].accidental,-1);
 assert.equal(notes[3].pitches[0].accidental,-1);
 assert.equal(notes[4].pitches[0].accidental,0);
 assert.equal(notes[4].duration,.375);
 assert.equal(notes[5].rest,true);
 assert.equal(notes[6].pitches[0].octave,1);
 const svg=numberedSVG(score);assert.match(svg,/&lt;script&gt;/);assert.doesNotMatch(svg,/<script>/);assert.match(svg,/viewBox=/);
});
test('simple synthesis exports valid non-silent bounded PCM WAV',()=>{
 const score=parse(header+'C D E F|');
 const pcm=synthesizePCM(score,{instrument:'keys'}),wav=encodeWAV(pcm),view=new DataView(wav);
 assert.equal(Buffer.from(wav).subarray(0,4).toString(),'RIFF');
 assert.equal(Buffer.from(wav).subarray(8,12).toString(),'WAVE');
 assert.equal(view.getUint32(24,true),22050);assert.equal(view.getUint32(40,true),pcm.data.length*2);
 const peak=pcm.data.reduce((n,v)=>Math.max(n,Math.abs(v)),0);assert.ok(peak>.1&&peak<1);
 assert.ok(pcm.data.some(v=>v<0));
 const silence=pcm.data.subarray(Math.floor(2.6*22050));assert.ok(silence.every(v=>Math.abs(v)<.0001));
});
test('invalid and oversized scores report actionable errors',()=>{
 assert.throws(()=>parse('hello'),/K:/);
 assert.throws(()=>parse(header+'z4|'),/没有识别到音符/);
 assert.throws(()=>parse(header+'C4|',{tempo:0}),/30–240/);
 assert.throws(()=>parse(header+'C4|\nX:2\nK:C\nC4|'),/只放一首/);
 assert.throws(()=>parse(header+'C4|'.repeat(17000)),/5000/);
});

test('多声部纯音乐的简谱跳过没有旋律的 Vocal 声部',()=>{
 const score=parse('X:1\nM:4/4\nL:1/4\nV:Vocal\nV:Ins\nK:C\nV:Vocal\nz4|\nV:Ins\nC D E F|');
 assert.equal(score.voiceIndex,1);assert.deepEqual(Array.from(numberedNotes(score).filter(n=>n.kind==='note'),n=>n.pitches[0].degree),[1,2,3,4]);assert.match(numberedSVG(score),/第2声部/);
});
