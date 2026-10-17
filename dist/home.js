import {TRAINING_AVAILABLE} from '/service-availability.js';
if(!TRAINING_AVAILABLE)document.querySelectorAll('a[href="/training/"]').forEach(a=>{const badge=document.createElement('small');badge.className='training-status';badge.textContent='暂未开放';a.append(' ',badge);});
import {requestAssistant,withAIButton,isAssistantBusy} from '/ai-assistant.js';
import {initAccountControls} from '/account-controls.js';
import {requireSignIn} from './auth-session.js';
initAccountControls();
const hero = document.querySelector('.cinema-hero');
const video = document.querySelector('#hero-video');
const toggle = document.querySelector('#toggle-video');
const watch = document.querySelector('#watch-film');
const dialog = document.querySelector('#film-dialog');
const fullFilm = document.querySelector('#full-film');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const connection = navigator.connection;
let userPaused = motion.matches || Boolean(connection?.saveData) || /^(slow-)?2g$/.test(connection?.effectiveType || '');
let heroVisible = true;
let resumeAfterFilm = false;
let mediaFailed = false;
let mediaReady = false;

const pauseIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke-width="3"/></svg>';
const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7Z" fill="currentColor" stroke="none"/></svg>';

function updateControls() {
  const playing = !video.paused;
  toggle.innerHTML = playing ? pauseIcon : playIcon;
  toggle.setAttribute('aria-label', playing ? '暂停背景视频' : '播放背景视频');
  toggle.setAttribute('aria-pressed', String(playing));
}

async function playBackground() {
  if (!mediaReady || mediaFailed || userPaused || !heroVisible || document.hidden || dialog.open) return;
  if (!video.getAttribute('src')) { video.src = '/assets/hero-film.mp4'; video.load(); }
  try { await video.play(); } catch { updateControls(); }
}

video.addEventListener('loadeddata', () => {
  document.body.classList.add('video-ready');
  toggle.disabled = false;
  watch.disabled = false;
  playBackground();
});
video.addEventListener('play', updateControls);
video.addEventListener('pause', updateControls);
video.addEventListener('error', () => {
  mediaFailed = true;
  document.body.classList.remove('video-ready');
  toggle.disabled = true;
  watch.disabled = true;
});

toggle.addEventListener('click', () => {
  userPaused = !video.paused;
  if (userPaused) video.pause();
  else {
    mediaReady = true;
    document.body.classList.add('motion-approved');
    playBackground();
  }
});

watch.addEventListener('click', () => {
  resumeAfterFilm = !video.paused;
  video.pause();
  dialog.showModal();
  if (!fullFilm.src) fullFilm.src = '/assets/hero-film.mp4';
  fullFilm.currentTime = 0;
  fullFilm.play().catch(() => {});
});
document.querySelector('#close-film').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  }
});
dialog.addEventListener('close', () => {
  fullFilm.pause();
  if (resumeAfterFilm) playBackground();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) video.pause();
  else { mediaReady = true; playBackground(); }
});
motion.addEventListener('change', event => {
  userPaused = event.matches;
  document.body.classList.remove('motion-approved');
  if (userPaused) video.pause();
  else { mediaReady = true; playBackground(); }
});

if ('IntersectionObserver' in window) {
  const heroObserver = new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    if (heroVisible) playBackground();
    else video.pause();
  }, { threshold: 0.05 });
  heroObserver.observe(hero);
  const revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(element => revealObserver.observe(element));
  document.body.classList.add('motion-enabled');
}

updateControls();
toggle.disabled = false;
watch.disabled = false;
video.preload = 'metadata';
// Let the poster and composer paint before competing with a cinematic video.
requestAnimationFrame(() => requestAnimationFrame(() => {
  const begin = () => { mediaReady = true; playBackground(); };
  if ('requestIdleCallback' in window) requestIdleCallback(begin, {timeout:1200});
  else setTimeout(begin, 120);
}));

const promptField = document.querySelector('#song-prompt');
try{const pending=sessionStorage.getItem('sanzo-pending-prompt');if(pending&&!promptField.value)promptField.value=pending.slice(0,500);}catch{}
window.addEventListener('sanzo-before-sign-in',()=>stageCreativeContent());
const promptComposer = document.querySelector('#home-create-form');
const composerPointer = matchMedia('(min-width: 701px) and (hover: hover) and (pointer: fine)');
let composerLightFrame = 0;
let composerPointerPosition = null;
promptComposer.addEventListener('pointermove', event => {
  if (motion.matches || !composerPointer.matches || event.pointerType !== 'mouse') return;
  composerPointerPosition = { x: event.clientX, y: event.clientY };
  if (composerLightFrame) return;
  composerLightFrame = requestAnimationFrame(() => {
    composerLightFrame = 0;
    if (motion.matches || !composerPointer.matches || !composerPointerPosition) return;
    const bounds = promptComposer.getBoundingClientRect();
    promptComposer.style.setProperty('--prompt-light-x', `${composerPointerPosition.x - bounds.left}px`);
    promptComposer.style.setProperty('--prompt-light-y', `${composerPointerPosition.y - bounds.top}px`);
  });
});
promptComposer.addEventListener('pointerleave', () => {
  cancelAnimationFrame(composerLightFrame);
  composerLightFrame = 0;
  composerPointerPosition = null;
  promptComposer.style.removeProperty('--prompt-light-x');
  promptComposer.style.removeProperty('--prompt-light-y');
});
const templateButtons = [...document.querySelectorAll('[data-template]')];
const templates = {
  night: '写一首适合深夜开车的中文歌。梦幻电子风格，温暖低音，歌词关于霓虹灯下的自由和思念。',
  rain: '写一首适合雨天咖啡馆的歌。轻松的 Lo-fi 节奏，柔和钢琴，歌词温暖而松弛，像给自己的一封信。',
  love: '写一首甜蜜的中文流行告白歌曲。清新吉他、轻快鼓点，歌词关于第一次心动，副歌简单好记。',
  space: '写一首太空漫游氛围歌曲。空灵人声、宽阔合成器与缓慢节奏，歌词关于穿越星河、寻找另一个自己。'
};
templateButtons.forEach(button => button.addEventListener('click', () => {
  promptField.value = templates[button.dataset.template];
  promptField.dispatchEvent(new Event('input', { bubbles: true }));
  promptField.focus({ preventScroll: true });
}));
promptField.addEventListener('input', () => {
  promptField.setCustomValidity('');
  templateButtons.forEach(button => button.setAttribute('aria-pressed', String(promptField.value === templates[button.dataset.template])));
  if (preparedBrief && promptField.value !== preparedPrompt) {
    preparedBrief = null;
    briefReady.hidden = true;
  }
});
const briefDialog = document.querySelector('#home-brief-dialog');
const briefForm = document.querySelector('#home-brief-form');
const briefReady = document.querySelector('#home-brief-ready');
const briefFields = {
  title: document.querySelector('#home-brief-title'),
  lyrics: document.querySelector('#home-brief-lyrics'),
  styles: document.querySelector('#home-brief-styles')
};
document.querySelector('#home-clear-style').addEventListener('click',()=>{briefFields.styles.value='';briefFields.styles.dispatchEvent(new Event('input',{bubbles:true}));briefFields.styles.focus({preventScroll:true});});
let preparedBrief = null;
let preparedPrompt = '';
function setPreparedBrief(result, original) {
  preparedBrief = { ...result };
  preparedPrompt = original;
  for (const [name, field] of Object.entries(briefFields)) field.value = result[name];
  document.querySelector('#home-brief-original').textContent = original;
  updateBriefSummary();
  briefReady.hidden = false;
}
function updateBriefSummary() {
  document.querySelector('#home-brief-summary').textContent = preparedBrief.title || '给这首歌取个名字';
}
function showPreparedBrief() {
  if (preparedBrief && !briefDialog.open) briefDialog.showModal();
}
for (const [name, field] of Object.entries(briefFields)) {
  field.addEventListener('input', () => {
    field.setCustomValidity('');
    if (!preparedBrief) return;
    preparedBrief[name] = field.value;
    updateBriefSummary();
  });
}
briefReady.addEventListener('click', showPreparedBrief);
document.querySelector('#close-home-brief').addEventListener('click', () => briefDialog.close());
document.querySelector('#keep-home-brief').addEventListener('click', () => briefDialog.close());
briefDialog.addEventListener('click', event => {
  if (event.target !== briefDialog) return;
  const bounds = briefDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) briefDialog.close();
});
function stageCreativeContent() {
  if (preparedBrief) {
    for (const field of Object.values(briefFields)) {
      field.setCustomValidity(field.value.trim() ? '' : '请保留这首歌的名称、歌词与音乐风格。');
      if (!field.checkValidity()) {
        showPreparedBrief();
        field.reportValidity();
        return false;
      }
    }
  }
  try {
    if (preparedBrief) {
      sessionStorage.setItem('sanzo-pending-brief', JSON.stringify(preparedBrief));
      sessionStorage.removeItem('sanzo-pending-prompt');
    } else if (promptField.value.trim()) {
      sessionStorage.setItem('sanzo-pending-prompt', promptField.value);
      sessionStorage.removeItem('sanzo-pending-brief');
    }
    return true;
  } catch {
    homeAIMessage('浏览器暂时无法传递创作内容，请稍后重试。', 'error');
    return false;
  }
}
briefForm.addEventListener('submit', event => {
  event.preventDefault();
  if (stageCreativeContent()) location.assign('/create/');
});
document.querySelectorAll('a[href="/create/"]').forEach(link => link.addEventListener('click', event => {
  if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  if (!stageCreativeContent()) event.preventDefault();
}));
const homeAIStatus = document.createElement('div');
homeAIStatus.className = 'home-ai-toast';
homeAIStatus.id = 'home-ai-status';
homeAIStatus.setAttribute('role','status');
homeAIStatus.setAttribute('aria-live','polite');
homeAIStatus.hidden = true;
document.body.append(homeAIStatus);
let homeAIStatusTimer;
function homeAIMessage(message,state='working') {
  clearTimeout(homeAIStatusTimer);
  homeAIStatus.textContent=message;
  homeAIStatus.dataset.state=state;
  homeAIStatus.hidden=false;
  if(state!=='working')homeAIStatusTimer=setTimeout(()=>{homeAIStatus.hidden=true;},8000);
}
document.querySelector('#home-polish').addEventListener('click',async event=>{
  if(isAssistantBusy())return;
  const original=promptField.value;
  if(!original.trim()){promptField.focus({preventScroll:true});homeAIMessage('先描述一下你想听见的歌曲。','error');return;}
  try {
    if(!await requireSignIn({returnTo:'/',beforeRedirect:stageCreativeContent}))return;
    await withAIButton(event.currentTarget,'润色中…',async()=>{
      homeAIMessage('AI 正在为你的灵感写出分段歌词与曲风…');
      const result=await requestAssistant({action:'brief',kind:'songs',text:original});
      if(promptField.value!==original){homeAIMessage('你已修改内容，保留了新的输入。','done');return;}
      setPreparedBrief(result, original);
      showPreparedBrief();
      homeAIMessage('歌词与曲风已生成，可以预览、修改并带入创作空间。','done');
    });
  } catch(error){homeAIMessage(error.message,'error');}
});
document.querySelector('#home-create-form').addEventListener('submit', async event => {
  event.preventDefault();
  if(isAssistantBusy())return;
  if (!promptField.value.trim()) {
    promptField.setCustomValidity('先写下一点歌曲灵感。');
    promptField.reportValidity();
    return;
  }
  const original=promptField.value;
  try{if(!await requireSignIn({returnTo:'/create/',beforeRedirect:stageCreativeContent}))return;}catch(error){homeAIMessage(error.message,'error');return;}
  if (preparedBrief && original === preparedPrompt) {
    if (stageCreativeContent()) location.assign('/create/');
    return;
  }
  try {
    await withAIButton(document.querySelector('.generate-song'),'构思中…',async()=>{
      homeAIMessage('AI 正在构思歌词和音乐风格…');
      const result=await requestAssistant({action:'brief',kind:'songs',text:original});
      if(promptField.value!==original){homeAIMessage('你已修改内容，保留了新的输入，请重新生成。','done');return;}
      setPreparedBrief(result, original);
      if (stageCreativeContent()) location.assign('/create/');
    });
  }catch(error){homeAIMessage(error.message,'error');}
});
