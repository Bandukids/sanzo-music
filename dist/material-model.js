export const materialType=value=>({songs:'music',music:'music',speech:'speech',voice:'speech',sounds:'sounds',abc:'abc'})[value]||'music';
export const materialNotation=d=>d?.abcNotation||d?.form?.abcNotation||'';
export function draftFromJob(job){
 const i=job.input,analysis=i.model==='cover-inference',type=analysis?'abc':i.type==='speech'?'speech':i.type==='abc'||i.model==='yue2-abc'?'abc':'songs';
 return {id:'generation-'+job.id,jobId:job.id,type,title:i.title||'未命名作品',kind:job.assetId?'generated':'draft',jobStatus:job.status,jobError:job.error,assetId:job.assetId||null,workspace:type==='speech'?'speech':type==='abc'?'abc':'default',styles:i.styles||i.coverStyles||'',lyrics:i.lyrics||i.structuredLyrics||i.inferredLyrics||'',description:i.description||'',art:'liquid-glass.png',form:{...i,...(analysis?{abcFlow:'score',abcNotation:i.abcNotation||''}:{})}};
}
export function collectMaterials(assets=[],drafts=[],metadata={items:[]},generationSeen=[]){
 const meta=new Map((metadata.items||[]).map(m=>[m.id,m])),linked=new Set(drafts.map(d=>d.assetId).filter(Boolean)),result=[];
 for(const d of drafts){if(d.trashed||meta.get(d.assetId)?.trashed||(!d.assetId&&!materialNotation(d)))continue;const a=assets.find(a=>a.id===d.assetId);result.push({id:d.id,assetId:d.assetId,draft:d,source:'draft',origin:'generated',type:materialType(d.type),title:d.materialName||d.title||'未命名作品',name:a?.name||d.title,art:d.art,bytes:a?.bytes||0,created_at:a?.created_at||d.createdAt||'',notation:materialNotation(d),audioURL:d.assetId?'/api/assets/'+d.assetId:null});}
 for(const a of assets){if(linked.has(a.id)||meta.get(a.id)?.trashed||a.status&&a.status!=='ready'||!['upload-music','upload-speech','voice','upload-abc','music','speech'].includes(a.kind)||['music','speech'].includes(a.kind)&&generationSeen.includes(a.id.replace(/^music-/,''))&&!drafts.some(d=>d.jobId===a.id.replace(/^music-/,'')))continue;result.push({...a,assetId:a.id,source:'asset',origin:a.kind.startsWith('upload-')||a.kind==='voice'?'uploaded':'generated',type:materialType(a.kind.replace('upload-','')),title:meta.get(a.id)?.name||a.name,art:'liquid-glass.png',audioURL:a.kind==='upload-abc'?null:'/api/assets/'+a.id});}
 return result;
}
export function recycleJob(state,job){state.drafts??=[];state.generationSeen??=[];let d=state.drafts.find(d=>d.jobId===job.id);if(!d){d=draftFromJob(job);state.drafts.unshift(d);}d.trashed=true;d.removedAt=Date.now();if(!state.generationSeen.includes(job.id))state.generationSeen.push(job.id);return d;}
export function isHiddenJob(state,id){return state.drafts?.some(d=>d.jobId===id&&d.trashed)||state.generationSeen?.includes(id)&&!state.drafts?.some(d=>d.jobId===id);}
