import {TRAINING_AVAILABLE} from '/service-availability.js';
import { initAccountControls } from '/account-controls.js';
const sidebar = document.querySelector('#app-sidebar');
if (sidebar) {
 const page = document.body.dataset.page;
 const icons = {
  explore:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2.6 5.4L8 16l2.6-5.4Z"/>',
  create:'<path d="m16 3 5 5-12 12-6 1 1-6Zm-2 2 5 5"/>',
  uploads:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  studio:'<path d="M4 5v14M12 5v14M20 5v14"/><circle cx="4" cy="10" r="2"/><circle cx="12" cy="15" r="2"/><circle cx="20" cy="9" r="2"/>',
  training:'<path d="M6 3v7l-3 7a3 3 0 0 0 3 4h12a3 3 0 0 0 3-4l-3-7V3M4 3h4m8 0h4M5 15h14"/><path d="m10 8 2 3 2-3"/>',
  home:'<path d="m3 11 9-8 9 8v10h-6v-7H9v7H3Z"/>'
 };
 const icon = id => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[id]}</svg>`;
 const pages = [['explore','探索音乐','/explore/'],['create','创作空间','/create/'],['uploads','上传素材','/create/#uploads'],['studio','Studio','/studio/'],['training','模型训练','/training/']];
 const panelIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="4"/><path d="M9 4v16m6-11-3 3 3 3"/></svg>';
 sidebar.innerHTML = `<div class="sidebar-heading"><a class="sidebar-brand" href="/" aria-label="SANZO 首页"><span class="sidebar-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>SANZO</span></a><button class="sidebar-close" type="button" aria-controls="app-sidebar">${panelIcon}</button></div><nav class="sidebar-nav" aria-label="主要导航">${pages.map(([id,title,url])=>`<a class="sidebar-link" href="${url}" ${id===page?'aria-current="page"':''} title="${title}">${icon(id)}<span>${title}</span>${id==='training'&&!TRAINING_AVAILABLE?'<small class="training-status">暂未开放</small>':''}</a>`).join('')}</nav><div class="sidebar-footer"><div class="sidebar-controls"></div><a class="sidebar-home" href="/" aria-label="返回首页">${icon('home')}<span>返回首页</span></a><small>SANZO / MUSIC LAB</small></div>`;
 const header = document.querySelector('.workspace-header, .explore-header');
 if (header) {
  const mobileToggle = document.createElement('button');
  mobileToggle.type = 'button';
  mobileToggle.className = 'sidebar-toggle mobile-menu-toggle';
  mobileToggle.setAttribute('aria-controls', 'app-sidebar');
  mobileToggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  const mobileTitle = document.createElement('span');
  mobileTitle.className = 'mobile-page-name';
  mobileTitle.textContent = page === 'users' ? '用户管理' : pages.find(([id]) => id === page)?.[1] || 'SANZO';
  header.prepend(mobileToggle, mobileTitle);
  const preferences = header.querySelector('.header-tools, .header-end');
  const preferenceSlot = sidebar.querySelector('.sidebar-controls');
  const close = sidebar.querySelector('.sidebar-close');
  const restore = document.createElement('button');
  restore.type = 'button';
  restore.className = 'sidebar-toggle sidebar-restore';
  restore.setAttribute('aria-controls', 'app-sidebar');
  restore.setAttribute('aria-label', '展开左侧导航');
  restore.title = '展开左侧导航';
  restore.innerHTML = panelIcon;
  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'navigation-backdrop';
  backdrop.setAttribute('aria-label', '关闭导航菜单');
  backdrop.tabIndex = -1;
  document.body.append(restore, backdrop);
  const mobile = matchMedia('(max-width:780px)');
  let collapsed = false;
  let menuOpen = false;
  try { collapsed = localStorage.getItem('sanzo-sidebar-collapsed') === 'true'; } catch {}
  const surfaces = [header, ...document.querySelectorAll('.workspace-layout, .explore-main, .studio-main, .training-main, .player, .player-dock')];
  function updateNavigation() {
   const modalOpen = mobile.matches && menuOpen;
   const hidden = mobile.matches ? !menuOpen : collapsed;
   sidebar.hidden = hidden;
   restore.hidden = mobile.matches || !collapsed;
   backdrop.hidden = !modalOpen;
   document.body.dataset.sidebarCollapsed = String(hidden);
   document.body.dataset.mobileMenuOpen = String(modalOpen);
   mobileToggle.setAttribute('aria-expanded', String(!hidden));
   mobileToggle.setAttribute('aria-label', menuOpen ? '关闭导航菜单' : '打开导航菜单');
   close.setAttribute('aria-expanded', String(!hidden));
   close.setAttribute('aria-label', mobile.matches ? '关闭导航菜单' : '隐藏左侧导航');
   close.title = mobile.matches ? '关闭导航菜单' : '隐藏左侧导航';
   close.innerHTML = mobile.matches ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>' : panelIcon;
   restore.setAttribute('aria-expanded', String(!hidden));
   if (modalOpen) {
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
   } else {
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-modal');
   }
   surfaces.forEach(surface => { surface.inert = modalOpen; });
   if (preferences) (mobile.matches ? header : preferenceSlot).append(preferences);
  }
  function toggleNavigation() {
   if (mobile.matches) menuOpen = !menuOpen;
   else {
    collapsed = !collapsed;
    try { localStorage.setItem('sanzo-sidebar-collapsed', String(collapsed)); } catch {}
   }
   updateNavigation();
   (sidebar.hidden ? (mobile.matches ? mobileToggle : restore) : close).focus({preventScroll:true});
  }
  [mobileToggle, close, restore].forEach(button => button.addEventListener('click', toggleNavigation));
  function closeMenu() {
   menuOpen = false;
   updateNavigation();
   mobileToggle.focus({preventScroll:true});
  }
  backdrop.addEventListener('click', closeMenu);
  sidebar.addEventListener('keydown', event => {
   if (!mobile.matches || !menuOpen) return;
   if (event.key === 'Escape') { event.preventDefault();closeMenu(); }
   if (event.key === 'Tab') {
    const focusable = [...sidebar.querySelectorAll('a[href], button:not([disabled])')].filter(el => el.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault();last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault();first.focus(); }
   }
  });
  mobile.addEventListener('change', () => {
   menuOpen = false;
   updateNavigation();
  });
  updateNavigation();
 }
}
 function syncPageNavigation(){
 const isUploads=document.body.dataset.page==='create'&&location.hash==='#uploads';
 const current=isUploads?'uploads':document.body.dataset.page;
 document.querySelectorAll('.sidebar-nav .sidebar-link').forEach(link=>{
  const selected=link.getAttribute('href')===(current==='uploads'?'/create/#uploads':current==='create'?'/create/':'/'+current+'/');
  if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
 });
 const title=document.querySelector('.mobile-page-name');
 if(title&&document.body.dataset.page==='create')title.textContent=isUploads?'上传素材':'创作空间';
}
window.addEventListener('hashchange',syncPageNavigation);
window.addEventListener('sanzo-view-change',syncPageNavigation);
syncPageNavigation();
initAccountControls();
