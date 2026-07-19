import { PresetTag, Track } from './types';

export const PRESETS: PresetTag[] = [
  {
    label: '深邃虚空',
    englishLabel: 'Deep Void',
    style: 'Deep Ambient, Drone, Dark Cosmic, Void Techno',
    bpm: 90,
    chords: 'Minor 9th / Sus4',
    timeSig: '4/4',
    lyricsPrompt: 'Silent echoes of a collapsing star... lost in the cold dark void. Gravity pulling everything in.'
  },
  {
    label: '霓虹雨夜',
    englishLabel: 'Neon Rain',
    style: 'Synthwave, Cyberpunk, Retrowave, Electroclash',
    bpm: 118,
    chords: 'Minor 7th / Flat 5',
    timeSig: '4/4',
    lyricsPrompt: 'Neon lights reflecting on the wet asphalt. Acid rain falling down on the chrome tower. Speeding into the night.'
  },
  {
    label: '禅意花园',
    englishLabel: 'Zen Garden',
    style: 'Ambient Chime, Flute, Minimalist Organic, Koto, Drone',
    bpm: 72,
    chords: 'Pentatonic Scale / Major 7th',
    timeSig: '4/4',
    lyricsPrompt: 'Sipping tea in the morning mist. Sand waves carefully drawn around stone lanterns. Wind chimes singing in the breeze.'
  },
  {
    label: '数字混沌',
    englishLabel: 'Digital Chaos',
    style: 'Glitch Hop, IDM, Breakcore, Deconstructed Club, Noise',
    bpm: 150,
    chords: 'Dissonant Augmented',
    timeSig: '7/8',
    lyricsPrompt: 'System override. Glitched memory addresses leaking into core registers. Audio buffer overrun. Reboot required.'
  },
  {
    label: '今天是我的生日',
    englishLabel: 'Birthday',
    style: 'Neo-Classical Piano, Festive Electro, Future Bass',
    bpm: 110,
    chords: 'Major 7th / Sus2',
    timeSig: '4/4',
    lyricsPrompt: 'Another orbit around the glowing sun. Warm candles flickering. A sweet cake and soft laughter from friends.'
  },
  {
    label: '今天是约会纪念日',
    englishLabel: 'Anniversary',
    style: 'R&B, Cinematic Romance, Warm Synth, Lofi Chill',
    bpm: 85,
    chords: 'Major 9th / Minor 11th',
    timeSig: '4/4',
    lyricsPrompt: 'Walking hand in hand through the bustling cityscape. Your smile in the twilight. Forever begins today.'
  },
  {
    label: '今天考试顺利',
    englishLabel: 'Success',
    style: 'Uplifting Orchestral, Progressive House, Victory Fanfare',
    bpm: 128,
    chords: 'I-V-vi-IV Progression',
    timeSig: '4/4',
    lyricsPrompt: 'The nervous wait is over. Rising higher than ever. Hard work turning into sparkling triumph. I made it!'
  },
  {
    label: '窗外下着雨',
    englishLabel: 'Rainy Night',
    style: 'Lofi Hip Hop, Rainy Jazz Piano, Soft Vinyl Crackle',
    bpm: 80,
    chords: 'Minor 9th / Diminished',
    timeSig: '4/4',
    lyricsPrompt: 'Soft raindrops tapping gently on the window glass. Cup of hot cocoa in hand, cozy blanket, slow jazz spinning.'
  },
  {
    label: '初恋的感觉',
    englishLabel: 'First Love',
    style: 'Dream Pop, Shoegaze, Bright Acoustic, Sweet Chiptune',
    bpm: 104,
    chords: 'Major 9th / Add9',
    timeSig: '4/4',
    lyricsPrompt: 'The fluttering of butterflies in my chest. A simple glance that stops time. Your voice repeating in my dreams.'
  }
];

export const RECOMMENDED_TRACKS: Track[] = [
  {
    id: 'rec_1',
    title: 'NEON PULSE',
    bpm: 124,
    duration: '04:22',
    style: 'Synthwave',
    coverSeed: 'neon_pulse'
  },
  {
    id: 'rec_2',
    title: 'VOID ECHO',
    bpm: 90,
    duration: '03:45',
    style: 'Dark Ambient',
    coverSeed: 'void_echo'
  },
  {
    id: 'rec_3',
    title: 'ZENITH',
    bpm: 110,
    duration: '05:10',
    style: 'Progressive House',
    coverSeed: 'zenith'
  },
  {
    id: 'rec_4',
    title: 'DIGITAL RAIN',
    bpm: 128,
    duration: '04:01',
    style: 'Cyberpunk Cybertrance',
    coverSeed: 'digital_rain'
  }
];

export const LIBRARY_TRACKS: Track[] = [
  {
    id: 'lib_1',
    title: 'VOID PROTOCOL',
    bpm: 132,
    duration: '04:12',
    style: 'Industrial Techno',
    coverSeed: 'void_protocol'
  },
  {
    id: 'lib_2',
    title: 'NEURAL DRIFT',
    bpm: 128,
    duration: '03:45',
    style: 'Glitch Electronica',
    coverSeed: 'neural_drift'
  },
  {
    id: 'lib_3',
    title: 'SYNTHETIC BREATH',
    bpm: 110,
    duration: '05:22',
    style: 'IDM Ambient',
    coverSeed: 'synthetic_breath'
  },
  {
    id: 'lib_4',
    title: 'KINETIC STATE',
    bpm: 140,
    duration: '02:58',
    style: 'Breakbeat Noise',
    coverSeed: 'kinetic_state'
  },
  {
    id: 'lib_5',
    title: 'GLITCHED MEMORY',
    bpm: 98,
    duration: '06:01',
    style: 'Lofi Cyberpunk',
    coverSeed: 'glitched_memory'
  }
];
