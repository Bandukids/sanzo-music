// The parser and sequencer are pinned to abcjs 6.7.1 (MIT), bundled locally.
export const escapeXML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const sampleABC = title => `X:1\nT:${String(title || '夜色速写').replace(/[\r\n]/g, ' ').slice(0, 60)}\nM:4/4\nL:1/8\nQ:1/4=92\nK:C\nC2 E2 G2 E2 | D2 F2 A2 F2 |\nE2 G2 c2 G2 | F2 E2 D2 C2 |]`;
export function parseScore(abc, { tempo = '', library = globalThis.ABCJS } = {}) {
  if (!library) throw Error('乐谱组件未载入，请刷新后再试。');
  const original = String(abc || '').trim();
  if (!original) throw Error('先输入 ABC 乐谱，或载入一份示例。');
  if (original.length > 50000) throw Error('乐谱最多支持 50000 个字符，请分段处理。');
  if (!/^K:\s*\S+/m.test(original)) throw Error('请在乐谱中填写 K: 调号，例如 K:C。');
  let text = original;
  if (tempo !== '') {
    const bpm = Number(tempo);
    if (!Number.isFinite(bpm) || bpm < 30 || bpm > 240) throw Error('速度请输入 30–240 之间的数值。');
    text = /^Q:/m.test(text) ? text.replace(/^Q:.*$/m, `Q:1/4=${bpm}`) : text.replace(/^K:/m, `Q:1/4=${bpm}\nK:`);
  }
  const tunes = library.parseOnly(text);
  if (tunes.length !== 1) throw Error('每份草稿请只放一首 ABC 乐谱。');
  const tune = tunes[0];
  if (tune.warnings?.length) {
    const warning = tune.warnings[0].replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, '');
    throw Error('ABC 格式需要调整：' + warning.slice(0, 180));
  }
  const voices = tune.lines.map(line=>(line.staff||[]).flatMap(staff=>staff.voices||[]));
  const count=Math.max(0,...voices.map(v=>v.length));
  let elements=[],voiceIndex=0;
  // Instrumental scores can keep a silent Vocal voice before the melody.
  for(let index=0;index<count;index++){
    const candidate=voices.flatMap(v=>v[index]||[]);
    if(candidate.some(e=>e.el_type==='note'&&e.pitches?.length)){elements=candidate;voiceIndex=index;break;}
  }
  if (!elements.some(e => e.el_type === 'note' && e.pitches?.length)) throw Error('没有识别到音符，请检查 K: 后的旋律。');
  const sequence = tune.setUpAudio({ chordsOff: true });
  const wholeSeconds = 60 / (sequence.tempo * tune.getBeatLength());
  const events = sequence.tracks.flatMap(track => track.filter(e => e.cmd === 'note' && Number.isFinite(e.pitch)).map(e => ({
    midi: e.pitch, start: e.start * wholeSeconds, duration: e.duration * wholeSeconds,
    velocity: Math.max(.1, Math.min(1, e.volume / 127)), source: e.startChar
  })));
  const duration = Math.max(sequence.totalDuration * wholeSeconds, ...events.map(e => e.start + e.duration));
  if (!Number.isFinite(duration) || duration <= 0 || duration > 300 || events.length > 8192) throw Error('基础合成支持 5 分钟以内的乐谱，请分段处理。');
  const key = tune.getKeySignature();
  const meter = tune.getMeterFraction();
  return { text, tune, elements, events, duration, key, meter, voiceIndex, title: String(tune.metaText.title || '未命名旋律'),
    bpm: Math.round(240 / wholeSeconds), warnings: [] };
}

const letters = ['C','D','E','F','G','A','B'];
const accidentals = { sharp:1, flat:-1, natural:0, dblsharp:2, dblflat:-2, quartersharp:.5, quarterflat:-.5 };
const accidentalText = n => ({'-2':'♭♭','-1':'♭','0':'','1':'♯','2':'𝄪','0.5':'𝄲','-0.5':'𝄳'}[n] || '');
export function numberedNotes(score) {
  let key = score.key, carry = new Map();
  return score.elements.map(element => {
    if (element.el_type === 'key') { key = element; carry.clear(); return { kind:'key', label: key.root + (key.acc || '') + (key.mode || '') }; }
    if (element.el_type === 'bar') { carry.clear(); return { kind:'bar', type:element.type, ending:element.startEnding || '' }; }
    if (element.el_type !== 'note' || element.rest?.type === 'spacer') return null;
    const root = Math.max(0, letters.indexOf(key.root));
    const base = Object.fromEntries((key.accidentals || []).map(a => [a.note.toUpperCase(), accidentals[a.acc] || 0]));
    const pitches = (element.pitches || []).map(pitch => {
      const letter = letters[((pitch.pitch % 7) + 7) % 7];
      const keyAcc = base[letter] || 0;
      if (pitch.accidental) carry.set(pitch.pitch, accidentals[pitch.accidental] ?? 0);
      const actualAcc = carry.has(pitch.pitch) ? carry.get(pitch.pitch) : keyAcc;
      const relative = pitch.pitch - root;
      return { degree: ((relative % 7) + 7) % 7 + 1, octave:Math.floor(relative / 7), accidental:actualAcc - keyAcc,
        tied:!!pitch.startTie, tieEnd:!!pitch.endTie };
    });
    return { kind:'note', pitches, rest:!!element.rest, duration:element.duration,
      triplet:element.startTriplet || 0, tripletEnd:!!element.endTriplet,
      lyric:(element.lyric || []).map(l => l.syllable).join(' '), slur:!!element.startSlur, source:element.startChar };
  }).filter(Boolean);
}

// Jianpu uses quarter-note beats; bars, octave dots, ties, dotted values,
// rests and tuplets follow the first ABC voice. Full ensembles use staff view.
export function numberedSVG(score) {
  const tokens = numberedNotes(score), measures = []; let current = [];
  for (const token of tokens) {
    current.push(token);
    if (token.kind === 'bar' && current.some(n => n.kind === 'note')) { measures.push(current); current = []; }
  }
  if (current.some(n => n.kind === 'note')) measures.push(current);
  const hasLyrics = tokens.some(t => t.lyric), width = 840, margin = 48, rowHeight = hasLyrics ? 142 : 120;
  const tokenWidth = token => token.kind === 'bar' ? 20 : token.kind === 'key' ? 55 : Math.max(36, (Math.floor(token.duration * 4) || 1) * 28 + (token.pitches?.length > 1 ? 8 : 0));
  const rows = []; let row = [], used = 0;
  for (const measure of measures) {
    const units = measure.reduce((n,t) => n + tokenWidth(t), 16);
    if (row.length && used + units > width - margin * 2) { rows.push(row); row = []; used = 0; }
    row.push(measure); used += units;
  }
  if (row.length) rows.push(row);
  const chordSpace = Math.max(0,...tokens.map(t => (t.pitches?.length || 1)-1))*35;
  const height = 205 + chordSpace + Math.max(0,rows.length-1)*(rowHeight+chordSpace) + (hasLyrics?35:0);
  let body = `<text x="${width/2}" y="52" text-anchor="middle" font-size="27" font-weight="600">${escapeXML(score.title)}</text><text x="48" y="95" font-size="16">1 = ${escapeXML(score.key.root + (score.key.acc || '') + (score.key.mode ? ' · '+score.key.mode : ''))}　 ${score.meter.num}/${score.meter.den}　 ♩ = ${score.bpm}</text><text x="792" y="95" text-anchor="end" font-size="12" fill="#668096">SANZO / 简谱 · 第${(score.voiceIndex||0)+1}声部</text>`;
  rows.forEach((measures, r) => {
    const y = 155 + chordSpace + r * (rowHeight+chordSpace);
    const total = measures.flat().reduce((n,t) => n + tokenWidth(t), measures.length * 16);
    const scale = Math.min(1.6, (width - margin * 2) / total); let x = margin;
    for (const measure of measures) {
      for (const token of measure) {
        const advance = tokenWidth(token) * scale;
        if (token.kind === 'bar') {
          const repeat = token.type.includes('repeat');
          body += `<line x1="${x+8}" y1="${y-19}" x2="${x+8}" y2="${y+17}" stroke="#30475b" stroke-width="1.3"/>`;
          if (repeat || token.type.includes('thick')) body += `<line x1="${x+13}" y1="${y-19}" x2="${x+13}" y2="${y+17}" stroke="#30475b" stroke-width="3"/>`;
          if (repeat) { const dotX = token.type === 'bar_left_repeat' ? x+21 : x; body += `<circle cx="${dotX}" cy="${y-6}" r="2"/><circle cx="${dotX}" cy="${y+6}" r="2"/>`; }
          if (token.ending) body += `<text x="${x+17}" y="${y-32}" font-size="13">${escapeXML(token.ending)}.</text>`;
        } else if (token.kind === 'key') body += `<text x="${x}" y="${y}" font-size="13">1=${escapeXML(token.label)}</text>`;
        else {
          const cx = x + 14, beats = token.duration * 4;
          const dot = [1.5,.75,.375,.1875,3].some(v => Math.abs(beats-v)<.0001);
          const baseBeats = dot ? beats/1.5 : beats;
          const underlines = baseBeats < 1 ? Math.min(4, Math.round(-Math.log2(baseBeats))) : 0;
          const notes = token.rest ? [{ degree:0, octave:0, accidental:0 }] : token.pitches;
          notes.forEach((note,i) => {
            const ny = y - i * 35;
            body += `<text x="${cx}" y="${ny}" text-anchor="middle" font-size="25" font-family="Arial,sans-serif">${note.degree}</text>`;
            if (note.accidental) body += `<text x="${cx-18}" y="${ny-3}" text-anchor="middle" font-size="15">${accidentalText(note.accidental)}</text>`;
            for (let d = 0; d < Math.min(3,Math.abs(note.octave)); d++) body += `<circle cx="${cx}" cy="${note.octave > 0 ? ny-28-d*6 : ny+15+underlines*5+d*6}" r="1.8"/>`;
            if (note.tied) body += `<path d="M${cx} ${ny-36} q${advance/2} -13 ${advance} 0" fill="none" stroke="#30475b"/>`;
          });
          for (let d = 0; d < underlines; d++) body += `<line x1="${cx-10}" y1="${y+7+d*5}" x2="${cx+10}" y2="${y+7+d*5}" stroke="#30475b" stroke-width="1.3"/>`;
          if (dot && beats < 2) body += `<circle cx="${cx+17}" cy="${y-5}" r="2"/>`;
          const dashes = beats >= 2 ? Math.max(0, Math.floor(beats)-1) : 0;
          for (let d = 0; d < dashes; d++) body += `<text x="${cx+(d+1)*advance/(dashes+1)}" y="${y}" font-size="25">–</text>`;
          if (token.triplet) body += `<text x="${cx}" y="${y-47}" font-size="13">${token.triplet}</text>`;
          if (token.lyric) body += `<text x="${cx}" y="${y+49}" text-anchor="middle" font-size="14">${escapeXML(token.lyric)}</text>`;
        }
        x += advance;
      }
      x += 16 * scale;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXML(score.title)} 简谱"><rect width="100%" height="100%" fill="#fff"/><g fill="#233d54" font-family="Arial,Microsoft YaHei,sans-serif">${body}</g></svg>`;
}

export function synthesizePCM(score, { instrument='keys', sampleRate=22050 } = {}) {
  const duration = score.duration + .65, data = new Float32Array(Math.ceil(duration * sampleRate));
  for (const note of score.events) {
    const start = Math.round(note.start * sampleRate), length = Math.min(data.length-start, Math.ceil((note.duration + .28)*sampleRate));
    const frequency = 440 * 2 ** ((note.midi-69)/12), release = instrument === 'pluck' ? .12 : .24;
    for (let i=0;i<length;i++) {
      const t=i/sampleRate, phase=2*Math.PI*frequency*t;
      const envelope = Math.min(1,t/.012) * Math.exp(-t*(instrument==='pluck'?3.4:instrument==='keys'?1.9:.15)) * Math.max(0,Math.min(1,(note.duration+release-t)/release));
      const wave=instrument==='sine'?Math.sin(phase):instrument==='pluck'?(Math.sin(phase)+.32*Math.sin(phase*2)*Math.exp(-t*4)+.17*Math.sin(phase*3)*Math.exp(-t*6)):(Math.sin(phase)+.28*Math.sin(phase*2)*Math.exp(-t*3)+.1*Math.sin(phase*4)*Math.exp(-t*5));
      data[start+i] += wave * envelope * note.velocity * .24;
    }
  }
  let peak=0;for(const value of data)peak=Math.max(peak,Math.abs(value));
  if(peak>.88)for(let i=0;i<data.length;i++)data[i]*=.88/peak;
  return { data, sampleRate, duration };
}
export function encodeWAV({ data, sampleRate }) {
  const buffer = new ArrayBuffer(44 + data.length*2), view = new DataView(buffer);
  const text = (offset,value) => [...value].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)));
  text(0,'RIFF');view.setUint32(4,36+data.length*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);
  view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,data.length*2,true);
  data.forEach((v,i)=>view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,v))*(v<0?32768:32767)),true));
  return buffer;
}
