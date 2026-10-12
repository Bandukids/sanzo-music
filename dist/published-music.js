async function request(path='',method='GET'){
 const response=await fetch('/api/releases'+path,{method,credentials:'same-origin',headers:method==='POST'?{'Content-Type':'application/json'}:{},...(method==='POST'?{body:'{}'}:{}),signal:AbortSignal.timeout(20000)});
 const data=await response.json();if(!response.ok)throw Error(data.error?.message||'暂时无法读取已发布作品。');return data;
}
export const loadPublishedTracks=async()=>(await request()).tracks;
export const publishSong=id=>request('/'+encodeURIComponent(id),'POST');
export const unpublishSong=id=>request('/'+encodeURIComponent(id),'DELETE');
