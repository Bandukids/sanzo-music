import {voicePresets} from './voice-presets.js';
export function voiceLibrarySamples(assets,metadata={items:[]}){
 const items=metadata.items||[],removed=new Set(items.filter(a=>a.trashed).map(a=>a.id));
 return [...voicePresets,...assets.filter(a=>['upload-speech','voice'].includes(a.kind)&&a.mime?.startsWith('audio/')&&!removed.has(a.id)).map(a=>({id:a.id,name:items.find(m=>m.id===a.id)?.name||a.name}))].filter((a,i,list)=>list.findIndex(v=>v.id===a.id)===i);
}
export function uploadedAudioAssets(assets){
 return assets.filter(a=>['upload-music','upload-speech','voice'].includes(a.kind)).map(a=>a.kind==='voice'?{...a,kind:'upload-speech'}:a);
}
