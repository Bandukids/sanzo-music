import {safeReturnPath} from './auth-routing.js';
const $=selector=>document.querySelector(selector);
const params=new URLSearchParams(location.search),returnTo=safeReturnPath(params.get('next'));
function showMode(mode){const register=mode==='register';$('#auth-form').hidden=register;$('#registration-help').hidden=!register;$('#heading').textContent=register?'通过邀请加入 SANZO':'欢迎回来';$('#description').textContent=register?'打开管理员发给你的邀请链接，设置密码即可完成注册。':'登录后即可开始创作，浏览和聆听无需登录。';document.querySelectorAll('[data-auth-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.authMode===mode)));}
document.querySelectorAll('[data-auth-mode]').forEach(button=>button.addEventListener('click',()=>showMode(button.dataset.authMode)));
showMode(params.get('mode')==='register'?'register':'login');
let invite=new URLSearchParams(location.hash.slice(1)).get('invite');
if(invite){history.replaceState(null,'',location.pathname+location.search);$('#auth-tabs').hidden=true;$('#auth-form').hidden=false;$('#registration-help').hidden=true;$('#heading').textContent='设置你的密码';$('#description').textContent='邀请链接仅可使用一次。密码至少需要 12 个字符，每个账号默认 1GB 空间。';$('#email-label').hidden=true;$('#email').required=false;$('#password').autocomplete='new-password';$('#password').minLength=12;$('#submit').textContent='完成注册';}
$('#auth-form').addEventListener('submit',async event=>{
 event.preventDefault();$('#submit').disabled=true;$('#feedback').textContent='';
 try{const response=await fetch(invite?'/api/auth/accept':'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(invite?{token:invite,password:$('#password').value}:{email:$('#email').value,password:$('#password').value})});const result=await response.json();if(!response.ok)throw Error(result.error?.message||'暂时无法登录。');
  if(invite){invite=null;$('#heading').textContent='密码已设置';$('#description').textContent='现在可以使用受邀邮箱和新密码登录。';$('#email-label').hidden=false;$('#email').required=true;$('#password').value='';$('#password').autocomplete='current-password';$('#password').minLength=1;$('#submit').textContent='登录';$('#email').focus();}else location.assign(returnTo);
 }catch(error){$('#feedback').textContent=error.message;}finally{$('#submit').disabled=false;}
});
