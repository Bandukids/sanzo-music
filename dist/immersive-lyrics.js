import { lyricCues } from './player-visuals.js';

export function initImmersiveLyrics({ seek }) {
  const pane = document.querySelector('#player-lyrics-view');
  const viewport = document.querySelector('#immersive-lyrics-scroll');
  const linesBox = document.querySelector('#immersive-lyric-lines');
  const empty = document.querySelector('#immersive-lyrics-empty');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const follow = document.querySelector('#lyrics-follow');
  let signature = null, cues = [], active = -1, manualUntil = 0;

  function reveal(force = false) {
    if (pane.hidden || !viewport.clientHeight || active < 0 || (!force && Date.now() < manualUntil)) return;
    const row = linesBox.children[active];
    if (!row) return;
    viewport.scrollTo({
      top: Math.max(0, viewport.scrollTop + row.getBoundingClientRect().top - viewport.getBoundingClientRect().top - (viewport.clientHeight - row.offsetHeight) / 2),
      behavior: reduced.matches || document.body.classList.contains('motion-paused') ? 'instant' : 'smooth'
    });
  }
  function update(track, seconds) {
    const fields=['id','lyrics','instrumental','duration'];
    if (!signature||fields.some(field=>track[field]!==signature[field])) {
      signature=Object.fromEntries(fields.map(field=>[field,track[field]]));
      const parsed = lyricCues(track);
      cues = parsed.lines; active = -2; manualUntil = 0;
      clearTimeout(allowBrowsing.timer);follow.setAttribute('aria-pressed','true');follow.textContent='自动跟随';
      document.querySelector('#immersive-lyrics-label').textContent = parsed.label;
      document.querySelector('#immersive-lyrics-note').textContent = cues.length
        ? (parsed.demo ? '示例歌词 · 时间轴用于预览。' : parsed.estimated ? '歌词位置按播放进度估算，并非逐句对齐。' : '歌词按 LRC 时间标记同步，点击可跳转。')
        : '这首作品暂无歌词。';
      linesBox.replaceChildren();
      linesBox.hidden = !cues.length;
      empty.hidden = !!cues.length;
      document.querySelector('#lyrics-empty-track').textContent = track.title;
      cues.forEach(cue => {
        const row = document.createElement('button');
        row.type = 'button'; row.className = 'immersive-lyric-line';
        row.textContent = cue.text;
        const clock = Math.floor(cue.at / 60) + ':' + String(Math.floor(cue.at % 60)).padStart(2, '0');
        row.setAttribute('aria-label', '跳到 ' + clock + '，' + cue.text);
        row.addEventListener('click', () => { manualUntil = 0; seek(cue.at); reveal(true); });
        linesBox.append(row);
      });
    }
    let index = -1;
    for (let i = 0; i < cues.length && cues[i].at <= seconds; i++) index = i;
    if (index === active) return;
    active = index;
    [...linesBox.children].forEach((row, i) => {
      row.classList.toggle('is-active', i === active);
      row.classList.toggle('is-past', i < active);
      if (i === active) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    });
    document.querySelector('#immersive-line-count').textContent = cues.length
      ? String(Math.max(0, active + 1)).padStart(2, '0') + ' / ' + String(cues.length).padStart(2, '0')
      : 'INSTRUMENTAL';
    reveal();
  }
  function resumeFollowing() { manualUntil=0;follow.setAttribute('aria-pressed','true');follow.textContent='自动跟随';reveal(true); }
  const allowBrowsing = () => { manualUntil=Date.now()+5000;follow.setAttribute('aria-pressed','false');follow.textContent='恢复跟随';clearTimeout(allowBrowsing.timer);allowBrowsing.timer=setTimeout(resumeFollowing,5000); };
  follow.addEventListener('click',resumeFollowing);
  viewport.addEventListener('wheel', allowBrowsing, { passive: true });
  viewport.addEventListener('touchmove', allowBrowsing, { passive: true });
  return { update, reveal };
}
