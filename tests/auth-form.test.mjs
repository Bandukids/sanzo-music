import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
const bundle=(await build({entryPoints:['dist/auth.js'],bundle:true,write:false,format:'iife',platform:'browser'})).outputFiles[0].text;
async function page({open=true,search='?mode=register',hash=''}={}){
 const html=await readFile('dist/login/index.html','utf8'),elements=new Map(),requests=[],redirects=[],history=[];
 class Element{constructor(){this.value='';this.hidden=false;this.disabled=false;this.required=false;this.textContent='';this.listeners={};this.dataset={};}addEventListener(name,listener){this.listeners[name]=listener;}setAttribute(name,value){this[name]=value;}focus(){this.focused=true;}async trigger(name){await this.listeners[name]?.({preventDefault(){}});}}
 for(const match of html.matchAll(/id="([^"]+)"/g))elements.set('#'+match[1],new Element());
 const tabs=['login','register'].map(mode=>{const element=new Element();element.dataset.authMode=mode;return element;});
 const document={querySelector:selector=>{assert.ok(elements.has(selector),'DOM target '+selector);return elements.get(selector);},querySelectorAll:selector=>{assert.equal(selector,'[data-auth-mode]');return tabs;}};
 vm.runInNewContext(bundle,{document,location:{pathname:'/login/',search,hash,assign:value=>redirects.push(value)},history:{replaceState:(...args)=>history.push(args)},URL,URLSearchParams,fetch:async(path,init)=>{if(path==='/api/auth/options')return Response.json({registrationOpen:open});requests.push({path,body:JSON.parse(init.body)});return Response.json({ok:true},{status:path==='/api/auth/register'?201:200});},console});
 for(let index=0;index<5;index++)await new Promise(resolve=>setImmediate(resolve));
 return {element:id=>elements.get('#'+id),tabs,requests,redirects,history};
}
test('the public signup form confirms passwords, submits only account fields and returns to the creation page',async()=>{
 const state=await page({search:'?mode=register&next=%2Fcreate%2F'});assert.equal(state.element('auth-form').hidden,false);assert.equal(state.element('name-label').hidden,false);assert.equal(state.element('password').minLength,12);
 state.element('email').value=' visitor@example.test ';state.element('name').value=' 展会用户 ';state.element('password').value='my-test-password';state.element('confirm-password').value='different';await state.element('auth-form').trigger('submit');assert.equal(state.requests.length,0);assert.match(state.element('feedback').textContent,/不一致/);
 state.element('confirm-password').value='my-test-password';await state.element('auth-form').trigger('submit');assert.deepEqual(state.requests,[{path:'/api/auth/register',body:{email:'visitor@example.test',password:'my-test-password',name:'展会用户'}}]);assert.deepEqual(state.redirects,['/create/']);
});
test('closed signup explains invitations and login never requests a confirmation password',async()=>{
 const state=await page({open:false});assert.equal(state.element('auth-form').hidden,true);assert.equal(state.element('registration-help').hidden,false);
 await state.tabs[0].trigger('click');assert.equal(state.element('auth-form').hidden,false);assert.equal(state.element('confirm-password').required,false);assert.equal(state.element('name-label').hidden,true);
 state.element('email').value='member@example.test';state.element('password').value='password';await state.element('auth-form').trigger('submit');assert.equal(state.requests[0].path,'/api/auth/login');assert.deepEqual(state.redirects,['/']);
});
test('existing invitation links still set a password and strip the secret fragment from history',async()=>{
 const invite='i'.repeat(43),state=await page({hash:'#invite='+invite});assert.equal(state.element('auth-tabs').hidden,true);assert.equal(state.element('email').required,false);assert.equal(state.history.length,1);assert.equal(state.history[0][2],'/login/?mode=register');
 state.element('password').value='new-test-password';state.element('confirm-password').value='new-test-password';await state.element('auth-form').trigger('submit');assert.equal(state.requests[0].path,'/api/auth/accept');assert.equal(state.requests[0].body.token,invite);assert.equal(state.element('email').required,true);assert.equal(state.element('password').value,'');assert.match(state.element('feedback').textContent,/密码已设置/);assert.deepEqual(state.redirects,[]);
});
