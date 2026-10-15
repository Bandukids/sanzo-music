import { api } from '/cloud-state.js';
import { downloadJSON } from '/account-controls.js';
import { legacyData, importLegacy } from '/legacy-import.js';
const $=s=>document.querySelector(s),size=n=>n>=1073741824?(n/1073741824).toFixed(1)+' GB':n>=1048576?(n/1048576).toFixed(1)+' MB':(n/1024).toFixed(1)+' KB';
let documents={},profile;
function feedback(id,message,error=false){$(id).textContent=message;$(id).dataset.error=String(error);}
async function load(){
 try{const [account,workspace,training,explore,assets,people]=await Promise.all([api('/api/account'),api('/api/state/workspace'),api('/api/state/training'),api('/api/state/explore'),api('/api/assets'),api('/api/state/people')]);
  profile=account.profile;documents={workspace:workspace.data,training:training.data,explore:explore.data,people:people.data};$('#profile-name').value=profile.name;$('#profile-email').value=profile.email;$('#profile-name').disabled=false;$('#save-profile').disabled=false;$('#export-data').disabled=false;
  $('#stat-works').textContent=(workspace.data?.drafts||[]).filter(d=>!d.trashed).length;$('#stat-albums').textContent=workspace.data?.albums?.length||0;$('#stat-assets').textContent=assets.assets.length;$('#storage-label').textContent=size(account.storage.used)+' / '+size(account.storage.limit);const percent=Math.min(100,account.storage.used/account.storage.limit*100);$('#storage-fill').style.width=percent+'%';$('.storage-meter').setAttribute('aria-valuenow',String(Math.round(percent)));
  feedback('#profile-feedback',account.local?'本地开发账号；数据保存在开发环境。':'已连接当前登录账号。');if(account.local)$('#account-note').textContent='当前为本地开发预览，使用独立测试账号与本地数据库，不会修改线上账号资料。';
  const legacy=legacyData(),works=legacy.workspace?.drafts?.length||0,albums=legacy.workspace?.albums?.length||0,audio=(legacy.training?.assets||[]).filter(a=>a.source==='uploaded').length;$('#import-summary').textContent=Object.keys(legacy).length?`找到 ${works} 份草稿、${albums} 张专辑、${audio} 段上传素材。`:'此浏览器没有需要导入的原型资料。';$('#import-local').disabled=!Object.keys(legacy).length;
 }catch(error){feedback('#profile-feedback',error.message,true);$('#import-summary').textContent='连接云端后可导入资料。';}
}
$('#profile-form').addEventListener('submit',async event=>{event.preventDefault();$('#save-profile').disabled=true;try{const saved=await api('/api/account',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('#profile-name').value})});profile.name=saved.name;feedback('#profile-feedback','资料已保存。');}catch(error){feedback('#profile-feedback',error.message,true);}finally{$('#save-profile').disabled=false;}});
$('#export-data').addEventListener('click',()=>downloadJSON({exportedAt:new Date().toISOString(),profile,documents},'sanzo-my-data.json'));
$('#import-local').addEventListener('click',async()=>{$('#import-local').disabled=true;try{const result=await importLegacy(message=>feedback('#import-feedback',message));await load();feedback('#import-feedback',`导入完成，已保存 ${result.uploaded} 段音频。`+(result.missing?` ${result.missing} 段本地文件缺失，请重新上传。`:'本地原件已保留。'));}catch(error){feedback('#import-feedback',error.message+' 已保存部分会保留，可再次导入。',true);}finally{$('#import-local').disabled=false;}});
await load();

const logout=document.querySelector('a[href^="/signout-with-chatgpt"]');
logout?.addEventListener('click',async event=>{event.preventDefault();try{await api('/api/auth/logout',{method:'POST'});location.assign('/login/');}catch(error){feedback('#profile-feedback',error.message,true);}});
api('/api/auth/session').then(({user})=>{if(user.role==='admin')document.querySelector('#admin-entry').hidden=false;}).catch(()=>{});
