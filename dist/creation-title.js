import {voicePresets} from './voice-presets.js';
export function creationTitle(work,{voices=[],uploads=[],training=[]}={}){
 const form=work.form||{},title=work.title||'';
 if(work.type!=='speech'||form.speechModel!=='tts')return title;
 const uploaded=form.voiceSource==='upload',id=uploaded?form.cloneSample:form.libraryVoice;
 const name=form.referenceName||(uploaded?form.cloneName:'')||voicePresets.find(v=>v.id===id)?.name||uploads.find(v=>v.id===id)?.name||voices.find(v=>v.id===id)?.name||training.find(v=>v.id===id)?.name;
 return name?title+' · '+name:title;
}
