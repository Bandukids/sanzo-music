import {voicePresets} from '../dist/voice-presets.js';
export function speechCloneInput(body){
 const invalid=message=>Object.assign(Error(message),{input:true});
 if(body.type!=='speech'||body.speechModel!=='tts'||!['qwen-tts','index-tts'].includes(body.ttsModel))throw invalid('请选择已接入的文字转语音模型。');
 const index=body.ttsModel==='index-tts',model=index?'index-voice-clone':'qwen-voice-clone';
 if(body.model&&body.model!==model)throw invalid('语音模型与创作选项不一致。');
 const emotionVector=body.emotionVector===undefined?Array(8).fill(0):body.emotionVector;
 if(index&&(!Array.isArray(emotionVector)||emotionVector.length!==8||emotionVector.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)))throw invalid('八项情绪强度必须为 0 到 1 之间的数值。');
 const field=(key,max,fallback='')=>{const value=body[key]??fallback;if(typeof value!=='string'||value.length>max)throw invalid('语音内容格式不正确或过长。');return value.trim();};
 const speechText=field('speechText',3000);if(!speechText)throw invalid('请填写要说的话。');
 const voiceSource=body.voiceSource==='upload'?'upload':'library',reference=voiceSource==='upload'?field('cloneSample',120):field('libraryVoice',120);
 const preset=voicePresets.find(v=>v.id===reference);
 if(!preset&&!/^[a-zA-Z0-9_-]{1,120}$/.test(reference))throw invalid('请选择有效的音色样本。');
 const rawTitle=field('title',60),autoTitle=body.autoTitle===true||!rawTitle;
 const emotionInfo=index?{emotionDescription:field('emotionDescription',500),emotionSummary:field('emotionSummary',120),emotionSource:body.emotionSource==='ai'?'ai':'manual',emotionManualOverride:body.emotionManualOverride===true}:{};
 return {type:'speech',speechModel:'tts',ttsModel:body.ttsModel,model,...(index?{emotionVector:[...emotionVector],...emotionInfo}:{}),voiceSource,libraryVoice:voiceSource==='library'?reference:'',cloneSample:voiceSource==='upload'?reference:'',speechText,description:speechText,styles:preset?.description||'使用参考样本的原始音色进行语音复刻。',lyrics:'',autoTitle,title:autoTitle?'语音作品':rawTitle,workspace:field('workspace',120,'speech')||'speech',mode:'simple'};
}
export async function speechReference(input,owner,env,store){
 const reference=input.voiceSource==='upload'?input.cloneSample:input.libraryVoice,preset=voicePresets.find(v=>v.id===reference);
 if(preset){
  if(!env.ASSETS)throw Error('预设音色读取暂不可用。');
  const response=await env.ASSETS.fetch(new Request('https://sanzo.internal'+preset.url));if(!response.ok)throw Error('预设音色暂不可用。');
  return {blob:await response.blob(),name:preset.id.slice(7)+'.mp3',referenceName:preset.name};
 }
 const metadata=await store.document(owner,'uploads');
 if(metadata.data?.items?.some(a=>a.id===reference&&a.trashed))throw Object.assign(Error('这份参考音色已移入回收站，请先恢复素材或选择其他声音。'),{input:true});
 const asset=await store.asset(owner,reference);if(!asset||!asset.mime.startsWith('audio/'))throw Object.assign(Error('未找到属于你的参考音频，请重新选择或上传。'),{input:true});
 // RunningHub's audio upload endpoint supports MP3, WAV and FLAC.
 if(!/\.(mp3|wav|flac)$/i.test(asset.name))throw Object.assign(Error('此工作流的参考音频支持 MP3、WAV 或 FLAC，请转换格式后上传。'),{input:true});
 if(asset.bytes>32*1024*1024)throw Object.assign(Error('克隆参考音频需小于 32 MB，请截取一段清晰的单人语音。'),{input:true});
 const object=await env.BUCKET.get(asset.object_key);if(!object)throw Error('参考音频读取失败，请重新上传。');
 return {blob:new Blob([await object.arrayBuffer()],{type:asset.mime}),name:asset.name,referenceName:input.voiceSource==='upload'?asset.name:metadata.data?.items?.find(a=>a.id===reference)?.name||asset.name};
}
export async function uploadSpeechReference(sample,route,key,fetcher=fetch){
 const form=new FormData();form.append('file',sample.blob,sample.name);
 try{
  const response=await fetcher(route.origin+'/openapi/v2/media/upload/binary',{method:'POST',headers:{Authorization:'Bearer '+key},body:form,signal:AbortSignal.timeout(30000)});
  const data=await response.json(),name=data.data?.fileName||data.data?.filename;
  if(!response.ok||![0,200].includes(data.code)||typeof name!=='string'||!name||name.length>500)throw Error('参考音色上传未被接受。');
  return name;
 }catch{throw Object.assign(Error('参考音色上传失败，尚未提交语音生成。'),{rejected:true});}
}
