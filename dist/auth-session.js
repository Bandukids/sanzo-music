import {loginURL} from './auth-routing.js';
let cached,expires=0,loading;
export function clearAuthSession(){cached=undefined;expires=0;loading=null;}
export async function currentUser(){
 if(cached!==undefined&&Date.now()<expires)return cached;
 if(loading)return loading;
 loading=(async()=>{try{const response=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});if(response.status===401)cached=null;else{const data=await response.json();if(!response.ok)throw Error(data.error?.message||'暂时无法确认登录状态，请重试。');cached=data.user;}expires=Date.now()+30000;return cached;}finally{loading=null;}})();return loading;
}
export async function requireSignIn({returnTo=location.pathname+location.search+location.hash,beforeRedirect}={}){
 if(await currentUser())return true;
 await beforeRedirect?.();
 window.dispatchEvent(new CustomEvent('sanzo-before-sign-in'));
 location.assign(loginURL(returnTo));return false;
}
