import { api } from '/cloud-state.js';
export async function storeAudio(id,blob,kind='voice') {
 return api('/api/assets/'+encodeURIComponent(id),{method:'PUT',headers:{'Content-Type':blob.type||'application/octet-stream','X-File-Name':encodeURIComponent(blob.name||'reference.wav'),'X-Asset-Kind':kind},body:blob});
}
export async function readAudio(id) {
 const response=await fetch('/api/assets/'+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store'});
 if(!response.ok){let message='无法读取云端音频。';try{message=(await response.json()).error.message;}catch{}throw Error(message);}
 return response.blob();
}
export const audioURL=id=>'/api/assets/'+encodeURIComponent(id);
export async function checkAudio(id) {
 const response=await fetch(audioURL(id),{method:'HEAD',credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw Error('无法读取云端音频。');
 return true;
}
