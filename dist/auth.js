import {safeReturnPath} from './auth-routing.js';
const $=selector=>document.querySelector(selector);
const params=new URLSearchParams(location.search),returnTo=safeReturnPath(params.get('next'));
let mode=params.get('mode')==='register'?'register':'login',registrationOpen=null,busy=false;
let invite=new URLSearchParams(location.hash.slice(1)).get('invite');
if(invite)history.replaceState(null,'',location.pathname+location.search);
function render(){
 const register=!invite&&mode==='register',settingPassword=!!invite||register;
 $('#auth-tabs').hidden=!!invite;$('#auth-form').hidden=register&&registrationOpen!==true;$('#registration-help').hidden=!register||registrationOpen===true;
 $('#name-label').hidden=!register||registrationOpen!==true;$('#email-label').hidden=!!invite;$('#email').required=!invite;
 $('#email').autocomplete=register?'email':'username';$('#confirm-label').hidden=!settingPassword;$('#confirm-password').required=settingPassword;$('#confirm-password').minLength=12;
 $('#password').autocomplete=settingPassword?'new-password':'current-password';$('#password').minLength=settingPassword?12:1;$('#password-hint').hidden=!settingPassword;
 $('#heading').textContent=invite?'设置你的密码':register?'加入 SANZO':'欢迎回来';
 $('#description').textContent=invite?'邀请链接仅可使用一次。设置密码后即可登录。':register?'使用邮箱注册，获得 1GB 作品空间。':'登录后即可开始创作，浏览和聆听无需登录。';
 $('#registration-message').textContent=registrationOpen===null?'正在确认注册方式…':'公开注册暂未开放。请使用管理员发给你的邀请链接，或联系管理员。';
 $('#submit').textContent=invite?'设置密码':register?'注册并开始创作':'登录';$('#submit').disabled=busy;
 document.querySelectorAll('[data-auth-mode]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.authMode===mode));button.disabled=busy||button.dataset.authMode==='register'&&registrationOpen===null;if(button.dataset.authMode==='register')button.textContent=registrationOpen===false?'邀请注册':'注册';});
}
document.querySelectorAll('[data-auth-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.authMode;$('#feedback').textContent='';render();}));
async function loadPolicy(){try{const response=await fetch('/api/auth/options',{cache:'no-store'});if(!response.ok)throw Error();const result=await response.json();registrationOpen=result.registrationOpen===true;render();}catch{if(mode==='register')$('#registration-message').textContent='暂时无法确认注册方式，请刷新后重试。';}}
render();if(!invite)void loadPolicy();
$('#auth-form').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;$('#feedback').textContent='';
 const register=!invite&&mode==='register';
 if(register&&registrationOpen!==true){$('#feedback').textContent='公开注册暂未开放。';return;}
 if((invite||register)&&$('#password').value!==$('#confirm-password').value){$('#feedback').textContent='两次输入的密码不一致。';$('#confirm-password').focus();return;}
 const payload=invite?{token:invite,password:$('#password').value}:{email:$('#email').value.trim(),password:$('#password').value};
 if(register&&$('#name').value.trim())payload.name=$('#name').value.trim();
 busy=true;render();
 try{const response=await fetch(invite?'/api/auth/accept':register?'/api/auth/register':'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw Error(result.error?.message||'暂时无法完成操作，请重试。');
  if(invite){invite=null;mode='login';$('#password').value='';$('#confirm-password').value='';render();$('#feedback').textContent='密码已设置，请使用受邀邮箱和新密码登录。';$('#email').focus();void loadPolicy();}else location.assign(returnTo);
 }catch(error){$('#feedback').textContent=error.message;}finally{busy=false;render();}
});
