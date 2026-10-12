import {handleAssistant} from './assistant.mjs';
const invalid=message=>Object.assign(Error(message),{input:true});
const languages={zh:'Chinese',en:'English',ja:'Japanese',ko:'Korean',es:'Spanish',fr:'French',de:'German',vi:'Vietnamese',ru:'Russian'};
export function studioCoverInput(body){
 if(body.type!=='songs'||body.studioTool!=='cover')throw invalid('请选择 Studio 的音乐翻唱。');
 const field=(key,max,fallback='')=>{const value=body[key]??fallback;if(typeof value!=='string'||value.length>max)throw invalid('翻唱内容格式不正确或过长。');return value.trim();};
 const sourceAsset=field('sourceAsset',120),analysisJobId=field('analysisJobId',36);
 if(!/^[a-zA-Z0-9_-]{1,120}$/.test(sourceAsset)||!/^[-a-f0-9]{36}$/.test(analysisJobId))throw invalid('请先完成所选歌曲的解析。');
 const lyrics=field('lyrics',50000),styles=field('styles',1000),rawTitle=field('title',60),language=field('language',20,'zh');
 if(!Object.hasOwn(languages,language))throw invalid('歌词语言无效。');
 const autoTitle=body.autoTitle===true||!rawTitle;
 return {model:'yue2-cover',type:'songs',studioTool:'cover',sourceAsset,analysisJobId,lyrics,styles,language,title:autoTitle?'翻唱作品':rawTitle,autoTitle,workspace:'default',description:'根据原曲旋律重新演绎歌词与风格。',mode:'simple',instrumental:!lyrics,backgroundMusic:true,gender:'auto',duration:600};
}
export async function prepareStudioCover(input,owner,env,store,fetcher=fetch){
 const [analysis,asset,workspace,uploads]=await Promise.all([
  store.statement('SELECT input,status FROM generations WHERE owner=? AND id=?',owner,input.analysisJobId).first(),store.asset(owner,input.sourceAsset),store.document(owner,'workspace'),store.document(owner,'uploads')
 ]);
 const original=analysis?JSON.parse(analysis.input):null;
 if(analysis?.status!=='succeeded'||original?.model!=='cover-inference'||original.sourceAsset!==input.sourceAsset)throw invalid('请先完成当前歌曲的解析。');
 if(!asset||!asset.mime.startsWith('audio/')||['speech','voice','upload-speech'].includes(asset.kind))throw invalid('原曲素材不可用，请重新选择歌曲。');
 const draft=workspace.data?.drafts?.find(d=>d.assetId===input.sourceAsset),upload=uploads.data?.items?.find(item=>item.id===input.sourceAsset);
 if(draft?.trashed||upload?.trashed)throw invalid('原曲已移入回收站，请恢复后使用。');
 const abc=original.abcNotation;
 if(typeof abc!=='string'||abc.length>50000||!/^X:\s*\d+/m.test(abc)||!/^K:\s*\S+/m.test(abc))throw invalid('原曲 ABC 尚未保存，请先完成解析。');
 const originalStyle=draft?.form?.styles||draft?.styles;
 let coverStyles=input.styles||(typeof originalStyle==='string'?originalStyle.trim().slice(0,1000):'');
 if(!coverStyles){
  const response=await handleAssistant(new Request('https://sanzo.internal/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'styles',kind:'songs',target:'styles',text:input.lyrics.slice(0,500),context:{lyrics:input.lyrics.slice(0,5000),language:input.language,musicModel:'yue2',instrumental:input.instrumental}})}),env,{fetchImpl:fetcher,rateLimit:false});
  const data=await response.json();if(!response.ok)throw Error((data.error?.message||'未能构思翻唱风格。')+' 尚未提交翻唱，请稍后重试。');
  coverStyles=data.result.text;
 }
 const sourceName=upload?.name||asset.name||original.sourceName||'参考歌曲';
 return {...input,abcNotation:abc,coverStyles,sourceName};
}
export function studioCoverNodes(input){
 const styles=[input.coverStyles||input.styles,input.instrumental?'instrumental, no vocals':languages[input.language]+' lyrics, '+languages[input.language]+' singing'].filter(Boolean).join(', ');
 return [{nodeId:'15',fieldName:'text',fieldValue:styles},{nodeId:'16',fieldName:'text',fieldValue:input.lyrics},{nodeId:'31',fieldName:'text',fieldValue:input.abcNotation},{nodeId:'32',fieldName:'value',fieldValue:false},{nodeId:'14',fieldName:'value',fieldValue:600.0}];
}
