import React, { useState, useEffect, useRef } from 'react';
import { PRESETS, RECOMMENDED_TRACKS } from '../data';
import { PresetTag, Track } from '../types';
import { ArrowRight, Play, Pause, Disc, Zap, RefreshCw, Sparkles, History, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AudioSynth } from '../utils/audioSynth';

interface MoodHomeProps {
  onSelectMood: (mood: PresetTag | string) => void;
  onPlayTrack: (track: Track) => void;
  setScreen: (screen: any) => void;
  savedTracks: Track[];
  onSaveToLibrary: (track: Track, taskId?: string) => void;
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

export const MoodHome: React.FC<MoodHomeProps> = ({
  onSelectMood,
  onPlayTrack,
  setScreen,
  savedTracks,
  onSaveToLibrary,
  currentUser,
  onRequestLogin,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isQuickGenerating, setIsQuickGenerating] = useState(false);
  const [quickProgress, setQuickProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('SYNTHESIZING TRACK...');
  const [isPolishingMood, setIsPolishingMood] = useState(false);

  // Home Page Audio Player States
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(120);

  const synthRef = useRef<AudioSynth | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const polishIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleTrackClick = (track: Track) => {
    if (currentTrack && currentTrack.id === track.id) {
      setIsPlaying(!isPlaying);
    } else {
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setTimeout(() => {
        setCurrentTrack(track);
        setCurrentTime(0);
        let durationSec = 120;
        if (track.duration && track.duration.includes(':')) {
          const parts = track.duration.split(':');
          durationSec = (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
        } else if (track.duration) {
          durationSec = Number(track.duration) || 120;
        }
        setTotalTime(durationSec);
        setIsPlaying(true);
      }, 50);
    }
  };

  const handleDownloadTrack = (track: Track) => {
    // 1. Download MP3
    if (track.audioUrl) {
      const audioLink = document.createElement("a");
      audioLink.href = sanitizeAudioUrl(track.audioUrl);
      audioLink.target = "_blank";
      audioLink.download = `${track.title.replace(/[^a-z0-9]/gi, '_')}.mp3`;
      document.body.appendChild(audioLink);
      audioLink.click();
      document.body.removeChild(audioLink);
    }

    // 2. Download Lyrics Document
    const lyricText = `==================================================
   SANZO MUSIC - SINGLE RELEASE LYRICS
==================================================

TITLE: ${track.title}
STYLE: ${track.style}
BPM: ${track.bpm} | TIME SIG: ${track.timeSig || '4/4'}
CHORDS: ${track.chords || 'Auto'}
VOICES: ${track.voice || 'FEMALE'}

--------------------------------------------------
                  歌词 / LYRICS
--------------------------------------------------

${track.lyrics ? track.lyrics : '(Pure Instrumentals / 无歌词人声哼唱)'}

==================================================`;

    const element = document.createElement("a");
    const file = new Blob([lyricText], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `${track.title.replace(/[^a-z0-9]/gi, '_')}_Lyrics.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const lastPlayedTrackIdRef = useRef<string>('');

  // Real MP3 audio player trigger & progress binding with cleanup
  useEffect(() => {
    let activeAudio: HTMLAudioElement | null = null;

    const handleTimeUpdate = () => {
      if (activeAudio) {
        setCurrentTime(Math.floor(activeAudio.currentTime));
      }
    };

    if (isPlaying && currentTrack && currentTrack.audioUrl) {
      const needsNewAudio = !audioRef.current || lastPlayedTrackIdRef.current !== currentTrack.id;
      if (needsNewAudio) {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        audioRef.current = new Audio(sanitizeAudioUrl(currentTrack.audioUrl));
        audioRef.current.loop = true;
        lastPlayedTrackIdRef.current = currentTrack.id;
      }
      
      activeAudio = audioRef.current;
      activeAudio.addEventListener('timeupdate', handleTimeUpdate);
      activeAudio.play().catch(e => console.error("Audio playback error:", e));
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    }

    return () => {
      if (activeAudio) {
        activeAudio.removeEventListener('timeupdate', handleTimeUpdate);
      }
    };
  }, [isPlaying, currentTrack]);

  // Web Audio Synth playback hook (Only when currentTrack has no audioUrl)
  useEffect(() => {
    if (isPlaying && currentTrack && !currentTrack.audioUrl) {
      if (!synthRef.current) {
        synthRef.current = new AudioSynth(
          currentTrack.style,
          currentTrack.bpm,
          currentTrack.chords || 'Minor 9th'
        );
      }
      synthRef.current.play();
    } else {
      if (synthRef.current) {
        synthRef.current.stop();
        synthRef.current = null;
      }
    }
  }, [isPlaying, currentTrack]);

  // Timeline timer (Only for fallback local tracks)
  useEffect(() => {
    if (isPlaying && currentTrack && !currentTrack.audioUrl) {
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
  }, [isPlaying, totalTime, currentTrack]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (synthRef.current) synthRef.current.stop();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
      }
      if (polishIntervalRef.current) {
        clearInterval(polishIntervalRef.current);
      }
    };
  }, []);

  const handlePolishMood = async () => {
    if (!currentUser) {
      onRequestLogin();
      return;
    }
    const rawMood = inputValue.trim();
    if (!rawMood) {
      alert('请先输入你的情绪或一段创意！ / Please type a mood or story first.');
      return;
    }
    if (isPolishingMood) return;
    setIsPolishingMood(true);

    try {
      const response = await fetch('/api/generate-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: rawMood })
      });
      if (!response.ok) throw new Error('API server returned error');
      const data = await response.json();

      // 仅将大模型生成出来的排版歌词/提示词填回首页的输入框中，不生成音乐！
      if (data.lyrics) {
        setInputValue(data.lyrics);
      } else if (data.title) {
        setInputValue(`${rawMood}\n\n[POLISHED STORY: ${data.title}]\n${data.style || 'Ambient'}`);
      }

    } catch (err) {
      console.warn("Local LLM polish mood failed, using offline fallback", err);
      // Offline fallback: expand mood locally based on keywords
      const lyricsLower = rawMood.toLowerCase();
      let fallbackLyrics = rawMood;
      
      if (lyricsLower.includes("不开心") || lyricsLower.includes("难过") || lyricsLower.includes("伤心") || lyricsLower.includes("哭") || lyricsLower.includes("雨")) {
        fallbackLyrics = "[Verse 1]\n细雨无声地敲打着车窗\n冷色调的街景在不断倒退\n[Chorus]\n心底的声音像磁带一样在脑海缓缓倒带\n频率在静止中挣扎，期待一缕阳光。";
      } else if (lyricsLower.includes("开心") || lyricsLower.includes("高兴") || lyricsLower.includes("生日") || lyricsLower.includes("成功") || lyricsLower.includes("纪念日")) {
        fallbackLyrics = "[Verse 1]\n斑斓的礼花在数字穹顶下绽放\n温暖的光芒包围着彼此\n[Chorus]\n幸福的笑声在正弦波段里跃动\n星光灿烂，与未知的你相拥。";
      } else if (lyricsLower.includes("赛步") || lyricsLower.includes("赛博") || lyricsLower.includes("霓虹") || lyricsLower.includes("代码") || lyricsLower.includes("科技") || lyricsLower.includes("synth")) {
        fallbackLyrics = "[Verse 1]\n穿行在无眠的霓虹光雨中\n湿漉漉的赛博街道倒映着数据信号\n[Chorus]\n耳边是低沉重拍的电子呼吸\n在数字的海洋里，我们永不失联。";
      } else {
        fallbackLyrics = `[Verse 1]\n${rawMood}\n\n[Chorus]\n星河在静谧的黑夜中悄然运转\n电波把无人倾听的心绪折射回遥远彼岸。`;
      }
      setInputValue(fallbackLyrics);
    } finally {
      setIsPolishingMood(false);
    }
  };

  const handleCreate = () => {
    if (isQuickGenerating) return;
    const trimmedInput = inputValue.trim();
    if (!trimmedInput) {
      // Default to first preset if input is empty
      onSelectMood(PRESETS[0]);
    } else {
      // Immediately navigate with the raw mood text string
      onSelectMood(trimmedInput);
    }
  };

  const handleQuickGenerate = async () => {
    if (!currentUser) {
      onRequestLogin();
      return;
    }
    if (isQuickGenerating) return;
    
    setIsQuickGenerating(true);
    setLoadingText('GENERATING AUDIO METADATA VIA LLM...');
    setQuickProgress(15);

    const rawMood = inputValue.trim();
    const cleanMood = rawMood || 'Deep Void';
    const isReadyLyrics = cleanMood.includes('\n') || cleanMood.length > 60;

    // Helper to generate dynamic tech/ambient title combo matching prompt language
    const generateDynamicTitle = (): string => {
      const isChinese = /[\u4e00-\u9fa5]/.test(cleanMood);
      if (isChinese) {
        const adjs = ['霓虹', '黑曜', '寂静', '流体', '赛博', '微光', '宇宙', '翡翠', '孤独', '回音', '永恒', '丝绒', '重力', '天体', '熔岩', '星尘', '光晕', '极光', '月相', '星轨', '磁力'];
        const nouns = ['脉冲', '心跳', '航线', '共鸣', '梦境', '虚空', '声波', '韵律', '回响', '启程', '光谱', '光影', '同步', '星核', '潮汐', '轨迹', '幻象', '耀斑', '碎片', '交响', '变奏'];
        const seed1 = Math.floor(Math.random() * adjs.length);
        const seed2 = Math.floor(Math.random() * nouns.length);
        return `${adjs[seed1]}${nouns[seed2]}`;
      } else {
        const adjs = ['NEON', 'OBSIDIAN', 'SILENT', 'LIQUID', 'CYBER', 'GLOWING', 'COSMIC', 'EMERALD', 'SOLITARY', 'ECHOING', 'ETERNAL', 'VELVET', 'GRAVITY', 'CELESTIAL', 'VOLCANIC', 'STARDUST', 'AURA', 'AURORA', 'LUNAR', 'SOLAR', 'MAGNETIC'];
        const nouns = ['PULSE', 'HEARTBEAT', 'VOYAGE', 'HORIZON', 'RESONANCE', 'VOICE', 'DREAM', 'VOID', 'GRAVITY', 'WAVE', 'RHYTHM', 'ECHO', 'DEPARTURE', 'SPECTRUM', 'SHADOW', 'SYNCHRONY', 'CORE', 'TIDE', 'ORBIT', 'MIRAGE', 'FLARE'];
        const seed1 = Math.floor(Math.random() * adjs.length);
        const seed2 = Math.floor(Math.random() * nouns.length);
        return `${adjs[seed1]}_${nouns[seed2]}`;
      }
    };

    // Offline & error fallback routine
    const triggerQuickFallback = (llmData?: any) => {
      if (fallbackIntervalRef.current) clearInterval(fallbackIntervalRef.current);
      setLoadingText('COMPOSING TRACK (FALLBACK MODE)...');
      let progress = 30;
      fallbackIntervalRef.current = setInterval(() => {
        progress += 15;
        if (progress >= 100) {
          if (fallbackIntervalRef.current) {
            clearInterval(fallbackIntervalRef.current);
            fallbackIntervalRef.current = null;
          }
          setQuickProgress(100);

          setTimeout(() => {
            let finalTitle = '';
            let fallbackLyrics = cleanMood + "\n...星河在静谧的黑夜中悄然运转\n电波把无人倾听的心绪折射回遥远彼岸。";
            let fallbackStyle = "Ambient Chillout, Cosmic Pad";
            let fbBpm = 72;
            let fbChords = "Pentatonic Scale / Major 7th";
            let fbTime = "4/4";

            if (llmData) {
              let derived = llmData.title ? llmData.title.replace(/\s+/g, '_').toUpperCase() : '';
              if (!derived || derived === 'GENERATED_WAVE' || derived === 'POLISHED_WAVE' || derived === 'SINE_MOOD_WAVE') {
                derived = generateDynamicTitle();
              }
              finalTitle = derived;
              fallbackLyrics = isReadyLyrics ? cleanMood : (llmData.lyrics || fallbackLyrics);
              fallbackStyle = llmData.style || fallbackStyle;
              fbBpm = Number(llmData.bpm) || 80;
              fbChords = llmData.chords || fbChords;
              fbTime = llmData.timeSig || fbTime;
            } else {
              finalTitle = generateDynamicTitle();
              const lyricsLower = cleanMood.toLowerCase();
              
              if (lyricsLower.includes("不开心") || lyricsLower.includes("难过") || lyricsLower.includes("伤心") || lyricsLower.includes("哭") || lyricsLower.includes("雨")) {
                fallbackLyrics = "细雨无声地敲打着车窗\n冷色调的街景在不断倒退\n心底的声音像磁带一样在脑海缓缓倒带。";
                fallbackStyle = "Liquid Synthwave, Retrowave, Neo-80s Analogue";
                fbBpm = 118;
                fbChords = "Minor 7th / Flat 5";
              } else if (lyricsLower.includes("开心") || lyricsLower.includes("高兴") || lyricsLower.includes("生日") || lyricsLower.includes("成功") || lyricsLower.includes("纪念日")) {
                fallbackLyrics = "斑斓的礼花在数字穹顶下绽放\n温暖的光芒包围着彼此\n幸福的笑声在正弦波段里跃动。";
                fallbackStyle = "Ambient Pop, Nostalgic Acoustic";
                fbBpm = 95;
              } else if (lyricsLower.includes("赛博") || lyricsLower.includes("霓虹") || lyricsLower.includes("代码") || lyricsLower.includes("科技") || lyricsLower.includes("synth")) {
                fallbackLyrics = "穿行在无眠的霓虹光雨中\n湿漉漉的赛博街道倒映着数据信号\n耳边是低沉重拍的电子呼吸。";
                fallbackStyle = "Dark Cyber Electro, Void Techno";
                fbBpm = 128;
                fbChords = "Dissonant Augmented";
                fbTime = "7/8";
              }
            }

            const fallbackTrack: Track = {
              id: `quick_${Date.now()}`,
              title: finalTitle,
              style: fallbackStyle,
              bpm: fbBpm,
              coverSeed: String(Date.now() + Math.random()),
              duration: '03:30',
              isCustom: true,
              lyrics: fallbackLyrics,
              voice: 'Female',
              chords: fbChords,
              timeSig: fbTime,
              coverUrl: `https://picsum.photos/seed/${finalTitle}/500/500`
            };

            onSaveToLibrary(fallbackTrack);
            handleTrackClick(fallbackTrack); // Autoplay fallback synthesized sounds
            setIsQuickGenerating(false);
            setLoadingText('SYNTHESIZING TRACK...');
            setQuickProgress(0);
            setInputValue('');
          }, 300);
        } else {
          setQuickProgress(progress);
        }
      }, 450);
    };
    try {
      // 1. 调用大模型获取歌曲概念参数与歌词
      const response = await fetch('/api/generate-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: isReadyLyrics ? `[LYRIC ANALYZE MODE] Please analyze this lyric to recommend title, bpm and style. Do not invent new lyrics:\n${cleanMood}` : cleanMood })
      });
      setQuickProgress(30);

      if (!response.ok) throw new Error('LLM metadata API server returned error');
      const data = await response.json();
      setQuickProgress(45);
      setLoadingText('LLM EXPANSION SUCCESS! COMMITTING TO RUNNINGHUB...');

      const finalLyrics = isReadyLyrics ? cleanMood : (data.lyrics || cleanMood);

      // 2. 调用 RunningHub API 提交 ComfyUI 音乐生成任务
      const rhResponse = await fetch('/api/runninghub/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          style: data.style || 'Ambient, Chillout',
          lyrics: finalLyrics,
          duration: data.duration || '02:00',
          language: data.language || 'Mandarin',
          chords: data.chords || 'C major',
          timeSig: data.timeSig || '4/4',
          bpm: String(data.bpm || 95),
          skipCover: true,
          voice: data.voice || 'Female'
        })
      });

      if (!rhResponse.ok) throw new Error('RunningHub submission API error');
      const rhData = await rhResponse.json();
      const taskId = rhData.taskId;
      const coverTaskId = rhData.coverTaskId;

      if (!taskId) throw new Error('No taskId returned from RunningHub');
      
      let progressVal = 55;
      setQuickProgress(progressVal);
      setLoadingText('RUNNINGHUB COMPILED SUCCESS! QUEUING COM CORES...');

      let isMusicDone = false;
      let isCoverDone = !coverTaskId;
      let audioUrlResult = '';
      let coverUrlResult = '';

      const trySaveFinalQuickTrack = () => {
        if (!isMusicDone || !isCoverDone) return;

        setQuickProgress(100);
        setIsQuickGenerating(false);
        setLoadingText('SYNTHESIZING TRACK...');
        setInputValue('');

        // Format title, fallback to dynamic if generic
        let derivedTitle = data.title ? data.title.replace(/\s+/g, '_').toUpperCase() : '';
        if (!derivedTitle || derivedTitle === 'GENERATED_WAVE' || derivedTitle === 'POLISHED_WAVE' || derivedTitle === 'SINE_MOOD_WAVE') {
          derivedTitle = generateDynamicTitle();
        }

        const fallbackCoverUrl = `https://picsum.photos/seed/${encodeURIComponent(derivedTitle + '-' + Math.floor(Math.random() * 10000))}/500/500`;

        // 成功后自动组装成带音频与封面外链的完美歌曲
        const finalTrack: Track = {
          id: `quick_${Date.now()}`,
          title: derivedTitle,
          bpm: Number(data.bpm) || 95,
          duration: data.duration || '02:00',
          style: data.style ? data.style.split(',')[0].trim() : 'Ambient Cyber Wave',
          coverSeed: `quick_${Date.now()}`,
          isCustom: true,
          lyrics: finalLyrics,
          voice: data.voice || 'Female / Mandarin',
          chords: data.chords || 'C major',
          timeSig: data.timeSig || '4/4',
          audioUrl: audioUrlResult || undefined,
          coverUrl: coverUrlResult || fallbackCoverUrl
        };

        // 存入珍藏库
        onSaveToLibrary(finalTrack, taskId);
        // 首页原位立即播放！
        handleTrackClick(finalTrack);
      };

      // 3a. 开启音乐轮询
      const checkMusicStatus = async () => {
        try {
          const queryRes = await fetch('/api/runninghub/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId })
          });
          if (!queryRes.ok) throw new Error('RunningHub query HTTP error');
          const queryData = await queryRes.json();
          const status = queryData.status;

          if (status === 'SUCCESS') {
            audioUrlResult = queryData.results && queryData.results[0] && queryData.results[0].url;
            if (!audioUrlResult) throw new Error('SUCCESS state but empty url output');
            isMusicDone = true;
            trySaveFinalQuickTrack();
          } else if (status === 'QUEUED') {
            progressVal = Math.min(65, progressVal + 1);
            setQuickProgress(progressVal);
            setLoadingText('RUNNINGHUB QUEUING IN CLOUD...');
            setTimeout(checkMusicStatus, 4000);
          } else if (status === 'RUNNING') {
            progressVal = Math.min(95, progressVal + Math.ceil(Math.random() * 6 + 2));
            setQuickProgress(progressVal);
            setLoadingText(`RUNNINGHUB COMPOSING HARMONICS... ${progressVal}%`);
            setTimeout(checkMusicStatus, 4000);
          } else {
            throw new Error(queryData.errorMessage || 'ComfyUI Task execution failed');
          }
        } catch (queryErr) {
          console.warn("RunningHub query check error on quick generate, using fallback", queryErr);
          triggerQuickFallback(data);
        }
      };

      // 3b. 开启封面轮询
      const checkCoverStatus = async () => {
        if (isCoverDone) return;
        try {
          const queryRes = await fetch('/api/runninghub/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: coverTaskId })
          });
          if (!queryRes.ok) throw new Error('RunningHub query cover HTTP error');
          const queryData = await queryRes.json();
          const status = queryData.status;

          if (status === 'SUCCESS') {
            coverUrlResult = queryData.results && queryData.results[0] && queryData.results[0].url;
            isCoverDone = true;
            trySaveFinalQuickTrack();
          } else if (status === 'QUEUED' || status === 'RUNNING') {
            setTimeout(checkCoverStatus, 4000);
          } else {
            console.warn("Quick generate cover task failed on cloud:", queryData.errorMessage);
            isCoverDone = true;
            trySaveFinalQuickTrack();
          }
        } catch (coverErr) {
          console.warn("Quick generate cover query failed, skipping cover:", coverErr);
          isCoverDone = true;
          trySaveFinalQuickTrack();
        }
      };

      setTimeout(checkMusicStatus, 4000);
      if (coverTaskId) {
        setTimeout(checkCoverStatus, 4000);
      }

    } catch (err) {
      console.error("LLM or RunningHub quick generate failed, fallback to offline:", err);
      triggerQuickFallback();
    }
  };

  const handlePresetClick = (preset: PresetTag) => {
    setInputValue(`${preset.englishLabel} / ${preset.label}`);
  };

  return (
    <div className="relative w-full flex flex-col items-center">
      {/* Hero Header Area */}
      <section className="w-full max-w-4xl text-center mt-12 mb-16 select-none">
        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="font-sans text-4xl md:text-5xl font-extrabold text-white mb-6 tracking-[0.1em] md:tracking-[0.15em] leading-snug"
        >
          让情绪，有迹可循。
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ delay: 0.4, duration: 1 }}
          className="font-mono text-sm md:text-base text-gray-400 uppercase tracking-[0.25em]"
        >
          Capturing Moods in Sine Waves.
        </motion.p>
      </section>

      {/* Interactive Mood Input Field */}
      <section className="w-full max-w-3xl space-y-8 px-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="w-full relative"
        >
          {/* Mood Polish Header Controls */}
          <div className="flex justify-between items-center mb-2.5">
            <span className="text-[11px] font-mono uppercase text-slate-100 font-bold tracking-widest">
              情绪或故事描述 / MOOD STORY
            </span>
            <button
              id="btn-polish-mood"
              onClick={handlePolishMood}
              disabled={isPolishingMood || isQuickGenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono tracking-widest uppercase bg-[#101010]/95 border border-[#1a1a1a] hover:border-[#00ff9d]/30 hover:text-[#00ff9d] transition-all duration-300 cursor-pointer active:scale-95 disabled:opacity-30 disabled:pointer-events-none rounded-none"
              title="一键润色提示词 / Polish mood prompt"
            >
              <Sparkles size={11} className={isPolishingMood ? 'animate-spin text-[#00ff9d]' : 'text-gray-400'} />
              <span>{isPolishingMood ? '润色中...' : '一键润色 / POLISH'}</span>
            </button>
          </div>
          <textarea
            id="mood-text-input"
            disabled={isQuickGenerating}
            rows={4}
            className="block w-full py-4 px-5 bg-[#0a0a0a]/80 backdrop-blur-md border border-[#1a1a1a] focus:border-[#00ff9d] text-white font-mono text-xs md:text-sm focus:ring-1 focus:ring-[#00ff9d] focus:outline-none placeholder-slate-300 transition-all duration-300 rounded-none shadow-[0_0_15px_rgba(0,255,157,0)] focus:shadow-[0_0_20px_rgba(0,255,157,0.15)] disabled:opacity-50 resize-none overflow-y-auto"
            placeholder="输入你的情绪或一段故事... (按 Ctrl + Enter 提交创作) / Describe your current mood or a story..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleCreate();
              }
            }}
          />

          {/* Quick loading micro overlay inside input */}
          <AnimatePresence>
            {isQuickGenerating && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-[#050505]/90 backdrop-blur-sm flex items-center justify-center gap-3 border border-[#00ff9d]/30"
              >
                <RefreshCw className="animate-spin text-[#00ff9d]" size={16} />
                <span className="font-mono text-xs text-[#00ff9d] tracking-widest uppercase">
                  {loadingText} {quickProgress}%
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Preset Tags Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="flex flex-wrap gap-2.5 justify-center"
        >
          {PRESETS.map((p, idx) => (
            <button
              id={`preset-tag-${idx}`}
              key={p.label}
              disabled={isQuickGenerating}
              onClick={() => handlePresetClick(p)}
              className="px-4 py-2 text-[11px] font-mono text-slate-100 font-semibold bg-[#121212]/90 border border-[#222] hover:border-[#00ff9d] hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all duration-300 tracking-wider uppercase rounded-none select-none cursor-pointer hover:shadow-[0_0_10px_rgba(0,255,157,0.1)] active:scale-95"
            >
              {p.englishLabel} / {p.label}
            </button>
          ))}
        </motion.div>

        {/* Action Trigger Row */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
        >
          {/* 快速生成 / QUICK GENERATE BUTTON */}
          <button
            id="quick-generate-btn"
            disabled={isQuickGenerating}
            onClick={handleQuickGenerate}
            className="group relative w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-[#00ff9d]/10 to-[#00ff9d]/20 hover:from-[#00ff9d] hover:to-[#00ff9d] border border-[#00ff9d]/40 hover:border-transparent text-[#00ff9d] hover:text-black font-sans font-bold text-xs tracking-[0.3em] uppercase transition-all duration-300 rounded-none cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Zap size={14} className="group-hover:scale-110 transition-transform duration-300" />
            <span>快速生成 / QUICK GENERATE</span>
          </button>

          {/* 开启创作 / CREATE AND JUMP TO STUDIO */}
          <button
            id="start-creation-btn"
            disabled={isQuickGenerating}
            onClick={handleCreate}
            className="group relative w-full sm:w-auto px-10 py-4 bg-transparent border border-gray-600 hover:border-[#00ff9d] text-gray-300 hover:text-white font-sans font-bold text-xs tracking-[0.3em] uppercase transition-all duration-300 rounded-none cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span>开启创作 / CREATE</span>
            <ArrowRight
              size={14}
              className="group-hover:translate-x-1.5 transition-transform duration-300"
            />
          </button>
        </motion.div>
      </section>

      {/* Recommended Tracks Section */}
      <section className="w-full max-w-5xl mt-24 px-4 space-y-8">
        <div className="flex items-center justify-between border-b border-[#1a1a1a] pb-4">
          <h2 className="text-xs font-mono font-bold text-gray-400 tracking-[0.3em] uppercase">
            Recommended Tracks / 推荐歌曲
          </h2>
          <button
            id="view-all-tracks-btn"
            onClick={() => setScreen('treasury')}
            className="text-[11px] font-mono text-[#00ff9d] hover:text-white transition-colors uppercase tracking-widest cursor-pointer"
          >
            View All / 查看全部
          </button>
        </div>

        {/* Tracks Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {RECOMMENDED_TRACKS.map((track) => {
            const isCurrent = currentTrack && currentTrack.id === track.id;
            return (
              <div
                id={`rec-track-${track.id}`}
                key={track.id}
                onClick={() => handleTrackClick(track)}
                className="group cursor-pointer space-y-3"
              >
                {/* Vinyl cover container */}
                <div className="relative aspect-square bg-[#121212] border border-[#1a1a1a] overflow-hidden group-hover:border-[#00ff9d]/40 transition-all duration-300 shadow-md">
                  {/* SVG ambient graphics representing sound cover */}
                  <div className="absolute inset-0 bg-[#0d0d0d] flex items-center justify-center">
                    <div className="relative w-full h-full flex items-center justify-center opacity-70 group-hover:scale-105 transition-transform duration-500">
                      {/* Retro radial patterns */}
                      <div className="absolute w-[80%] h-[80%] rounded-full border border-dashed border-gray-800 animate-spin" style={{ animationDuration: '60s' }} />
                      <div className="absolute w-[60%] h-[60%] rounded-full border border-gray-900" />
                      <div className="absolute w-[40%] h-[40%] rounded-full border border-[#00ff9d]/10" />
                      
                      {/* Generative vinyl look */}
                      <Disc size={90} className="text-gray-900 group-hover:text-gray-800 transition-colors duration-300" />
                      <div className="absolute w-6 h-6 rounded-full bg-[#00ff9d]/20 border border-[#00ff9d]/50 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-black" />
                      </div>

                      {/* Sine wave decoration representing each track */}
                      <svg className="absolute w-3/4 h-12 opacity-30" viewBox="0 0 100 20">
                        <path
                          d={
                            track.bpm > 110
                              ? "M0,10 Q10,2 20,10 T40,10 T60,10 T80,10 T100,10"
                              : "M0,10 Q15,4 30,10 T60,10 T90,10"
                          }
                          fill="none"
                          stroke="#00ff9d"
                          strokeWidth="1.5"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* Hover Play Button */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/60 backdrop-blur-[2px]">
                    {isCurrent && isPlaying ? (
                      <Pause size={44} className="text-[#00ff9d] fill-[#00ff9d]/20 scale-90 group-hover:scale-100 transition-transform duration-300" />
                    ) : (
                      <Play size={44} className="text-[#00ff9d] fill-[#00ff9d]/20 scale-90 group-hover:scale-100 transition-transform duration-300" />
                    )}
                  </div>
                </div>

                {/* Text Info */}
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white tracking-wider truncate group-hover:text-[#00ff9d] transition-colors">
                    {track.title}
                  </h3>
                  <div className="flex justify-between items-center text-[10px] text-slate-100 font-semibold font-mono tracking-wider">
                    <span className="uppercase">{track.bpm} BPM</span>
                    <span>{track.duration}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* NEW SECTION: 最近生成 / Recently Generated */}
      <section className="w-full max-w-5xl mt-24 px-4 space-y-8 pb-12 border-t border-[#121212] pt-12">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <History size={16} className="text-[#00ff9d] animate-pulse" />
            <h2 className="text-xs font-mono font-bold text-white tracking-[0.3em] uppercase">
              Recently Generated / 最近生成
            </h2>
          </div>
          {savedTracks.length > 0 && (
            <button
              id="view-grid-studio-btn"
              onClick={() => setScreen('treasury')}
              className="text-[11px] font-mono text-slate-100 font-bold hover:text-[#00ff9d] transition-colors uppercase tracking-widest cursor-pointer bg-transparent border-none outline-none"
            >
              Arrange in Treasury / 编排专辑 ({savedTracks.length})
            </button>
          )}
        </div>

        {/* Generated Tracks list */}
        {savedTracks.length === 0 ? (
          <div className="py-12 text-center bg-[#080808] border border-dashed border-[#1a1a1a] p-8 select-none">
            <Sparkles size={24} className="text-gray-700 mx-auto mb-3" />
            <p className="text-xs font-mono text-gray-500 uppercase tracking-widest">
              No tracks generated yet. Use Quick Generate to create instant waves!
            </p>
            <p className="text-[11px] text-gray-600 mt-1">
              暂无生成历史，在上方输入框中写下你的故事，点击「快速生成」吧！
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {savedTracks.slice(0, 4).map((track) => {
              const isCurrent = currentTrack && currentTrack.id === track.id;
              return (
                <div
                  id={`recent-track-${track.id}`}
                  key={track.id}
                  onClick={() => handleTrackClick(track)}
                  className="group cursor-pointer space-y-3"
                >
                  {/* Visual vinyl container with emerald glow */}
                  <div className="relative aspect-square bg-[#0c0c0c] border border-[#00ff9d]/20 overflow-hidden group-hover:border-[#00ff9d]/70 transition-all duration-300 shadow-[0_0_15px_rgba(0,255,157,0.02)] group-hover:shadow-[0_0_20px_rgba(0,255,157,0.06)]">
                    <div className="absolute inset-0 bg-[#060606] flex items-center justify-center">
                      {track.coverUrl ? (
                        <img
                          src={track.coverUrl}
                          alt="Cover"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 select-none animate-fade-in"
                        />
                      ) : (
                        <div className="relative w-full h-full flex items-center justify-center opacity-85 group-hover:scale-105 transition-transform duration-500">
                          {/* Generative elements */}
                          <div className="absolute w-[84%] h-[84%] rounded-full border border-dashed border-gray-800/40 animate-spin" style={{ animationDuration: '45s' }} />
                          <div className="absolute w-[60%] h-[60%] rounded-full border border-gray-900" />
                          <div className="absolute w-[35%] h-[35%] rounded-full border border-[#00ff9d]/15" />

                          <Disc size={80} className="text-[#101010] group-hover:text-gray-900 transition-colors duration-300" />
                          
                          {/* Neon center */}
                          <div className="absolute w-5 h-5 rounded-full bg-[#00ff9d]/30 border border-[#00ff9d]/60 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-black" />
                          </div>

                          {/* Custom green wave path */}
                          <svg className="absolute w-4/5 h-16 opacity-45" viewBox="0 0 100 20">
                            <path
                              d="M0,10 Q10,1 25,12 T50,10 T75,8 T100,10"
                              fill="none"
                              stroke="#00ff9d"
                              strokeWidth="2"
                            />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* CUSTOM Tag on cover */}
                    <span className="absolute top-2.5 left-2.5 text-[8px] font-mono tracking-widest text-[#00ff9d] bg-[#00ff9d]/15 px-2 py-0.5 border border-[#00ff9d]/30">
                      CUSTOM
                    </span>

                    {track.audioUrl && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadTrack(track);
                        }}
                        className="absolute top-2.5 right-2.5 p-1 text-[#00ff9d] bg-black/60 border border-[#00ff9d]/30 hover:border-[#00ff9d] hover:bg-[#00ff9d]/20 transition-all z-10 flex items-center justify-center cursor-pointer"
                        title="Download MP3 & Lyrics / 下载歌曲与歌词"
                      >
                        <Download size={10} />
                      </button>
                    )}

                    {/* Quick hovering playback trigger */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/70 backdrop-blur-[1px]">
                      <div className="flex flex-col items-center gap-1">
                        {isCurrent && isPlaying ? (
                          <>
                            <Pause size={36} className="text-[#00ff9d] fill-[#00ff9d]/15 scale-95 group-hover:scale-100 transition-transform duration-200" />
                            <span className="text-[9px] font-mono text-[#00ff9d] tracking-widest uppercase">
                              PAUSE PLAY
                            </span>
                          </>
                        ) : (
                          <>
                            <Play size={36} className="text-[#00ff9d] fill-[#00ff9d]/15 scale-95 group-hover:scale-100 transition-transform duration-200" />
                            <span className="text-[9px] font-mono text-[#00ff9d] tracking-widest uppercase">
                              PLAY NOW
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Track details */}
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-white tracking-wider truncate group-hover:text-[#00ff9d] transition-colors uppercase">
                      {track.title}
                    </h3>
                    <div className="flex justify-between items-center text-[10px] text-slate-100 font-semibold font-mono tracking-wider">
                      <span className="uppercase text-[9px] text-[#00ff9d] font-bold">{track.bpm} BPM</span>
                      <span>{track.duration}</span>
                    </div>
                  </div>
                </div>
            );
          })}
          </div>
        )}
      </section>

      {/* Global Floating Player Bar inside Home Page */}
      <AnimatePresence>
        {currentTrack && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] md:w-full md:max-w-2xl bg-[#080808]/95 backdrop-blur-md border border-[#00ff9d]/30 px-4 py-3 md:px-6 md:py-4 flex flex-col sm:flex-row items-center justify-between shadow-[0_0_30px_rgba(0,255,157,0.12)] gap-3 sm:gap-0 rounded-none"
          >
            {/* Album Art & Title */}
            <div className="flex items-center gap-4 w-full sm:w-auto sm:max-w-[40%] flex-shrink-0">
              <div className="relative w-10 h-10 bg-black flex items-center justify-center border border-gray-800 overflow-hidden flex-shrink-0">
                {currentTrack.coverUrl ? (
                  <img
                    src={currentTrack.coverUrl}
                    alt="Cover"
                    className="w-full h-full object-cover select-none"
                  />
                ) : (
                  <>
                    <Disc size={20} className={`text-gray-600 ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }} />
                    <div className="absolute w-1.5 h-1.5 rounded-full bg-[#00ff9d]" />
                  </>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-white tracking-wider truncate uppercase">
                    {currentTrack.title}
                  </h4>
                  <span className={`text-[7px] font-mono px-1 py-0.5 border tracking-wider scale-90 origin-left ${
                    currentTrack.audioUrl 
                      ? 'text-[#00ff9d] border-[#00ff9d]/30 bg-[#00ff9d]/10' 
                      : 'text-gray-500 border-gray-800 bg-gray-900/40'
                  }`}>
                    {currentTrack.audioUrl ? 'HD' : 'SYNTH'}
                  </span>
                </div>
                <p className="text-[9px] font-mono text-slate-100 font-bold truncate mt-0.5 uppercase">
                  {currentTrack.style}
                </p>
              </div>
            </div>

            {/* Controls and Timeline */}
            <div className="flex flex-col items-center gap-2 flex-1 w-full sm:w-auto px-0 sm:px-8">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-2 bg-transparent text-[#00ff9d] border border-[#00ff9d]/20 hover:border-[#00ff9d] hover:bg-[#00ff9d]/10 transition-all cursor-pointer rounded-none active:scale-95"
                >
                  {isPlaying ? <Pause size={14} className="fill-[#00ff9d]/20" /> : <Play size={14} className="fill-[#00ff9d]/20" />}
                </button>

                {currentTrack.audioUrl && (
                  <button
                    onClick={() => handleDownloadTrack(currentTrack)}
                    className="p-2 bg-transparent text-[#00ff9d] border border-[#00ff9d]/20 hover:border-[#00ff9d] hover:bg-[#00ff9d]/10 transition-all cursor-pointer rounded-none active:scale-95 flex items-center justify-center"
                    title="Download MP3 & Lyrics / 下载歌曲与歌词"
                  >
                    <Download size={14} />
                  </button>
                )}
              </div>

              {/* Progress Line */}
              <div className="w-full flex items-center gap-2 text-[9px] font-mono text-slate-100 font-bold">
                <span>{formatTime(currentTime)}</span>
                <div
                  id="home-player-progress-bar"
                  onClick={(e) => {
                    if (!currentTrack || totalTime <= 0) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
                    const targetTime = Math.floor(percentage * totalTime);
                    
                    if (currentTrack.audioUrl && audioRef.current) {
                      audioRef.current.currentTime = targetTime;
                    }
                    setCurrentTime(targetTime);
                  }}
                  className="relative flex-1 h-3 flex items-center cursor-pointer group select-none"
                  title="Jump to timeline position / 点击跳转播放位置"
                >
                  <div className="w-full h-[2px] bg-[#1a1a1a] relative">
                    <div
                      className="absolute left-0 top-0 h-full bg-[#00ff9d]"
                      style={{ width: `${(currentTime / totalTime) * 100}%` }}
                    />
                    {/* Hover indicator node */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#00ff9d] opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ left: `calc(${(currentTime / totalTime) * 100}% - 3px)` }}
                    />
                  </div>
                </div>
                <span>{formatTime(totalTime)}</span>
              </div>
            </div>

            {/* Right Side: Micro Spectrum Visualizer */}
            <div className="hidden sm:flex items-end gap-[2px] h-6 w-12 flex-shrink-0">
              {Array.from({ length: 8 }).map((_, idx) => (
                <motion.div
                  key={idx}
                  animate={isPlaying ? { height: [4, Math.random() * 20 + 4, 4] } : { height: 4 }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: idx * 0.1 }}
                  className="w-[3px] bg-[#00ff9d]/75"
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
