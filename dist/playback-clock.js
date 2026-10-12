// Refresh playback UI only while playing in a visible document.
export function createPlaybackClock(tick, {
  page = document,
  schedule = setInterval,
  cancel = clearInterval
} = {}) {
  let playing = false, timer = null;
  function sync() {
    const active = playing && !page.hidden;
    if (!active && timer !== null) { cancel(timer); timer = null; }
    if (active && timer === null) timer = schedule(tick, 250);
  }
  function visibility() {
    if (playing && !page.hidden) tick();
    sync();
  }
  page.addEventListener('visibilitychange', visibility);
  return {
    setPlaying(value) { playing = Boolean(value); sync(); },
    destroy() {
      playing = false; sync();
      page.removeEventListener('visibilitychange', visibility);
    }
  };
}
