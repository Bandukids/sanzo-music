export type Screen = 'home' | 'studio' | 'treasury' | 'admin';

export interface User {
  id: string;
  username: string;
  role: 'user' | 'admin';
}

export interface Track {
  id: string;
  title: string;
  bpm: number;
  duration: string;
  style: string;
  coverSeed: string;
  lyrics?: string;
  voice?: string;
  chords?: string;
  timeSig?: string;
  isCustom?: boolean;
  audioUrl?: string;
  coverUrl?: string;
}

export interface PresetTag {
  label: string;
  englishLabel: string;
  style: string;
  bpm: number;
  chords: string;
  timeSig: string;
  lyricsPrompt: string;
  duration?: string;
  language?: string;
  voice?: string;
}
