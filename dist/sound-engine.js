export class SoundEngine{
 constructor(){this.context=null;this.voices=new Set();this.timer=null;this.level=.55;this.operation=0;}
 async start(track,offset=0){
  this.stop();const operation=this.operation;
  if(!this.context){const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)throw Error('audio-unavailable');this.context=new AudioContext();}
  const ctx=this.context;await ctx.resume();if(operation!==this.operation)return false;
  this.prepare(track,ctx);this.step=Math.floor(offset/this.stepDuration);this.next=ctx.currentTime+.07;
  const tick=()=>{while(this.next<ctx.currentTime+.12){this.schedule(this.step,this.next);this.next+=this.stepDuration;this.step++;}};
  tick();this.timer=setInterval(tick,30);return true;
 }
 prepare(track,ctx){
  this.context=ctx;this.output=ctx.createGain();this.output.gain.value=this.level*.45;
  const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-20;compressor.ratio.value=4;this.output.connect(compressor);compressor.connect(ctx.destination);
  this.compressor=compressor;
  const delay=ctx.createDelay(1);delay.delayTime.value=.28;const feedback=ctx.createGain();feedback.gain.value=.2;const wet=ctx.createGain();wet.gain.value=.18;this.output.connect(delay);delay.connect(feedback);feedback.connect(delay);delay.connect(wet);wet.connect(compressor);this.delayNodes=[delay,feedback,wet];
  const tempos={electronic:112,pop:100,chill:78,ambient:64,jazz:88,cinematic:72};this.style=track.style;this.stepDuration=60/(tempos[track.style]||90)/4;
  this.root=track.id.split('').reduce((s,c)=>s+c.charCodeAt(0),0)%3===0?57:60;
  this.noise=ctx.createBuffer(1,ctx.sampleRate*.3,ctx.sampleRate);const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/data.length*5);
 }
 tone(midi,time,duration,volume=.1,type='sine'){
  const ctx=this.context;const osc=ctx.createOscillator();const gain=ctx.createGain();const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=this.style==='electronic'?2700:1700;osc.type=type;osc.frequency.value=440*Math.pow(2,(midi-69)/12);
  gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(volume,time+.025);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);osc.connect(filter);filter.connect(gain);gain.connect(this.output);osc.start(time);osc.stop(time+duration+.05);this.voices.add(osc);osc.onended=()=>{this.voices.delete(osc);osc.disconnect();filter.disconnect();gain.disconnect();};
 }
 kick(time){const ctx=this.context;const osc=ctx.createOscillator();const gain=ctx.createGain();osc.frequency.setValueAtTime(135,time);osc.frequency.exponentialRampToValueAtTime(38,time+.16);gain.gain.setValueAtTime(.35,time);gain.gain.exponentialRampToValueAtTime(.0001,time+.24);osc.connect(gain);gain.connect(this.output);osc.start(time);osc.stop(time+.26);this.voices.add(osc);osc.onended=()=>{this.voices.delete(osc);osc.disconnect();gain.disconnect();};}
 hit(time,snare=false){const ctx=this.context;const src=ctx.createBufferSource();src.buffer=this.noise;const filter=ctx.createBiquadFilter();filter.type='highpass';filter.frequency.value=snare?1600:7000;const gain=ctx.createGain();gain.gain.setValueAtTime(snare?.16:.055,time);gain.gain.exponentialRampToValueAtTime(.0001,time+(snare?.13:.045));src.connect(filter);filter.connect(gain);gain.connect(this.output);src.start(time);src.stop(time+.17);this.voices.add(src);src.onended=()=>{this.voices.delete(src);src.disconnect();filter.disconnect();gain.disconnect();};}
 schedule(step,time){
  const beat=step%16;const bar=Math.floor(step/16)%4;const roots=[0,-5,-8,-3];const root=this.root+roots[bar];const chord=[root,root+3,root+7,root+10];const relaxed=['ambient','cinematic'].includes(this.style);
  if(beat===0){chord.forEach((n,i)=>this.tone(n+12,time+i*.015,this.stepDuration*19,.055,'triangle'));this.tone(root-12,time,this.stepDuration*12,.15,'sine');}
  if(!relaxed){if(beat%8===0||(this.style==='electronic'&&beat%4===0))this.kick(time);if(beat===4||beat===12)this.hit(time,true);if(beat%2===0)this.hit(time+.01);if(beat===8)this.tone(root-12,time,this.stepDuration*5,.12);}
  const sequence=[0,2,1,3,2,1,3,2];if(step%(relaxed?4:2)===0)this.tone(chord[sequence[Math.floor(step/2)%8]]+24,time+(beat%4===2?.018:0),this.stepDuration*(relaxed?7:3),relaxed?.065:.085,this.style==='electronic'?'triangle':'sine');
 }
 setVolume(level){this.level=level;if(this.output&&this.context)this.output.gain.setTargetAtTime(level*.45,this.context.currentTime,.03);}
 stop(){this.operation++;clearInterval(this.timer);this.timer=null;for(const voice of this.voices){try{voice.stop();}catch{}}this.voices.clear();if(this.output){try{this.output.disconnect();this.compressor.disconnect();this.delayNodes.forEach(n=>n.disconnect());}catch{}}}
}
