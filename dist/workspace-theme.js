// Apply the remembered theme before styles paint, so revisits do not flash light.
(() => {
  const key = 'sanzo-workspace-theme';
  const root = document.documentElement;
  let theme = 'light';
  try {
    const saved = localStorage.getItem(key);
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch { /* Theme switching still works when browser storage is unavailable. */ }
  function applyTheme(next, remember = false) {
    theme = next;
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a1120' : '#dce9f6');
    const button = document.querySelector('#theme-toggle');
    if (button) {
      const action = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
      button.setAttribute('aria-label', action);
      button.title = action;
      document.querySelector('#theme-label').textContent = theme === 'dark' ? '深色' : '浅色';
      document.querySelector('#theme-icon').setAttribute('href', theme === 'dark' ? '#i-moon' : '#i-sun');
    }
    if (remember) {
      try { localStorage.setItem(key, theme); } catch { /* Keep the current page usable. */ }
    }
    document.dispatchEvent(new Event('sanzo-themechange'));
  }
  applyTheme(theme);
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(theme);
    document.querySelector('#theme-toggle')?.addEventListener('click', () => applyTheme(theme === 'dark' ? 'light' : 'dark', true));
  }, {once:true});
  window.addEventListener('storage', event => {
    if (event.key === key && (event.newValue === 'light' || event.newValue === 'dark')) applyTheme(event.newValue);
  });
})();
