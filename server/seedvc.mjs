import {speechReference} from './speech-clone.mjs';
import {voicePresets} from '../dist/voice-presets.js';
const invalid=message=>Object.assign(Error(message),{input:true});
export function seedVCInput(body){
 const song=body.model==='seedvc-song',type=song?'songs':'speech',tool=song?'song':'speech';
 if(!['seedvc-speech','seedvc-song'].includes(body.model)||body.type!==type||body.studioTool!==tool)throw invalid('请选择 Studio 的语音或歌曲零样本变声。');
 const field=(key,max)=>{const value=body[key]??'';if(typeof value!=='string'||value.length>max)throw invalid('变声参数格式不正确。');return value.trim();};
 const sourceAsset=field('sourceAsset',120),referenceAsset=field('referenceAsset',120);
 if(!/^[a-zA-Z0-9_-]{1,120}$/.test(sourceAsset))throw invalid('请选择或上传原始'+(song?'歌曲。':'语音。'));
 if(!voicePresets.some(p=>p.id===referenceAsset)&&!/^[a-zA-Z0-9_-]{1,120}$/.test(referenceAsset))throw invalid('请选择或上传目标音色。');
 const title=field('title',60),autoTitle=body.autoTitle===true||!title;
 return {model:body.model,type,studioTool:tool,sourceAsset,referenceAsset,title:autoTitle?(song?'歌曲变声':'语音变声'):title,autoTitle,workspace:song?'default':'speech',description:song?'歌曲零样本变声':'语音零样本变声',styles:song?'使用参考音色替换歌声，保留原曲歌词、音高、旋律与伴奏。':'使用参考音色转换原始语音，保留原始台词与表达。',lyrics:'',mode:'simple'};
}
export async function seedVCSamples(input,owner,env,store){
 const workspace=await store.document(owner,'workspace');
 if(workspace.data?.drafts?.some(d=>d.trashed&&[input.sourceAsset,input.referenceAsset].includes(d.assetId)))throw invalid('所选作品已移入回收站，请恢复后使用。');
 const source=await speechReference({voiceSource:'upload',cloneSample:input.sourceAsset},owner,env,store);
 const reference=await speechReference({voiceSource:'library',libraryVoice:input.referenceAsset},owner,env,store);
 return {source,reference};
}
