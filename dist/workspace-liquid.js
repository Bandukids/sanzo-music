// A shared moving lens follows the selected tab, including keyboard selection.
const tabGroups = [...document.querySelectorAll('.creation-types,.mode-tabs,.workspace-tabs')];
const lenses = tabGroups.map(group => {
  const lens = document.createElement('span');
  lens.className = 'glass-selector';
  lens.setAttribute('aria-hidden', 'true');
  group.prepend(lens);
  group.classList.add('liquid-equipped');
  return {group, lens};
});
let layoutFrame = 0;
function placeLenses() {
  layoutFrame = 0;
  for (const {group, lens} of lenses) {
    const active = group.querySelector('button[aria-selected="true"]');
    if (!active || !group.getClientRects().length) continue;
    lens.style.width = active.offsetWidth + 'px';
    lens.style.height = active.offsetHeight + 'px';
    lens.style.transform = `translate3d(${active.offsetLeft}px,${active.offsetTop}px,0)`;
    requestAnimationFrame(() => group.classList.add('liquid-ready'));
  }
}
function scheduleLayout() {
  if (!layoutFrame) layoutFrame = requestAnimationFrame(placeLenses);
}
const selectionObserver = new MutationObserver(scheduleLayout);
for (const {group} of lenses) selectionObserver.observe(group, {subtree:true, attributes:true, attributeFilter:['aria-selected','hidden']});
// The Songs mode selector can become visible after switching from Speech/Sounds.
selectionObserver.observe(document.querySelector('#music-model-row'), {attributes:true, attributeFilter:['hidden']});
const layoutObserver = new ResizeObserver(scheduleLayout);
tabGroups.forEach(group => layoutObserver.observe(group));
document.fonts.ready.then(scheduleLayout);
scheduleLayout();

// Only the surface under the pointer updates; motion pauses with the existing control.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let hoverFrame = 0, hoveredSurface = null, pointer = null;
const surfaces = '.composer-panel,.draft-card,.player';
document.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch' || reduced.matches || document.body.classList.contains('motion-paused')) return;
  hoveredSurface = event.target.closest(surfaces);
  if (!hoveredSurface) return;
  pointer = {x:event.clientX, y:event.clientY};
  if (hoverFrame) return;
  hoverFrame = requestAnimationFrame(() => {
    hoverFrame = 0;
    if (!hoveredSurface || !pointer) return;
    const rect = hoveredSurface.getBoundingClientRect();
    hoveredSurface.style.setProperty('--glass-x', `${pointer.x - rect.left}px`);
    hoveredSurface.style.setProperty('--glass-y', `${pointer.y - rect.top}px`);
  });
}, {passive:true});
window.addEventListener('pagehide', () => {
  cancelAnimationFrame(layoutFrame);
  cancelAnimationFrame(hoverFrame);
  layoutFrame = hoverFrame = 0;
  selectionObserver.disconnect();
  layoutObserver.disconnect();
});
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  for (const {group} of lenses) selectionObserver.observe(group, {subtree:true, attributes:true, attributeFilter:['aria-selected','hidden']});
  selectionObserver.observe(document.querySelector('#music-model-row'), {attributes:true, attributeFilter:['hidden']});
  tabGroups.forEach(group => layoutObserver.observe(group));
  scheduleLayout();
});
