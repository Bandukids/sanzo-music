import { SoundEngine } from './sound-engine.js';
import { lyricCues } from './player-visuals.js';

export const downloadName=title=>String(title).replace(/[\\/:*?"<>|\u0000-\u001f]/g,'').slice(0,80).trim()||'SANZO';
const stamp=seconds=>{const ticks=Math.max(0,Math.round(seconds*100));return '['+String(Math.floor(ticks/6000)).padStart(2,'0')+':'+String(Math.floor(ticks/100)%60).padStart(2,'0')+'.'+String(ticks%100).padStart(2,'0')+']';};
export function lyricsFile(track) {
 const parsed=lyricCues(track);if(!parsed.lines.length)return null;
 return '[ti:'+track.title.replace(/[\r\n\[\]]/g,'')+']\n[ar:'+track.artist.replace(/[\r\n\[\]]/g,'')+']\n[re:SANZO '+(parsed.demo?'示例歌词':parsed.estimated?'歌词时间为估算，未逐句对齐':'同步歌词')+']\n'+parsed.lines.map(line=>stamp(line.at)+line.text).join('\n')+'\n';
}
export function waveFile(buffer) {
 const channels=buffer.numberOfChannels, frames=buffer.length;
 const data=new ArrayBuffer(44+frames*channels*2), view=new DataView(data);
 const word=(at,text)=>{for(let i=0;i<text.length;i++)view.setUint8(at+i,text.charCodeAt(i));};
 word(0,'RIFF');view.setUint32(4,data.byteLength-8,true);word(8,'WAVE');word(12,'fmt ');
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);
 view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*channels*2,true);
 view.setUint16(32,channels*2,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,frames*channels*2,true);
 const samples=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));let at=44;
 for(let frame=0;frame<frames;frame++)for(let channel=0;channel<channels;channel++){
  const sample=Math.max(-1,Math.min(1,samples[channel][frame]));view.setInt16(at,Math.round(sample*(sample<0?32768:32767)),true);at+=2;
 }
 return new Blob([data],{type:'audio/wav'});
}
export async function songFile(track) {
 const OfflineContext=window.OfflineAudioContext||window.webkitOfflineAudioContext;
 if(!OfflineContext)throw Error('offline-audio-unavailable');
 const rate=22050, context=new OfflineContext(2,Math.ceil(track.duration*rate),rate);
 const synth=new SoundEngine();synth.prepare(track,context);let step=0;
 for(let at=.07;at<track.duration;at+=synth.stepDuration){
  synth.schedule(step++,at);
 }
 synth.output.gain.setValueAtTime(synth.level*.45,Math.max(0,track.duration-2));synth.output.gain.linearRampToValueAtTime(0,track.duration);
 return waveFile(await context.startRendering());
}
export function saveDownload(blob,name) {
 const url=URL.createObjectURL(blob), link=document.createElement('a');link.href=url;link.download=name;
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
