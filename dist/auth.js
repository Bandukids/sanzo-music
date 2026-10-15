const $=selector=>document.querySelector(selector);
let invite=new URLSearchParams(location.hash.slice(1)).get('invite');
if(invite){history.replaceState(null,'',location.pathname);$('#heading').textContent='设置你的密码';$('#description').textContent='邀请链接仅可使用一次。密码至少需要 12 个字符。';$('#email-label').hidden=true;$('#email').required=false;$('#password').autocomplete='new-password';$('#password').minLength=12;$('#submit').textContent='设置密码';}
$('#auth-form').addEventListener('submit',async event=>{
 event.preventDefault();$('#submit').disabled=true;$('#feedback').textContent='';
 try{const response=await fetch(invite?'/api/auth/accept':'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(invite?{token:invite,password:$('#password').value}:{email:$('#email').value,password:$('#password').value})});const result=await response.json();if(!response.ok)throw Error(result.error?.message||'暂时无法登录。');
  if(invite){invite=null;$('#heading').textContent='密码已设置';$('#description').textContent='现在可以使用邮箱和新密码登录。';$('#email-label').hidden=false;$('#email').required=true;$('#password').value='';$('#password').autocomplete='current-password';$('#password').minLength=1;$('#submit').textContent='登录';$('#email').focus();}else location.assign('/account/');
 }catch(error){$('#feedback').textContent=error.message;}finally{$('#submit').disabled=false;}
});
