import React, { useState, useEffect, useRef } from 'react';
import { PresetTag, Track } from '../types';
import { PRESETS } from '../data';
import { Play, Pause, Download, Share2, Sparkles, Volume2, Music, Check, RefreshCw, Dices } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AudioSynth } from '../utils/audioSynth';

interface StudioProps {
  initialMood: PresetTag | string | null;
  onSaveToLibrary: (track: Track, taskId?: string) => void;
  savedTracks: Track[];
  currentUser: any;
  onRequestLogin: () => void;
}

const sanitizeAudioUrl = (url: string | undefined): string => {
  if (!url) return '';
  if (url.includes('/output_music/')) {
    const parts = url.split('/output_music/');
    return '/output_music/' + parts[parts.length - 1];
  }
  return url;
};

const VALID_CHORDS = [
  "C major", "C# major", "Db major", "D major", "D# major", "Eb major", "E major", "F major", "F# major", "Gb major", "G major", "G# major", "Ab major", "A major", "A# major", "Bb major", "B major",
  "C minor", "C# minor", "Db minor", "D minor", "D# minor", "Eb minor", "E minor", "F minor", "F# minor", "Gb minor", "G minor", "G# minor", "Ab minor", "A minor", "A# minor", "Bb minor", "B minor"
];

const LANGUAGES = [
  { code: 'zh', name: 'Chinese / 中文' },
  { code: 'en', name: 'English / 英文' },
  { code: 'ja', name: 'Japanese / 日文' },
  { code: 'es', name: 'Spanish / 西班牙语' },
  { code: 'de', name: 'German / 德语' },
  { code: 'fr', name: 'French / 法语' },
  { code: 'pt', name: 'Portuguese / 葡萄牙语' },
  { code: 'ru', name: 'Russian / 俄语' },
  { code: 'it', name: 'Italian / 意大利语' },
  { code: 'nl', name: 'Dutch / 荷兰语' },
  { code: 'pl', name: 'Polish / 波兰语' },
  { code: 'tr', name: 'Turkish / 土耳其语' },
  { code: 'vi', name: 'Vietnamese / 越南语' },
  { code: 'cs', name: 'Czech / 捷克语' },
  { code: 'fa', name: 'Persian / 波斯语' },
  { code: 'id', name: 'Indonesian / 印尼语' },
  { code: 'ko', name: 'Korean / 韩语' },
  { code: 'uk', name: 'Ukrainian / 乌克兰语' },
  { code: 'hu', name: 'Hungarian / 匈牙利语' },
  { code: 'ar', name: 'Arabic / 阿拉伯语' },
  { code: 'sv', name: 'Swedish / 瑞典语' },
  { code: 'ro', name: 'Romanian / 罗马尼亚语' },
  { code: 'el', name: 'Greek / 希腊语' }
];

export const StudioGeneration: React.FC<StudioProps> = ({
  initialMood,
  onSaveToLibrary,
  savedTracks,
  currentUser,
  onRequestLogin
}) => {
  // Config States
  const [activeTab, setActiveTab] = useState<'quick' | 'advanced'>('quick');
  const [lyrics, setLyrics] = useState('');
  const [songStyle, setSongStyle] = useState('');
  const [voice, setVoice] = useState('Female');
  const [duration, setDuration] = useState('03:30');
  const [language, setLanguage] = useState('Auto');
  const [chords, setChords] = useState('Auto');
  const [timeSig, setTimeSig] = useState('4/4');
  const [bpm, setBpm] = useState('120');

  // RunningHub API Audio States
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [generatedCoverUrl, setGeneratedCoverUrl] = useState<string>('');

  const [isPolishingLyrics, setIsPolishingLyrics] = useState(false);
  const [isPolishingStyle, setIsPolishingStyle] = useState(false);
  const [polishLyricsProgress, setPolishLyricsProgress] = useState(0);
  const [polishStyleProgress, setPolishStyleProgress] = useState(0);
  const [polishLyricsError, setPolishLyricsError] = useState<string | null>(null);
  const [polishStyleError, setPolishStyleError] = useState<string | null>(null);

  const handlePolishLyrics = async (overridePrompt?: string) => {
    if (!currentUser) {
      onRequestLogin();
      return;
    }
    if (isPolishingLyrics) return;
    setIsPolishingLyrics(true);
    setPolishLyricsProgress(15);
    setPolishLyricsError(null);

    const promptText = (typeof overridePrompt === 'string' ? overridePrompt : '') || lyrics;

    const performFetch = async (url: string) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lyrics: promptText })
      });
      if (!res.ok) {
        let text = '';
        try { text = await res.text(); } catch (e) {}
        throw new Error(`HTTP ${res.status}: ${text || 'Unknown API Failure'}`);
      }
      return await res.json();
    };

    try {
      setPolishLyricsProgress(35);
      let data;
      try {
        // Try relative path first (uses Vite dev server proxy)
        data = await performFetch('/api/polish-lyrics');
      } catch (proxyErr: any) {
        console.warn("Vite Proxy connection failed, attempting direct backend port 3001...", proxyErr);
        // Fallback to direct absolute URL mapping to bypass IPv6/Proxy discrepancies
        data = await performFetch('http://127.0.0.1:3001/api/polish-lyrics');
      }

      setPolishLyricsProgress(75);

      if (data && data.lyrics) {
        setPolishLyricsProgress(90);
        // Auto populate all polished fields returned from deepseek flash
        setLyrics(data.lyrics);
        if (data.style) setSongStyle(data.style);
        if (data.bpm) setBpm(String(data.bpm));
        if (data.chords) {
          const chordStr = Array.isArray(data.chords) ? data.chords.join(' - ') : String(data.chords);
          setChords(chordStr);
        }
        if (data.timeSig) setTimeSig(data.timeSig);
        if (data.duration) setDuration(data.duration);
        if (data.language) setLanguage(data.language);
        if (data.voice) setVoice(data.voice);

        // Only override/set title if the user hasn't specified a custom title (i.e. it is empty or default)
        const isTitleEmptyOrDefault = !currentTrackTitle || 
                                       currentTrackTitle.trim() === '' || 
                                       currentTrackTitle === 'UNTITLED MOOD WAVE' || 
                                       currentTrackTitle === 'FALLBACK MOOD SINE' || 
                                       currentTrackTitle === 'GENERATED WAVE';
        if (data.title && isTitleEmptyOrDefault) {
          setCurrentTrackTitle(data.title);
        }

        setPolishLyricsProgress(100);
        setTimeout(() => {
          setIsPolishingLyrics(false);
          setPolishLyricsProgress(0);
        }, 250);
      } else {
        throw new Error('Polished result empty or lyrics key invalid');
      }
    } catch (err: any) {
      console.error("Local LLM polish lyrics failed, using offline fallback", err);
      // Display red alert inside visual mask for 3 seconds before formatting local backup
      setPolishLyricsError(err.message || '网络连接被拒绝 / Network Connection Refused');
      setPolishLyricsProgress(100);

      setTimeout(() => {
        const current = promptText.trim();
        let polished = "";
        if (!current) {
          polished = `[Verse 1]\n在深邃的霓虹夜幕下\n雨水打湿了冰冷的光纤与代码\n我听见 频率在静止中挣扎\n\n[Chorus]\n让情绪 沿着正弦波缓缓流动\n跨越虚无 与未知的你相拥\n在数字的海洋里 我们永不失联\n\n[Outro]\n余音袅袅 归于温热的静默。`;
        } else {
          const lines = current.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length <= 2) {
            polished = `[Verse 1]\n${lines[0] || '独自一人的波段'}\n\n[Chorus]\n${lines[1] || lines[0] || '情绪在此刻回响'}\n\n[Outro]\n余音袅袅，归于平静。`;
          } else {
            const mid = Math.ceil(lines.length / 2);
            const verseLines = lines.slice(0, mid).join('\n');
            const chorusLines = lines.slice(mid).join('\n');
            polished = `[Verse 1]\n${verseLines}\n\n[Chorus]\n${chorusLines}\n\n[Outro]\n(伴奏渐弱)`;
          }
        }
        setLyrics(polished);

        // Auto adapts styling defaults offline
        const lyricsLower = polished.toLowerCase();
        let fallbackStyle = "Ambient Chillout, Cosmic Pad";
        let fbBpm = "72";
        let fbChords = "Pentatonic Scale / Major 7th";
        let fbTimeSig = "4/4";
        let fbDuration = "03:30";
        let fbVoice = "Female";
        let fbLang = "Mandarin";

        if (lyricsLower.includes("霓虹") || lyricsLower.includes("光纤") || lyricsLower.includes("代码") || lyricsLower.includes("synth") || lyricsLower.includes("cyber")) {
          fallbackStyle = "Liquid Synthwave, Retrowave, Neo-80s Analogue";
          fbBpm = "118";
          fbChords = "Minor 7th / Flat 5";
          fbTimeSig = "4/4";
          fbDuration = "03:15";
        } else if (lyricsLower.includes("雨") || lyricsLower.includes("咖啡") || lyricsLower.includes("角落") || lyricsLower.includes("lofi") || lyricsLower.includes("lo-fi")) {
          fallbackStyle = "Cinematic Lofi Hip Hop, Rainy Jazz Piano, Vinyl Crackle";
          fbBpm = "80";
          fbChords = "Minor 9th / Diminished";
          fbTimeSig = "4/4";
          fbDuration = "03:30";
        } else if (lyricsLower.includes("混沌") || lyricsLower.includes("挣扎") || lyricsLower.includes("频率") || lyricsLower.includes("chaos") || lyricsLower.includes("glitch")) {
          fallbackStyle = "Dark Cyber Electro, Void Techno, Neon Glitch Percussion";
          fbBpm = "128";
          fbChords = "Dissonant Augmented";
          fbTimeSig = "7/8";
          fbDuration = "02:45";
          fbVoice = "Instrumental";
          fbLang = "Auto";
        }

        setSongStyle(fallbackStyle);
        setBpm(fbBpm);
        setChords(fbChords);
        setTimeSig(fbTimeSig);
        setDuration(fbDuration);
        setVoice(fbVoice);
        setLanguage(fbLang);

        // Offline fallback title generation
        const isTitleEmptyOrDefault = !currentTrackTitle || 
                                       currentTrackTitle.trim() === '' || 
                                       currentTrackTitle === 'UNTITLED MOOD WAVE' || 
                                       currentTrackTitle === 'FALLBACK MOOD SINE' || 
                                       currentTrackTitle === 'GENERATED WAVE';
        if (isTitleEmptyOrDefault) {
          let fallbackTitle = "未命名波段 / Untitled Wave";
          if (fallbackStyle.includes("Synthwave")) {
            fallbackTitle = "霓虹幻象 / Neon Illusion";
          } else if (fallbackStyle.includes("Lofi")) {
            fallbackTitle = "雨夜独白 / Rainy Monologue";
          } else if (fallbackStyle.includes("Cyber")) {
            fallbackTitle = "数字混沌 / Glitch State";
          }
          setCurrentTrackTitle(fallbackTitle);
        }

        setIsPolishingLyrics(false);
        setPolishLyricsProgress(0);
        setPolishLyricsError(null);
      }, 3000);
    }
  };

  const handlePolishStyle = async () => {
    if (!currentUser) {
      onRequestLogin();
      return;
    }
    if (isPolishingStyle) return;
    setIsPolishingStyle(true);
    setPolishStyleProgress(15);
    setPolishStyleError(null);

    const performStyleFetch = async (url: string) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style: songStyle })
      });
      if (!res.ok) {
        let text = '';
        try { text = await res.text(); } catch (e) {}
        throw new Error(`HTTP ${res.status}: ${text || 'Unknown style API Failure'}`);
      }
      return await res.json();
    };

    try {
      setPolishStyleProgress(35);
      let data;
      try {
        data = await performStyleFetch('/api/polish-style');
      } catch (proxyErr) {
        console.warn("Vite Proxy connection failed on style polish, attempting direct port 3001...", proxyErr);
        data = await performStyleFetch('http://127.0.0.1:3001/api/polish-style');
      }

      setPolishStyleProgress(75);

      if (data && data.polished) {
        setPolishStyleProgress(90);
        setSongStyle(data.polished);
        setPolishStyleProgress(100);
        setTimeout(() => {
          setIsPolishingStyle(false);
          setPolishStyleProgress(0);
        }, 250);
      } else {
        throw new Error('Polished style result empty');
      }
    } catch (err: any) {
      console.error("Local LLM polish style failed, using offline fallback", err);
      setPolishStyleError(err.message || '网络连接被拒绝 / Network Connection Refused');
      setPolishStyleProgress(100);

      setTimeout(() => {
        const current = songStyle.trim().toLowerCase();
        let polished = "";

        if (!current) {
          polished = "Ambient Chillout, Liquid Synthwave, Healing Solfeggio, Analog Warmth, Cosmic Pad";
        } else if (current.includes("synth") || current.includes("wave") || current.includes("霓虹") || current.includes("复古")) {
          polished = "Liquid Synthwave, Retrowave, Neo-80s Analogue, Cyberpunk Neon Drive, 115 BPM, Vintage Chorus";
        } else if (current.includes("ambient") || current.includes("chill") || current.includes("静") || current.includes("空")) {
          polished = "Ambient Drone, Deep Solfeggio Resonance, Cinematic Space Pad, Whispering Wind, 72 BPM";
        } else if (current.includes("techno") || current.includes("club") || current.includes("cyber") || current.includes("赛博")) {
          polished = "Dark Cyber Electro, Void Techno, Heavy Industrial Sub, Neon Glitch Percussion, 128 BPM";
        } else if (current.includes("lofi") || current.includes("lo-fi") || current.includes("jazz") || current.includes("雨") || current.includes("咖啡")) {
          polished = "Cinematic Lofi Hip Hop, Rainy Jazz Piano, Vinyl Crackle, Nostalgic Rhodes, 85 BPM";
        } else {
          const enrichedTerms = ["Analogue Saturation", "Stereo Reverb Space", "Warm Bassline", "High-fidelity Sparkle"];
          const base = songStyle.split(',').map(s => s.trim().replace(/\b\w/g, c => c.toUpperCase())).join(', ');
          polished = `${base}, ${enrichedTerms[Math.floor(Math.random() * enrichedTerms.length)]}, Electronic Ambient Mood`;
        }

        setSongStyle(polished);
        setIsPolishingStyle(false);
        setPolishStyleProgress(0);
        setPolishStyleError(null);
      }, 3000);
    }
  };

  const handleFeelingLucky = () => {
    const presets = [
      {
        lyrics: "在深邃的霓虹夜幕下，雨水打湿了冰冷的光纤与代码。我听见频率在静止中挣扎，默默倒数着重置的时刻。",
        title: "霓虹幻象 / NEON ILLUSION",
        style: "Liquid Synthwave, Cyberpunk, Retrowave, Neo-80s Analogue",
        bpm: "118",
        chords: "Minor 7th / Flat 5",
        language: "Mandarin",
        timeSig: "4/4",
        voice: "Female"
      },
      {
        lyrics: "绿茗清香萦绕在晨雾中，风铃在微风中轻吟。细沙勾勒出枯山水的波纹，时光在这一刻静止。",
        title: "禅意静谧 / ZEN RESONANCE",
        style: "Ambient Chime, Flute, Minimalist Organic, Koto, Drone",
        bpm: "72",
        chords: "Pentatonic Scale / Major 7th",
        language: "Mandarin",
        timeSig: "4/4",
        voice: "Female"
      },
      {
        lyrics: "系统故障在第九分区，损毁的数据包在缓冲区漂浮。逻辑门因电流过载而燃烧，等待着最后一次重启。",
        title: "数字混沌 / GLITCH STATE",
        style: "Glitch Hop, IDM, Breakcore, Deconstructed Club, Noise",
        bpm: "150",
        chords: "Dissonant Augmented",
        language: "Mandarin",
        timeSig: "7/8",
        voice: "Instrumental"
      },
      {
        lyrics: "手牵手穿过喧嚣的都市霓虹，你在黄昏中的微笑如此温暖。从今天起，我们走向永恒。",
        title: "纪念之约 / ANALOG VOW",
        style: "R&B, Cinematic Romance, Warm Synth, Lofi Chill",
        bpm: "85",
        chords: "Major 9th / Minor 11th",
        language: "Mandarin",
        timeSig: "4/4",
        voice: "Male"
      },
      {
        lyrics: "深夜的低保真节拍敲打着心房，代码在黑暗中缓缓编译。咖啡的蒸汽在月光下飘散，梦境模式已悄然激活。",
        title: "午夜波段 / LATE NIGHT WAVE",
        style: "Cinematic Lofi Hip Hop, Rainy Jazz Piano, Vinyl Dust",
        bpm: "80",
        chords: "Minor 9th / Diminished",
        language: "Mandarin",
        timeSig: "4/4",
        voice: "Female"
      },
      {
        lyrics: "穿过土星光环的虚无，引力正在渐渐消失。星尘在眼中闪烁，寻找着生命最后的微光。",
        title: "星轨漂流 / COSMIC DRIFT",
        style: "Void Techno, Industrial Drone, Cyberpunk EBM, Space Pad",
        bpm: "96",
        chords: "Minor 9th / Sus4",
        language: "Mandarin",
        timeSig: "4/4",
        voice: "Instrumental"
      },
      {
        lyrics: "紧张的等待终于结束，前方的道路洒满星光。所有的汗水与泪水，在此刻绽放为耀眼的胜利。",
        title: "破晓凯旋 / TRIUMPH CORE",
        style: "Uplifting Orchestral, Progressive House, Victory Fanfare",
        bpm: "128",
        chords: "I-V-vi-IV Progression",
        language: "Mandarin",
        timeSig: "4/4",
        voice: "Female"
      },
      {
        lyrics: "窗外细雨轻轻敲打着玻璃，手捧一杯温热的摩卡。柔软的毛毯包裹着身躯，任凭慢爵士在空气中流淌。",
        title: "雨夜漫步 / RAINY PORT",
        style: "Cinematic Lofi Hip Hop, Rainy Jazz Piano, Soft Vinyl Crackle",
        bpm: "80",
        chords: "Minor 9th / Diminished",
        language: "Mandarin",
        timeSig: "4/4",
        voice: "Female"
      },
      {
        lyrics: "Floating through the rings of Saturn, gravity fades to zero. Stardust in my eyes, searching for a sign of life.",
        title: "COSMIC DRIFT",
        style: "Void Techno, Industrial Drone, Cyberpunk EBM",
        bpm: "90",
        chords: "Minor 9th / Sus4",
        language: "English",
        timeSig: "4/4",
        voice: "Female"
      },
      {
        lyrics: "Late night lo-fi beats, code compiling in the dark. Coffee steam drifting through the moonlight, dream-state activated.",
        title: "RAINY PORT",
        style: "Cyberpunk Lofi, Rainy Jazz Piano, Vinyl Dust",
        bpm: "85",
        chords: "Minor 9th / Diminished",
        language: "English",
        timeSig: "4/4",
        voice: "Female"
      }
    ];

    const randomPreset = presets[Math.floor(Math.random() * presets.length)];
    const randomDurations = ["02:45", "03:15", "03:30", "04:10"];

    setLyrics(randomPreset.lyrics);
    setSongStyle(randomPreset.style);
    setVoice(randomPreset.voice);
    setDuration(randomDurations[Math.floor(Math.random() * randomDurations.length)]);
    setLanguage(randomPreset.language);
    setChords(randomPreset.chords);
    setTimeSig(randomPreset.timeSig);
    setBpm(String(randomPreset.bpm));
    setCurrentTrackTitle(randomPreset.title);
    setIsGenerated(false);
    setIsSaved(false);
  };

  // Generator State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [isGenerated, setIsGenerated] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // Audio Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(84); // 01:24 in seconds
  const [totalTime, setTotalTime] = useState(210); // 03:30 in seconds
  const [currentTrackTitle, setCurrentTrackTitle] = useState('UNTITLED MOOD WAVE');

  // Waveform heights
  const [waveHeights, setWaveHeights] = useState<number[]>(
    Array.from({ length: 30 }, () => Math.random() * 60 + 10)
  );

  const coverCanvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const waveAnimRef = useRef<number | null>(null);
  const synthRef = useRef<AudioSynth | null>(null);
  const lastLoadedMoodRef = useRef<string>('');

  // Real Audio Spectrum Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Apply initial mood if passed
  useEffect(() => {
    if (initialMood) {
      const moodKey = typeof initialMood === 'string'
        ? `str:${initialMood}`
        : `obj:${initialMood.label || ''}:${initialMood.lyricsPrompt || ''}`;

      if (lastLoadedMoodRef.current === moodKey) {
        return;
      }
      lastLoadedMoodRef.current = moodKey;

      if (typeof initialMood === 'string') {
        // Custom string: immediately trigger auto polish logic to fill lyrics & parameters
        const cleanPrompt = initialMood.trim();
        setLyrics(cleanPrompt);
        setSongStyle('Ambient, Electronica, Cinematic');
        setCurrentTrackTitle(cleanPrompt.toUpperCase().slice(0, 24) || 'CUSTOM WAVE');
        
        // Asynchronously call the auto polish route to populate everything via LLM
        setTimeout(() => {
          handlePolishLyrics(cleanPrompt);
        }, 100);
      } else {
        // PresetTag object
        setLyrics(initialMood.lyricsPrompt);
        setSongStyle(initialMood.style);
        setBpm(String(initialMood.bpm));
        setChords(initialMood.chords);
        setTimeSig(initialMood.timeSig);
        setCurrentTrackTitle(`${initialMood.englishLabel.toUpperCase()} PULSE`);

        // Automatically fill advanced panel configuration
        if (initialMood.duration) setDuration(initialMood.duration);
        if (initialMood.language) setLanguage(initialMood.language);
        if (initialMood.voice) setVoice(initialMood.voice);
      }
      setIsGenerated(false);
      setIsSaved(false);
      setIsPlaying(false);
    }
  }, [initialMood]);

  // Auto-adapt totalTime based on duration parameter changes
  useEffect(() => {
    let durationSec = 210;
    if (duration && duration.includes(':')) {
      const parts = duration.split(':');
      const m = parseInt(parts[0], 10) || 0;
      const s = parseInt(parts[1], 10) || 0;
      durationSec = m * 60 + s;
    } else if (duration) {
      durationSec = Number(duration) || 210;
    }
    setTotalTime(durationSec);
  }, [duration]);

  // Fallback front-end dummy synthesis task
  const triggerMockGenerationFallback = () => {
    if (fallbackIntervalRef.current) clearInterval(fallbackIntervalRef.current);
    let progress = 10;
    fallbackIntervalRef.current = setInterval(() => {
      progress += Math.ceil(Math.random() * 18 + 2);
      if (progress >= 100) {
        if (fallbackIntervalRef.current) {
          clearInterval(fallbackIntervalRef.current);
          fallbackIntervalRef.current = null;
        }
        setGenerationProgress(100);
        setIsGenerating(false);
        setIsGenerated(true);
        setIsPlaying(true);

        // 创建不包含 audioUrl 的普通音轨 (走原生 Web Audio WebSynth 发声)
        const fallbackTrack: Track = {
          id: `track-${Date.now()}`,
          title: currentTrackTitle || 'FALLBACK MOOD SINE',
          bpm: Number(bpm) || 95,
          duration: duration || '02:00',
          style: songStyle || 'Ambient',
          coverSeed: String(Date.now() + Math.random()),
          lyrics,
          voice,
          chords,
          timeSig,
          isCustom: true
        };
        onSaveToLibrary(fallbackTrack);
      } else {
        setGenerationProgress(progress);
      }
    }, 450);
  };

  // Handle generation action (RunningHub Tasks submission & concurrent polling)
  const handleGenerate = async () => {
    if (!currentUser) {
      onRequestLogin();
      return;
    }
    if (isGenerating) return;
    setIsGenerating(true);
    setGenerationProgress(5);
    setIsPlaying(false);
    setIsSaved(false);
    setGeneratedAudioUrl('');
    setGeneratedCoverUrl('');

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    let finalCoverUrl = '';
    let finalAudioUrl = '';

    // ==========================================
    // 阶段 1: 生成并渲染 AI 专辑封面
    // ==========================================
    try {
      setGenerationProgress(8);
      // 向后端发起单独的生图任务
      const coverRes = await fetch('/api/runninghub/generate-cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lyrics, style: songStyle })
      });

      if (!coverRes.ok) throw new Error('Cover generation submission failed');
      const coverData = await coverRes.json();
      const coverTaskId = coverData.taskId;

      if (!coverTaskId) throw new Error('No taskId found for cover');

      // 开启封面轮询 (含 5 次连续网络错误重试容错保护与空链接平滑自降级)
      const checkCoverStatus = (): Promise<string> => {
        return new Promise((resolve, reject) => {
          let queryCount = 0;
          let consecutiveErrors = 0;
          let emptyUrlRetries = 0;
          const poll = async () => {
            try {
              const queryRes = await fetch('/api/runninghub/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: coverTaskId })
              });
              if (!queryRes.ok) throw new Error(`HTTP error ${queryRes.status}`);
              const queryData = await queryRes.json();
              const status = queryData.status;

              consecutiveErrors = 0; // 只要请求成功，清空错误计数器

              if (status === 'SUCCESS') {
                const url = queryData.results && queryData.results[0] && queryData.results[0].url;
                if (!url) {
                  emptyUrlRetries++;
                  console.warn(`Cover SUCCESS but URL is not ready yet (attempt ${emptyUrlRetries}/3)...`);
                  if (emptyUrlRetries >= 3) {
                    console.warn("Cover URL remained empty on cloud. Resolving with fallback to bypass block.");
                    resolve(`https://picsum.photos/seed/${encodeURIComponent((currentTrackTitle || 'WAVE') + '-' + Math.floor(Math.random() * 10000))}/400/400`);
                  } else {
                    setTimeout(poll, 4000);
                  }
                  return;
                }
                resolve(url);
              } else if (status === 'QUEUED' || status === 'RUNNING') {
                queryCount++;
                // 在生图期间，进度条慢进到 15%
                setGenerationProgress(Math.min(15, 8 + queryCount));
                setTimeout(poll, 4000);
              } else {
                reject(new Error(queryData.errorMessage || 'Cover generation failed on cloud'));
              }
            } catch (err) {
              consecutiveErrors++;
              console.warn(`Query cover status failed (attempt ${consecutiveErrors}/5):`, err);
              if (consecutiveErrors >= 5) {
                reject(err);
              } else {
                setTimeout(poll, 4000);
              }
            }
          };
          setTimeout(poll, 2000);
        });
      };

      // 等待封面生成成功
      finalCoverUrl = await checkCoverStatus();
      setGeneratedCoverUrl(finalCoverUrl); // 立刻回填渲染到右侧预览框中！
      setGenerationProgress(18);

    } catch (coverErr) {
      console.warn("Cover generation failed or timed out, skipping to music:", coverErr);
      // 封面失败时，回填 Picsum 随机图作为兜底，不阻塞流程
      finalCoverUrl = `https://picsum.photos/seed/${encodeURIComponent((currentTrackTitle || 'WAVE') + '-' + Math.floor(Math.random() * 10000))}/400/400`;
      setGeneratedCoverUrl(finalCoverUrl);
      setGenerationProgress(18);
    }

    // ==========================================
    // 阶段 2: 生成高保真音乐
    // ==========================================
    try {
      setGenerationProgress(20);
      // 向后端发起音乐生成任务，显式传入 skipCover: true 避免并发与重复生成
      const musicRes = await fetch('/api/runninghub/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          style: songStyle,
          lyrics,
          duration,
          language,
          chords,
          timeSig,
          bpm,
          skipCover: true,
          voice
        })
      });

      if (!musicRes.ok) throw new Error('Music generation submission failed');
      const musicData = await musicRes.json();
      const musicTaskId = musicData.taskId;

      if (!musicTaskId) throw new Error('No taskId found for music');

      // 开启音乐轮询 (含 5 次连续网络错误重试容错保护)
      const checkMusicStatus = (): Promise<string> => {
        return new Promise((resolve, reject) => {
          let progressVal = 22;
          let consecutiveErrors = 0;
          const poll = async () => {
            try {
              const queryRes = await fetch('/api/runninghub/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: musicTaskId })
              });
              if (!queryRes.ok) throw new Error(`HTTP error ${queryRes.status}`);
              const queryData = await queryRes.json();
              const status = queryData.status;

              consecutiveErrors = 0; // 只要请求成功，清空错误计数器

              if (status === 'SUCCESS') {
                const url = queryData.results && queryData.results[0] && queryData.results[0].url;
                if (!url) throw new Error('SUCCESS but empty music URL');
                resolve(url);
              } else if (status === 'QUEUED') {
                progressVal = Math.min(35, progressVal + 1);
                setGenerationProgress(progressVal);
                setTimeout(poll, 4000);
              } else if (status === 'RUNNING') {
                progressVal = Math.min(95, progressVal + Math.ceil(Math.random() * 6 + 2));
                setGenerationProgress(progressVal);
                setTimeout(poll, 4000);
              } else {
                reject(new Error(queryData.errorMessage || 'Music generation failed on cloud'));
              }
            } catch (err) {
              consecutiveErrors++;
              console.warn(`Query music status failed (attempt ${consecutiveErrors}/5):`, err);
              if (consecutiveErrors >= 5) {
                reject(err);
              } else {
                setTimeout(poll, 4000);
              }
            }
          };
          setTimeout(poll, 2000);
        });
      };

      // 等待音乐生成成功
      finalAudioUrl = await checkMusicStatus();
      
      // ==========================================
      // 阶段 3: 归档成品 Track 并播放
      // ==========================================
      setGeneratedAudioUrl(finalAudioUrl);
      setGenerationProgress(100);
      setIsGenerating(false);
      setIsGenerated(true);
      setIsPlaying(true);

      const finalTrack: Track = {
        id: `track-${Date.now()}`,
        title: currentTrackTitle || 'RUNNINGHUB CORE WAVE',
        bpm: Number(bpm) || 95,
        duration: duration || '02:00',
        style: songStyle || 'Ambient',
        coverSeed: String(Date.now() + Math.random()),
        lyrics,
        voice,
        chords,
        timeSig,
        isCustom: true,
        audioUrl: finalAudioUrl,
        coverUrl: finalCoverUrl || undefined
      };

      onSaveToLibrary(finalTrack, musicTaskId);

    } catch (musicErr) {
      console.warn("Music generation failed, running local mock fallback:", musicErr);
      // 音乐生成失败，降级为本地合成器模拟轨道，但保留我们刚刚生成出来的封面！
      triggerMockGenerationFallbackWithCover(finalCoverUrl);
    }
  };

  const triggerMockGenerationFallbackWithCover = (coverUrl?: string) => {
    if (fallbackIntervalRef.current) clearInterval(fallbackIntervalRef.current);
    let progress = 20;
    fallbackIntervalRef.current = setInterval(() => {
      progress += Math.ceil(Math.random() * 18 + 2);
      if (progress >= 100) {
        if (fallbackIntervalRef.current) {
          clearInterval(fallbackIntervalRef.current);
          fallbackIntervalRef.current = null;
        }
        setGenerationProgress(100);
        setIsGenerating(false);
        setIsGenerated(true);
        setIsPlaying(true);

        const fallbackTrack: Track = {
          id: `track-${Date.now()}`,
          title: currentTrackTitle || 'FALLBACK MOOD SINE',
          bpm: Number(bpm) || 95,
          duration: duration || '02:00',
          style: songStyle || 'Ambient',
          coverSeed: String(Date.now() + Math.random()),
          lyrics,
          voice,
          chords,
          timeSig,
          isCustom: true,
          coverUrl: coverUrl || undefined
        };
        onSaveToLibrary(fallbackTrack);
      } else {
        setGenerationProgress(progress);
      }
    }, 450);
  };

  // Playback timeline interval (Only for Web Audio Synth fallback mode)
  useEffect(() => {
    if (isPlaying && !generatedAudioUrl) {
      intervalRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= totalTime) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, totalTime, generatedAudioUrl]);

  // Real MP3 audio player trigger & updates
  useEffect(() => {
    if (isPlaying && generatedAudioUrl) {
      if (!audioRef.current) {
        const audio = new Audio(sanitizeAudioUrl(generatedAudioUrl));
        audio.loop = true;
        audio.crossOrigin = "anonymous";
        audio.addEventListener('timeupdate', () => {
          setCurrentTime(Math.floor(audio.currentTime));
        });
        audioRef.current = audio;

        // Bind Web Audio Analyser
        try {
          if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          }
          if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
          }
          
          if (sourceRef.current) {
            try {
              sourceRef.current.disconnect();
            } catch (err) {}
          }
          sourceRef.current = audioCtxRef.current.createMediaElementSource(audio);
          
          if (!analyserRef.current) {
            analyserRef.current = audioCtxRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
          }
          
          sourceRef.current.connect(analyserRef.current);
          analyserRef.current.connect(audioCtxRef.current.destination);
        } catch (analyserErr) {
          console.warn("Could not bind AudioContext AnalyserNode (CORS or double connect):", analyserErr);
        }
      }
      audioRef.current.play().catch(e => console.error("Audio playback error:", e));
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, generatedAudioUrl]);

  // Web Audio Synth fallback playback hook (Only when no audioUrl is present)
  useEffect(() => {
    if (isPlaying && !generatedAudioUrl) {
      if (!synthRef.current) {
        synthRef.current = new AudioSynth(songStyle, Number(bpm) || 120, chords);
      }
      synthRef.current.play();
    } else {
      if (synthRef.current) {
        synthRef.current.stop();
        synthRef.current = null;
      }
    }
  }, [isPlaying, songStyle, bpm, chords, generatedAudioUrl]);

  // Clean up all playbacks (Synth & Audio ref) on unmount or URL switch
  useEffect(() => {
    return () => {
      if (synthRef.current) {
        synthRef.current.stop();
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
      }
    };
  }, [generatedAudioUrl]);

  // Animate Waveform Bars while playing
  useEffect(() => {
    let frame: number;
    const animateWave = () => {
      if (isPlaying) {
        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          // Downsample frequency bins to 30 bars
          const newHeights = Array.from({ length: 30 }, (_, i) => {
            const dataIdx = Math.floor((i / 30) * (dataArray.length * 0.7));
            const val = dataArray[dataIdx];
            return (val / 255) * 77 + 8; // Map to 8% - 85% height
          });
          setWaveHeights(newHeights);
        } else {
          setWaveHeights(Array.from({ length: 30 }, () => Math.random() * 70 + 8));
        }
      }
      frame = requestAnimationFrame(animateWave);
    };
    animateWave();

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [isPlaying]);

  // Render Cover Art Generative Visual
  useEffect(() => {
    const canvas = coverCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animFrame: number;
    let angle = 0;

    const render = () => {
      const w = (canvas.width = 400);
      const h = (canvas.height = 400);

      // Background
      ctx.fillStyle = generatedCoverUrl ? '#000000' : '#0a0a0a';
      ctx.fillRect(0, 0, w, h);

      // Cyber grid lines
      ctx.strokeStyle = '#121212';
      ctx.lineWidth = 1;
      for (let i = 0; i < w; i += 20) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(w, i);
        ctx.stroke();
      }

      // Drawing rings or particles
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(angle);

      // Glowing abstract orbits
      const pulses = isPlaying ? Math.sin(Date.now() * 0.005) * 12 : 0;
      const numRings = 4;
      for (let i = 0; i < numRings; i++) {
        const radius = 60 + i * 25 + pulses;
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(0, 255, 157, 0.4)' : 'rgba(255, 60, 100, 0.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 1.5);
        ctx.stroke();

        // Little orbits stars
        ctx.fillStyle = i % 2 === 0 ? '#00ff9d' : '#ff3c64';
        const startAngle = (angle * (i + 1) * 0.3) % (Math.PI * 2);
        const sx = radius * Math.cos(startAngle);
        const sy = radius * Math.sin(startAngle);
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Inside core neon circle
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#00ff9d';
      ctx.strokeStyle = '#00ff9d';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 45, 0, Math.PI * 2);
      ctx.stroke();

      // Oscilloscope wave through core
      ctx.restore();
      ctx.shadowBlur = 0;

      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(0, 255, 157, 0.5)';
      ctx.lineWidth = 1.5;

      const dataArray = new Uint8Array(128);
      let hasRealData = false;
      if (analyserRef.current && isPlaying) {
        analyserRef.current.getByteTimeDomainData(dataArray);
        hasRealData = true;
      }

      // Upper Waveform
      ctx.beginPath();
      const pointsCount = 80;
      const sliceWidth = w / pointsCount;
      for (let i = 0; i <= pointsCount; i++) {
        const x = i * sliceWidth;
        let amplitude = 0;
        if (hasRealData) {
          const v = dataArray[Math.floor((i / pointsCount) * dataArray.length)] / 128.0;
          amplitude = Math.abs(v - 1.0) * 85;
        } else {
          const time = Date.now() * 0.001;
          const bpmSpeed = ((Number(bpm) || 95) / 60) * Math.PI;
          const pulse = isPlaying ? (Math.sin(time * bpmSpeed) * 0.4 + 0.6) : 0.1;
          const sine = Math.sin(i * 0.15 + time * 10) * Math.cos(i * 0.05);
          amplitude = isPlaying ? (Math.abs(sine) * 35 * pulse + Math.random() * 3) : (Math.sin(i * 0.2 + time) * 3 + 2);
        }
        const y = h / 2 - amplitude;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(0, 255, 157, 0.85)';
      ctx.stroke();

      // Lower (Mirror) Waveform
      ctx.beginPath();
      for (let i = 0; i <= pointsCount; i++) {
        const x = i * sliceWidth;
        let amplitude = 0;
        if (hasRealData) {
          const v = dataArray[Math.floor((i / pointsCount) * dataArray.length)] / 128.0;
          amplitude = Math.abs(v - 1.0) * 85;
        } else {
          const time = Date.now() * 0.001;
          const bpmSpeed = ((Number(bpm) || 95) / 60) * Math.PI;
          const pulse = isPlaying ? (Math.sin(time * bpmSpeed) * 0.4 + 0.6) : 0.1;
          const sine = Math.sin(i * 0.15 + time * 10) * Math.cos(i * 0.05);
          amplitude = isPlaying ? (Math.abs(sine) * 35 * pulse + Math.random() * 3) : (Math.sin(i * 0.2 + time) * 3 + 2);
        }
        const y = h / 2 + amplitude;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(0, 255, 157, 0.45)';
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Holographic text data overlay
      ctx.fillStyle = '#666';
      ctx.font = '9px monospace';
      ctx.fillText('SANZO NEURAL CORE V3.0', 15, 30);
      ctx.fillText(`BPM: ${bpm}  SIG: ${timeSig}`, 15, 45);
      const displayChords = typeof chords === 'string' ? chords : (Array.isArray(chords) ? (chords as string[]).join(' - ') : 'AUTO');
      ctx.fillText(`CHORDS: ${displayChords.toUpperCase()}`, 15, 60);

      ctx.fillStyle = '#00ff9d';
      ctx.font = '11px monospace';
      ctx.fillText('AUDIO EMITTER STABLE', 260, 30);
      ctx.fillText(`TRACK_ID: ${isGenerated ? 'S_00' + (savedTracks.length + 1) : 'PENDING'}`, 260, 45);

      angle += 0.01;
      animFrame = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animFrame);
    };
  }, [isPlaying, bpm, timeSig, chords, isGenerated, savedTracks.length]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleDownloadGeneratedTrack = () => {
    if (!generatedAudioUrl) return;

    // 1. Download MP3
    const audioLink = document.createElement("a");
    audioLink.href = sanitizeAudioUrl(generatedAudioUrl);
    audioLink.target = "_blank";
    audioLink.download = `${(currentTrackTitle || 'generated_wave').replace(/[^a-z0-9]/gi, '_')}.mp3`;
    document.body.appendChild(audioLink);
    audioLink.click();
    document.body.removeChild(audioLink);

    // 2. Download Lyrics
    const lyricText = `==================================================
   SANZO MUSIC - SINGLE RELEASE LYRICS
==================================================

TITLE: ${currentTrackTitle || 'Untitled Mood Wave'}
STYLE: ${songStyle || 'Ambient'}
BPM: ${bpm || '120'} | TIME SIG: ${timeSig || '4/4'}
CHORDS: ${chords || 'Auto'}
VOICES: ${voice || 'FEMALE'}

--------------------------------------------------
                  歌词 / LYRICS
--------------------------------------------------

${lyrics ? lyrics : '(Pure Instrumentals / 无歌词人声哼唱)'}

==================================================`;

    const element = document.createElement("a");
    const file = new Blob([lyricText], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `${(currentTrackTitle || 'generated_wave').replace(/[^a-z0-9]/gi, '_')}_Lyrics.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleSaveTrack = () => {
    if (isSaved) return;

    const newTrack: Track = {
      id: `saved_${Date.now()}`,
      title: currentTrackTitle || 'GENERATED WAVE',
      bpm: Number(bpm) || 120,
      duration: duration || '03:30',
      style: songStyle || 'Electronic',
      coverSeed: `generated_${Date.now()}`,
      lyrics,
      voice,
      chords,
      timeSig,
      isCustom: true,
    };

    onSaveToLibrary(newTrack);
    setIsSaved(true);
  };

  return (
    <div className="relative w-full max-w-6xl mx-auto px-4 mt-8 pb-16">
      {/* Container Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Side: Parameters Form (MUSIC GENERATOR) */}
        <div className="lg:col-span-7 bg-[#0b0b0b] border border-[#161616] p-6 md:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-baseline border-b border-[#161616] pb-4 gap-4">
            <div>
              <h2 className="text-xl font-extrabold tracking-wider text-white">MUSIC GENERATOR</h2>
              <p className="text-[10px] text-gray-500 font-mono tracking-widest mt-0.5">
                SANZO AUDIO ENGINE V3.0
              </p>
            </div>

            {/* Sub-tabs aligned on the same row */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-4.5 w-full sm:w-auto">
              <button
                id="btn-feeling-lucky"
                onClick={handleFeelingLucky}
                className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-mono tracking-wider uppercase bg-[#141414] hover:bg-[#00ff9d] border border-[#222] hover:border-transparent text-gray-400 hover:text-black transition-all duration-300 cursor-pointer active:scale-95 rounded-none flex-shrink-0"
                title="Randomly generate lyrics, style, and advanced parameters"
              >
                <Dices size={12} className="animate-pulse" />
                <span>手气不错 / LUCKY</span>
              </button>

              <button
                id="btn-quick-mode"
                onClick={() => setActiveTab('quick')}
                className={`px-3 py-1 text-[10px] font-mono tracking-wider uppercase transition-all duration-300 cursor-pointer active:scale-95 rounded-none border ${
                  activeTab === 'quick'
                    ? 'bg-[#00ff9d]/10 text-[#00ff9d] border-[#00ff9d] font-bold shadow-[0_0_10px_rgba(0,255,157,0.15)]'
                    : 'bg-[#141414] hover:bg-[#00ff9d] border-[#222] hover:border-transparent text-gray-400 hover:text-black'
                }`}
              >
                快速模式 / QUICK
              </button>
              <button
                id="btn-advanced-mode"
                onClick={() => setActiveTab('advanced')}
                className={`px-3 py-1 text-[10px] font-mono tracking-wider uppercase transition-all duration-300 cursor-pointer active:scale-95 rounded-none border ${
                  activeTab === 'advanced'
                    ? 'bg-[#00ff9d]/10 text-[#00ff9d] border-[#00ff9d] font-bold shadow-[0_0_10px_rgba(0,255,157,0.15)]'
                    : 'bg-[#141414] hover:bg-[#00ff9d] border-[#222] hover:border-transparent text-gray-400 hover:text-black'
                }`}
              >
                高级模式 / ADVANCED
              </button>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-5">
            {/* Song Title Field */}
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase text-gray-400 tracking-wider block">
                歌名 / SONG TITLE
              </label>
              <input
                id="song-title-input"
                type="text"
                value={currentTrackTitle}
                onChange={(e) => setCurrentTrackTitle(e.target.value)}
                className="w-full bg-[#101010] border border-[#202020] focus:border-[#00ff9d] text-sm text-gray-200 px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#00ff9d] placeholder-gray-700 rounded-none font-sans"
                placeholder="输入歌名，或通过润色/手气不错自动生成..."
              />
            </div>

            {/* Lyrics Field */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-mono uppercase text-gray-400 tracking-wider">
                  歌词 / LYRICS
                </label>
                <button
                  id="btn-polish-lyrics"
                  onClick={() => handlePolishLyrics()}
                  disabled={isPolishingLyrics}
                  className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono tracking-wider uppercase bg-[#141414] hover:text-white border border-[#222] hover:border-[#00ff9d]/30 text-gray-400 transition-all duration-300 cursor-pointer active:scale-95 disabled:opacity-80 rounded-none"
                  style={isPolishingLyrics ? {
                    background: `linear-gradient(to right, rgba(0, 255, 157, 0.15) ${polishLyricsProgress}%, #141414 ${polishLyricsProgress}%)`,
                    borderColor: 'rgba(0, 255, 157, 0.4)'
                  } : {}}
                  title="一键润色歌词 / Polish lyrics automatically"
                >
                  <Sparkles size={10} className={isPolishingLyrics ? 'animate-spin text-[#00ff9d]' : 'text-gray-400'} />
                  <span>{isPolishingLyrics ? `润色中 ${polishLyricsProgress}%` : '一键润色 / POLISH'}</span>
                </button>
              </div>
              <div className="relative">
                <textarea
                  id="lyrics-textarea"
                  rows={4}
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  className="w-full bg-[#101010] border border-[#202020] focus:border-[#00ff9d] text-sm text-gray-200 p-4 focus:outline-none focus:ring-1 focus:ring-[#00ff9d] placeholder-gray-700 rounded-none font-sans"
                  placeholder="Enter lyrics or describe the vocal content..."
                />
                <AnimatePresence>
                  {isPolishingLyrics && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={`absolute inset-0 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-20 transition-colors duration-300 border ${
                        polishLyricsError
                          ? 'bg-red-950/90 border-red-500/50 text-red-200'
                          : 'bg-[#050505]/95 border-[#00ff9d]/30 text-[#00ff9d]'
                      }`}
                    >
                      {polishLyricsError ? (
                        <>
                          <span className="text-base animate-pulse">⚠️</span>
                          <span className="font-mono text-[10px] tracking-wider uppercase text-center px-4 leading-normal">
                            润色失败: {polishLyricsError}
                          </span>
                          <span className="text-[9px] font-sans text-red-400/70">
                            3秒后自动回退到本地高保真排版
                          </span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="animate-spin text-[#00ff9d]" size={14} />
                          <span className="font-mono text-xs tracking-widest uppercase">
                            AI POLISHING LYRICS... {polishLyricsProgress}%
                          </span>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Song Style */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-mono uppercase text-gray-400 tracking-wider">
                  歌曲风格 / SONG STYLE
                </label>
                <button
                  id="btn-polish-style"
                  onClick={() => handlePolishStyle()}
                  disabled={isPolishingStyle}
                  className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono tracking-wider uppercase bg-[#141414] hover:text-white border border-[#222] hover:border-[#00ff9d]/30 text-gray-400 transition-all duration-300 cursor-pointer active:scale-95 disabled:opacity-80 rounded-none"
                  style={isPolishingStyle ? {
                    background: `linear-gradient(to right, rgba(0, 255, 157, 0.15) ${polishStyleProgress}%, #141414 ${polishStyleProgress}%)`,
                    borderColor: 'rgba(0, 255, 157, 0.4)'
                  } : {}}
                  title="一键润色风格 / Polish style parameters"
                >
                  <Sparkles size={10} className={isPolishingStyle ? 'animate-spin text-[#00ff9d]' : 'text-gray-400'} />
                  <span>{isPolishingStyle ? `润色中 ${polishStyleProgress}%` : '一键润色 / POLISH'}</span>
                </button>
              </div>
              <div className="relative">
                <input
                  id="style-input"
                  type="text"
                  value={songStyle}
                  onChange={(e) => setSongStyle(e.target.value)}
                  className="w-full bg-[#101010] border border-[#202020] focus:border-[#00ff9d] text-sm text-gray-200 px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#00ff9d] placeholder-gray-700 rounded-none font-sans"
                  placeholder="e.g. Synthwave, Cyberpunk, Ambient..."
                />
                <AnimatePresence>
                  {isPolishingStyle && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={`absolute inset-0 backdrop-blur-sm flex items-center justify-center gap-2 z-20 transition-colors duration-300 border ${
                        polishStyleError
                          ? 'bg-red-950/90 border-red-500/50 text-red-200'
                          : 'bg-[#050505]/95 border-[#00ff9d]/30 text-[#00ff9d]'
                      }`}
                    >
                      {polishStyleError ? (
                        <>
                          <span className="text-base animate-pulse">⚠️</span>
                          <span className="font-mono text-[10px] tracking-wider uppercase text-center px-4 truncate max-w-[280px]">
                            失败: {polishStyleError}
                          </span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="animate-spin text-[#00ff9d]" size={14} />
                          <span className="font-mono text-xs tracking-widest uppercase">
                            AI POLISHING STYLE... {polishStyleProgress}%
                          </span>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Singer Gender Dropdown */}
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase text-gray-400 tracking-wider block">
                歌手性别 / SINGER GENDER
              </label>
              <select
                id="voice-select"
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="w-full bg-[#101010] border border-[#202020] focus:border-[#00ff9d] text-sm text-gray-300 px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#00ff9d] rounded-none cursor-pointer"
              >
                <option value="Female">Female (女声)</option>
                <option value="Male">Male (男声)</option>
                <option value="Instrumental">Instrumental (纯乐器/无人声)</option>
              </select>
            </div>

            {/* Detailed Parameters Grid (Only visible in Advanced Mode) */}
            {activeTab === 'advanced' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-5"
              >
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-mono uppercase text-gray-500 block">
                      时长 / DURATION
                    </label>
                    <input
                      id="duration-input"
                      type="text"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      className="w-full bg-[#101010] border border-[#1a1a1a] focus:border-[#00ff9d] text-xs text-gray-300 px-3 py-2.5 focus:outline-none rounded-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-mono uppercase text-gray-500 block">
                      语言 / LANGUAGE
                    </label>
                    <select
                      id="lang-select"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full bg-[#101010] border border-[#1a1a1a] focus:border-[#00ff9d] text-xs text-gray-300 px-2 py-2.5 focus:outline-none rounded-none cursor-pointer"
                    >
                      <option value="Auto">Auto (自动识别)</option>
                      {language && language !== 'Auto' && !LANGUAGES.some(l => l.code === language.toLowerCase()) && (
                        <option value={language}>{language} (当前预设 / Current)</option>
                      )}
                      {LANGUAGES.map(l => (
                        <option key={l.code} value={l.code}>{l.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-mono uppercase text-gray-500 block">
                      和弦种类 / CHORDS
                    </label>
                    <select
                      id="chords-select"
                      value={chords}
                      onChange={(e) => setChords(e.target.value)}
                      className="w-full bg-[#101010] border border-[#1a1a1a] focus:border-[#00ff9d] text-xs text-gray-300 px-2 py-2.5 focus:outline-none rounded-none cursor-pointer"
                    >
                      <option value="Auto">Auto (自动推荐)</option>
                      {chords && chords !== 'Auto' && !VALID_CHORDS.includes(chords) && (
                        <option value={chords}>{chords} (当前预设)</option>
                      )}
                      <optgroup label="Major Scales (大调)">
                        {VALID_CHORDS.filter(c => c.endsWith('major')).map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Minor Scales (小调)">
                        {VALID_CHORDS.filter(c => c.endsWith('minor')).map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-mono uppercase text-gray-500 block">
                      拍子 / TIME SIG
                    </label>
                    <select
                      id="time-sig-select"
                      value={timeSig}
                      onChange={(e) => setTimeSig(e.target.value)}
                      className="w-full bg-[#101010] border border-[#1a1a1a] focus:border-[#00ff9d] text-xs text-gray-300 px-2 py-2.5 focus:outline-none rounded-none cursor-pointer"
                    >
                      <option value="4/4">4/4</option>
                      <option value="3/4">3/4</option>
                      <option value="6/8">6/8</option>
                      <option value="7/8">7/8</option>
                    </select>
                  </div>
                </div>

                <div className="w-full sm:w-1/3 space-y-1.5">
                  <label className="text-[9px] font-mono uppercase text-gray-500 block">BPM</label>
                  <input
                    id="bpm-input"
                    type="number"
                    value={bpm}
                    onChange={(e) => setBpm(e.target.value)}
                    className="w-full bg-[#101010] border border-[#1a1a1a] focus:border-[#00ff9d] text-xs text-gray-300 px-3 py-2.5 focus:outline-none rounded-none"
                  />
                </div>
              </motion.div>
            )}
          </div>

          {/* Action Trigger Block */}
          <div className="pt-6">
            <button
              id="generate-music-btn"
              disabled={isGenerating}
              onClick={handleGenerate}
              className={`w-full relative flex items-center justify-center gap-3 py-4 text-xs font-bold tracking-[0.3em] uppercase transition-all duration-300 rounded-none cursor-pointer ${
                isGenerating
                  ? 'bg-gray-800 text-gray-500 border border-transparent'
                  : 'bg-[#00ff9d] hover:bg-[#00ff9d]/90 text-black border border-transparent hover:shadow-[0_0_20px_rgba(0,255,157,0.3)]'
              }`}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="animate-spin" size={16} />
                  <span>CREATING... {generationProgress}%</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} className="animate-pulse" />
                  <span>生成音乐 / GENERATE MUSIC</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Side: Cover Preview and Visualizer */}
        <div className="lg:col-span-5 space-y-6">
          {/* Cover Art Box */}
          <div className="bg-[#0b0b0b] border border-[#161616] p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-[#161616] pb-3">
              <h3 className="text-xs font-mono font-semibold text-gray-400 tracking-wider">
                封面预览 / COVER
              </h3>
              <span className="text-[10px] font-mono text-gray-500">1:1 ASPECT RATIO</span>
            </div>

            {/* Glowing Generative Artwork Canvas Frame */}
            <div className="relative aspect-square w-full bg-[#0d0d0d] overflow-hidden border border-[#1f1f1f]">
              {generatedCoverUrl && (
                <img
                  src={generatedCoverUrl}
                  alt="AI Generated Album Cover"
                  className="absolute inset-0 w-full h-full object-cover select-none"
                />
              )}
              <canvas
                ref={coverCanvasRef}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10 animate-fade-in"
                style={generatedCoverUrl ? { mixBlendMode: 'screen', opacity: 0.85 } : {}}
                width={400}
                height={400}
              />

              {/* Title overlay in top corner for album vibe */}
              <div className="absolute top-4 left-4 bg-[#050505]/60 px-3 py-1.5 border border-white/5 backdrop-blur-sm select-none">
                <p className="text-[10px] font-mono tracking-widest text-[#00ff9d]">ACTIVE STREAM</p>
                <p className="text-xs font-bold text-white tracking-widest truncate max-w-[200px]">
                  {currentTrackTitle}
                </p>
              </div>

              {/* Loader hologram */}
              <AnimatePresence>
                {isGenerating && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-[#000]/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-4"
                  >
                    <div className="relative w-20 h-20 flex items-center justify-center">
                      <div className="absolute inset-0 border-2 border-dashed border-[#00ff9d] rounded-full animate-spin" style={{ animationDuration: '6s' }} />
                      <div className="absolute inset-2 border border-dotted border-[#ff3c64] rounded-full animate-reverse-spin" style={{ animationDuration: '4s' }} />
                      <Music size={24} className="text-[#00ff9d] animate-pulse" />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-mono text-[#00ff9d] tracking-[0.2em] uppercase animate-pulse">
                        Neural Engine Rendering
                      </p>
                      <p className="text-[10px] font-mono text-gray-500 mt-1">
                        Synthesizing Sine Waves & Timbre
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Player Controls & Interactive Waveform */}
          <div className="bg-[#0b0b0b] border border-[#161616] p-6 space-y-5">
            <div className="flex justify-between items-center border-b border-[#161616] pb-3">
              <h3 className="text-xs font-mono font-semibold text-gray-400 tracking-wider">
                预览 / PREVIEW
              </h3>
              <span className="text-[10px] font-mono text-[#00ff9d] tracking-widest font-bold">
                AUDIO ENGINE V3.0
              </span>
            </div>

            {/* Waveform Visualizer */}
            <div className="h-20 bg-[#0d0d0d] border border-[#151515] flex items-end justify-center px-4 py-2 gap-1 overflow-hidden select-none">
              {waveHeights.map((h, i) => (
                <div
                  key={i}
                  className="w-[3px] bg-gradient-to-t from-[#00ff9d]/30 to-[#00ff9d] transition-all duration-150 rounded-full"
                  style={{
                    height: `${h}%`,
                    opacity: isPlaying ? 1 : 0.4,
                  }}
                />
              ))}
            </div>

            {/* Wave Player Bar info */}
            <div className="flex items-center justify-between">
              {/* Play Pause Trigger */}
              <button
                id="player-toggle-btn"
                disabled={!isGenerated}
                onClick={() => setIsPlaying(!isPlaying)}
                className={`p-3.5 flex items-center justify-center rounded-full transition-all duration-300 cursor-pointer ${
                  isGenerated
                    ? 'bg-[#00ff9d] text-black hover:scale-105 hover:shadow-[0_0_15px_rgba(0,255,157,0.4)]'
                    : 'bg-[#151515] text-gray-600 cursor-not-allowed'
                }`}
              >
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="translate-x-0.5" />}
              </button>

              {/* Progress time slide bar */}
              <div className="flex-1 mx-4 space-y-1">
                <div
                  id="studio-player-progress-bar"
                  onClick={(e) => {
                    if (!isGenerated || totalTime <= 0) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
                    const targetTime = Math.floor(percentage * totalTime);
                    
                    if (generatedAudioUrl && audioRef.current) {
                      audioRef.current.currentTime = targetTime;
                    }
                    setCurrentTime(targetTime);
                  }}
                  className="h-3 w-full flex items-center cursor-pointer group select-none"
                  title="Jump to timeline position / 点击跳转播放位置"
                >
                  <div className="w-full h-[2px] bg-[#181818] relative">
                    <div
                      className="absolute h-full bg-[#00ff9d] left-0 top-0"
                      style={{ width: `${(currentTime / totalTime) * 100}%` }}
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#00ff9d] opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ left: `calc(${(currentTime / totalTime) * 100}% - 3px)` }}
                    />
                  </div>
                </div>
                <div className="flex justify-between text-[9px] font-mono text-gray-500">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(totalTime)}</span>
                </div>
              </div>

              {/* Download / Save To Treasury Actions */}
              <div className="flex items-center gap-2">
                {generatedAudioUrl ? (
                  <button
                    onClick={handleDownloadGeneratedTrack}
                    className="p-2.5 rounded-none border border-[#00ff9d]/30 text-[#00ff9d] hover:border-[#00ff9d] hover:bg-[#00ff9d]/5 transition-all duration-300 flex items-center justify-center cursor-pointer"
                    title="Download MP3 & Lyrics / 下载生成的歌曲与歌词"
                  >
                    <Download size={14} />
                  </button>
                ) : (
                  <button
                    disabled
                    className="p-2.5 rounded-none border border-[#1a1a1a] text-gray-600 cursor-not-allowed flex items-center justify-center"
                    title="No audio generated yet"
                  >
                    <Download size={14} />
                  </button>
                )}

                <button
                  id="share-track-btn"
                  disabled={!isGenerated}
                  className={`p-2.5 rounded-none border transition-all duration-300 flex items-center justify-center cursor-pointer ${
                    isGenerated
                      ? 'border-gray-800 text-gray-400 hover:text-white hover:border-gray-600'
                      : 'border-[#1a1a1a] text-gray-600 cursor-not-allowed'
                  }`}
                  title="Share mood track URL"
                >
                  <Share2 size={14} />
                </button>
              </div>
            </div>

            {/* Helper text when pending */}
            {!isGenerated && (
              <p className="text-[10px] font-mono text-gray-500 text-center animate-pulse pt-1">
                ▲ CONFIGURE AND PRESS GENERATE TO ENGAGE PLAYBACK
              </p>
            )}

            {isGenerated && isSaved && (
              <p className="text-[10px] font-mono text-[#00ff9d] text-center pt-1 flex items-center justify-center gap-1.5">
                <Check size={10} /> Saved to Treasury! You can arrange it in Card Grid Studio.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
