export async function generationRequest(path='',body) {
 const response=await fetch('/api/generations'+path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(120000)});
 let data;try{data=await response.json();}catch{throw new Error('生成服务暂时无法读取，请稍后查看任务记录。');}
 if(!response.ok)throw new Error(data.error?.message||'音乐生成暂不可用。');return data;
}
export const generationStatus={planning:'AI 编排中',submitting:'提交中',queued:'排队中',running:'生成中',succeeded:'已生成',failed:'生成失败',unknown:'待核对提交'};
export const isMusicPending=status=>['planning','submitting','queued','running'].includes(status);
export const generationHint={planning:'正在安排歌词结构、节奏与歌曲时长',submitting:'正在提交创作任务',queued:'任务已进入队列，请稍候',running:'正在生成音频，完成后将自动保存'};
export async function downloadMusic(track,toast) {
 try{
  const response=await fetch(track.audioURL,{credentials:'same-origin'});if(!response.ok)throw new Error('暂时无法下载这首歌曲。');
  const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');
  link.href=url;link.download=track.title.replace(/[\\/:*?"<>|]/g,'_')+(response.headers.get('content-type')?.includes('flac')?'.flac':'.mp3');link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }catch(error){toast(error.message);}
}
