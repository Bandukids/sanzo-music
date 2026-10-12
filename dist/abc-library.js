let loading = null;
export function loadABCLibrary() {
  if (globalThis.ABCJS) return Promise.resolve(globalThis.ABCJS);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/abcjs-6.7.1.min.js';
    script.async = true;
    const timer = setTimeout(() => fail(), 20000);
    function fail() {
      clearTimeout(timer); script.onload = script.onerror = null;
      script.remove(); loading = null;
      reject(Error('乐谱组件加载失败，请重试。'));
    }
    script.onerror = fail;
    script.onload = () => {
      if (!globalThis.ABCJS) { fail(); return; }
      clearTimeout(timer); script.onload = script.onerror = null;
      resolve(globalThis.ABCJS);
    };
    document.head.append(script);
  });
  return loading;
}
