import {requestAssistant,withAIButton,isAssistantBusy} from '/ai-assistant.js';
const languages=[['zh','中文'],['en','英语'],['ja','日语'],['ko','韩语'],['es','西班牙语'],['fr','法语'],['de','德语'],['vi','越南语'],['ru','俄语']];
export function coverFields(){return `<fieldset id="studio-cover-fields"><div class="studio-field-title"><span>03</span><h3>翻唱设置</h3></div><div class="studio-lyrics-heading"><label for="studio-cover-lyrics">翻唱歌词 <small>可编辑</small></label><button type="button" id="studio-use-original">载入原歌词</button></div><textarea id="studio-cover-lyrics" rows="6" maxlength="50000" placeholder="解析完成后自动载入歌词，也可以填写新的歌词。"></textarea><div class="studio-lyrics-language-row"><label for="studio-lyric-language">歌词语言</label><div class="studio-lyrics-language-controls"><select id="studio-lyric-language" aria-label="歌词目标语言">${languages.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select><button type="button" id="studio-translate-lyrics" data-ai-action>翻译歌词</button></div></div><div class="studio-lyrics-heading"><label for="studio-cover-style">音乐风格 <small>选填</small></label><button type="button" id="studio-polish-style" data-ai-action><svg aria-hidden="true"><use href="#i-spark"/></svg>AI 润色</button></div><textarea id="studio-cover-style" rows="3" maxlength="1000" placeholder="例如：温暖女声、爵士、90 BPM、钢琴与贝斯… 留空时优先使用原作品风格，或由 AI 构思。"></textarea><p>歌词与风格可以单独修改。原曲解析结果始终保留。</p></fieldset>`;}
export function initStudioCover({message,getContext}){
 const form=document.querySelector('#studio-form'),lyrics=document.querySelector('#studio-cover-lyrics'),language=document.querySelector('#studio-lyric-language');let revision=0;
 for(const event of ['input','change','reset'])form.addEventListener(event,()=>revision++);
 const snapshot=()=>JSON.stringify([getContext(),lyrics.value,language.value,document.querySelector('#studio-cover-style').value,document.querySelector('#studio-result-name').value]);
 document.querySelector('#studio-translate-lyrics').onclick=async event=>{
  if(isAssistantBusy())return;
  const text=lyrics.value.trim(),target=language.value;
  if(!text){message('先填写或载入需要翻译的歌词。');lyrics.focus();return;}
  if(text.length>5000){message('歌词翻译支持 5000 字以内，请精简后再翻译。');return;}
  const before=snapshot(),ticket=revision;
  try{await withAIButton(event.currentTarget,'翻译中…',async()=>{
   const result=await requestAssistant({action:'translate',kind:'songs',target:'lyrics',text,context:{language:target}});
   if(revision!==ticket||snapshot()!==before){message('输入已修改，保留了新的内容。');return;}
   lyrics.value=result.text;lyrics.dispatchEvent(new Event('input',{bubbles:true}));
   message('歌词已翻译为'+language.selectedOptions[0].text+'。');
  });}catch(error){message(error.message);}
 };
 document.querySelector('#studio-polish-style').onclick=async event=>{
  if(isAssistantBusy())return;
  const styles=document.querySelector('#studio-cover-style'),text=styles.value.trim();
  if(!text){message('先填写想要的音乐风格，再使用 AI 润色。');styles.focus();return;}
  const before=snapshot(),ticket=revision;
  try{await withAIButton(event.currentTarget,'润色中…',async()=>{
   const result=await requestAssistant({action:'polish',kind:'songs',target:'styles',text,context:{musicModel:'yue2',language:language.value,lyrics:lyrics.value.slice(0,5000),instrumental:!lyrics.value.trim()}});
   if(revision!==ticket||snapshot()!==before){message('输入已修改，保留了新的内容。');return;}
   styles.value=result.text;styles.dispatchEvent(new Event('input',{bubbles:true}));
   message('音乐风格已润色。');
  });}catch(error){message(error.message);}
 };
}
