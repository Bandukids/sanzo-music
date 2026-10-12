import {speechReference} from './speech-clone.mjs';
const invalid=message=>Object.assign(Error(message),{input:true});
export function coverInferenceInput(body){
 if(body.studioTool!=='cover'||body.type!=='analysis')throw invalid('请选择 Cover 原曲解析。');
 const sourceAsset=body.sourceAsset;
 if(typeof sourceAsset!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(sourceAsset))throw invalid('请选择或上传要解析的歌曲。');
 return {model:'cover-inference',type:'analysis',studioTool:'cover',sourceAsset,autoTitle:true,title:'原曲解析',workspace:'studio',description:'歌词与 ABC 反推',styles:'',lyrics:'',mode:'simple'};
}
export async function coverInferenceSource(input,owner,env,store){
 const workspace=await store.document(owner,'workspace');
 if(workspace.data?.drafts?.some(d=>d.trashed&&d.assetId===input.sourceAsset))throw invalid('原曲已移入回收站，请恢复后使用。');
 return speechReference({voiceSource:'upload',cloneSample:input.sourceAsset},owner,env,store);
}
export async function lyricsResult(results,nodeId,fetcher=fetch,{maxChars=50000,timeout=25000}={}){
 const output=results?.find(r=>String(r.nodeId)===nodeId&&(r.text!==undefined||r.url));
 if(!output)throw Error('尚未获取歌词结果，请稍后重试同步；不会重复解析。');
 let text=typeof output.text==='string'?output.text:Array.isArray(output.text)?output.text.filter(v=>typeof v==='string').join('\n'):null;
 if(text===null){
  const url=new URL(output.url);if(url.protocol!=='https:'||url.username||url.password)throw Error('歌词结果地址无效。');
  const response=await fetcher(url.href,{redirect:'manual',signal:AbortSignal.timeout(timeout)});
  if(!response.ok||!response.body)throw Error('歌词结果暂未保存，请稍后重试同步。');
  const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0;text='';
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>200000){await reader.cancel();throw Error('歌词结果超过保存上限。');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
 }
 if(text.length>maxChars)throw Error('文字结果超过保存上限。');
 return text.trim().replace(/^```(?:text|lyrics)?\s*\n/i,'').replace(/\n```\s*$/,'').trim();
}
