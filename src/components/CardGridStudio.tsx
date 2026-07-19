import React, { useState, useEffect, useRef } from 'react';
import { Track } from '../types';
import { LIBRARY_TRACKS } from '../data';
import { AudioSynth } from '../utils/audioSynth';
import { 
  SlidersHorizontal, Grid, List, Plus, Trash2, CheckCircle, Disc, Library, 
  Layers, ExternalLink, RefreshCw, Play, Pause, Music, Sparkles, Settings2, Info, ChevronRight,
  Upload, Image, Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CardGridStudioProps {
  customTracks: Track[];
}

const sanitizeAudioUrl = (url: string | undefined): string => {
  if (!url) return '';
  if (url.includes('/output_music/')) {
    const parts = url.split('/output_music/');
    return '/output_music/' + parts[parts.length - 1];
  }
  return url;
};

export const CardGridStudio: React.FC<CardGridStudioProps> = ({ customTracks }) => {
  const synthRef = useRef<AudioSynth | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const albumCoverInputRef = useRef<HTMLInputElement | null>(null);

  // Navigation tabs for separating Track Library and Album Editor
  const [activeTab, setActiveTab] = useState<'library' | 'album'>('library');

  // Cover Art States
  const [trackCovers, setTrackCovers] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem('sanzo_track_covers');
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      console.error('Failed to load track covers', e);
      return {};
    }
  });

  // Synchronize trackCovers to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem('sanzo_track_covers', JSON.stringify(trackCovers));
    } catch (e: any) {
      console.warn('Persisting trackCovers failed (probably quota exceeded):', e);
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        const cleanCovers: Record<string, string> = {};
        for (const [id, urlVal] of Object.entries(trackCovers)) {
          const url = urlVal as string;
          if (!url.startsWith('data:')) {
            cleanCovers[id] = url;
          }
        }
        try {
          localStorage.setItem('sanzo_track_covers', JSON.stringify(cleanCovers));
          console.log('Successfully saved filtered covers (excluded large base64 uploads).');
        } catch (innerErr) {
          console.error('Even filtered covers failed to persist', innerErr);
        }
      }
    }
  }, [trackCovers]);
  const [coverPrompts, setCoverPrompts] = useState<Record<string, string>>({});
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [coverGenStep, setCoverGenStep] = useState('');
  const [dragOverActive, setDragOverActive] = useState(false);

  // Cover upload handler
  const handleCoverUpload = (file: File) => {
    if (!selectedTrack) return;
    if (!file.type.startsWith('image/')) {
      alert('请上传图片文件 / Please upload an image file!');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setTrackCovers(prev => ({
          ...prev,
          [selectedTrack.id]: result
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleCoverUpload(e.dataTransfer.files[0]);
    }
  };

  // AI Cover Generation Prompt generator
  const handleAIGenerateCover = async () => {
    if (!selectedTrack || isGeneratingCover) return;
    setIsGeneratingCover(true);
    setCoverGenStep('连接至云端 AI 画室... / Booting cover generator...');

    try {
      const response = await fetch('/api/runninghub/generate-cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lyrics: selectedTrack.lyrics || '',
          style: selectedTrack.style
        })
      });

      if (!response.ok) throw new Error('API server returned error on cover generate');
      const data = await response.json();
      const taskId = data.taskId;

      if (!taskId) throw new Error('No taskId found for cover generate');

      let queryCount = 0;
      const checkStatus = async () => {
        try {
          const queryRes = await fetch('/api/runninghub/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId })
          });

          if (!queryRes.ok) throw new Error('Query cover status failed');
          const queryData = await queryRes.json();
          const status = queryData.status;

          if (status === 'SUCCESS') {
            const coverUrl = queryData.results && queryData.results[0] && queryData.results[0].url;
            if (!coverUrl) throw new Error('SUCCESS but empty cover URL');

            setTrackCovers(prev => ({
              ...prev,
              [selectedTrack.id]: coverUrl
            }));

            // Sync property directly to customized object
            selectedTrack.coverUrl = coverUrl;

            setIsGeneratingCover(false);
            setCoverGenStep('');
          } else if (status === 'QUEUED') {
            setCoverGenStep('在云端排队中... / Queuing in cloud...');
            setTimeout(checkStatus, 4000);
          } else if (status === 'RUNNING') {
            queryCount++;
            const steps = [
              '正在深度解析歌词与声音意向... / Analyzing lyrics...',
              '正在构建视觉骨架与排版布景... / Drafting composition...',
              '正在渲染微光与色彩通道... / Synthesizing color channels...',
              '正在打包发布版高保真专辑封面... / Finalizing Release wrapper...'
            ];
            setCoverGenStep(steps[Math.min(steps.length - 1, queryCount)] || '正在渲染高解析封面...');
            setTimeout(checkStatus, 4000);
          } else {
            throw new Error(queryData.errorMessage || 'Cover generation failed on cloud');
          }
        } catch (queryErr) {
          console.warn("Query cover status failed, running local mock fallback:", queryErr);
          triggerMockCoverFallback();
        }
      };

      setTimeout(checkStatus, 4000);
    } catch (err) {
      console.warn("Submit cover generate failed, using local mock:", err);
      triggerMockCoverFallback();
    }
  };

  const triggerMockCoverFallback = () => {
    const title = selectedTrack?.title || 'WAVE';
    const seedValue = Date.now() + '-' + Math.floor(Math.random() * 10000);
    const generatedUrl = `https://picsum.photos/seed/${encodeURIComponent(title + '-' + seedValue)}/500/500`;
    
    if (selectedTrack) {
      setTrackCovers(prev => ({
        ...prev,
        [selectedTrack.id]: generatedUrl
      }));
      selectedTrack.coverUrl = generatedUrl;
    }
    setIsGeneratingCover(false);
    setCoverGenStep('');
  };

  // Combine pre-installed library tracks and newly generated user tracks
  const [library, setLibrary] = useState<Track[]>([]);
  const [slots, setSlots] = useState<Array<Track | null>>([null, null, null, null, null]);
  const [albumName, setAlbumName] = useState('PROJECT: OBSIDIAN');
  const [filterStyle, setFilterStyle] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Selected track for detail view in library tab
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);

  // Simulated playback state for the detailed track card
  const [isPlaying, setIsPlaying] = useState(false);
  const [playProgress, setPlayProgress] = useState(35);

  // Album Editor specific state
  const [isEditingAlbum, setIsEditingAlbum] = useState(false);

  // Compilation States
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileProgress, setCompileProgress] = useState(0);
  const [isCompiled, setIsCompiled] = useState(false);
  const [compileStepText, setCompileStepText] = useState('Initializing master build...');

  // Compiled Album Interface & States
  interface CompiledAlbum {
    id: string;
    name: string;
    cover: string;
    tracks: Track[];
    duration: string;
    timestamp: string;
  }

  const [albumCover, setAlbumCover] = useState<string>('');
  const [isGeneratingAlbumCover, setIsGeneratingAlbumCover] = useState(false);
  const [albumCoverGenStep, setAlbumCoverGenStep] = useState('');
  const [albumCoverPrompt, setAlbumCoverPrompt] = useState('');

  // States for viewing compiled master albums
  const [viewingAlbum, setViewingAlbum] = useState<CompiledAlbum | null>(null);
  const [viewingAlbumSelectedTrack, setViewingAlbumSelectedTrack] = useState<Track | null>(null);

  useEffect(() => {
    if (viewingAlbum && viewingAlbum.tracks.length > 0) {
      setViewingAlbumSelectedTrack(viewingAlbum.tracks[0]);
    } else {
      setViewingAlbumSelectedTrack(null);
    }
  }, [viewingAlbum]);
  
  const [compiledAlbums, setCompiledAlbums] = useState<CompiledAlbum[]>(() => {
    try {
      const stored = localStorage.getItem('sanzo_compiled_albums');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load compiled albums', e);
    }
    return [
      {
        id: 'ALB-001',
        name: 'PROJECT: OBSIDIAN (DEMO MASTER)',
        cover: 'https://picsum.photos/seed/obsidian-demo/500/500',
        tracks: LIBRARY_TRACKS.slice(0, 3),
        duration: '11:15',
        timestamp: '2026-07-04 18:24'
      }
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem('sanzo_compiled_albums', JSON.stringify(compiledAlbums));
    } catch (e: any) {
      console.warn('Persisting compiledAlbums failed:', e);
    }
  }, [compiledAlbums]);

  const handleAlbumCoverUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('请上传图片文件 / Please upload an image file!');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setAlbumCover(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAIGenerateAlbumCover = () => {
    if (isGeneratingAlbumCover) return;
    setIsGeneratingAlbumCover(true);

    const activeTracks = slots.filter((s): s is Track => s !== null);
    const stylesString = activeTracks.map(t => t.style.toLowerCase()).join(', ');
    const title = albumName;

    let prompt = "";
    if (stylesString.includes("synth") || stylesString.includes("cyber") || stylesString.includes("wave")) {
      prompt = `High-tech cyberpunk concept album art of "${title}". Intricate geometric audio circuitry layout, neon green spectrum graphs, glowing fiber optics grid, dark techno industrial background, hyper-detailed futuristic illustration.`;
    } else if (stylesString.includes("ambient") || stylesString.includes("zen") || stylesString.includes("chill")) {
      prompt = `Organic minimalistic conceptual music album cover named "${title}". Golden sound ripples on wet black obsidian rock, delicate ripples, mist and atmospheric fog, elegant Japanese aesthetic, peaceful premium artwork.`;
    } else if (stylesString.includes("lofi") || stylesString.includes("jazz") || stylesString.includes("piano")) {
      prompt = `Nostalgic beautiful warm vintage vinyl cover design for "${title}". A soft grainy photograph of late afternoon sun hitting an old tape recorder, dust particles dancing in warm rays, pastel cinematic layout, comforting retro vibe.`;
    } else {
      prompt = `Avant-garde experimental abstract sound art album cover of "${title}". Deep conceptual layers, soundwaves transforming into mountain silhouettes, premium metallic textures, clean geometric framing, ultra-modern luxury aesthetic.`;
    }

    setAlbumCoverPrompt(prompt);

    const steps = [
      'Booting conceptual generator... / 正在解析专辑概念...',
      'Analyzing composite tracks mood... / 正在融合曲目声学情感特征...',
      'Synthesizing abstract geometry... / 正在绘制抽象几何声纹骨架...',
      'Applying high-contrast lighting map... / 正在附加高对比度光强层...',
      'Polishing digital release wrapper... / 正在打包发布版高保真唱片封面...'
    ];

    let stepIdx = 0;
    setAlbumCoverGenStep(steps[0]);

    const stepInterval = setInterval(() => {
      stepIdx++;
      if (stepIdx < steps.length) {
        setAlbumCoverGenStep(steps[stepIdx]);
      } else {
        clearInterval(stepInterval);
        
        const seedValue = Date.now() + '-' + Math.floor(Math.random() * 10000);
        const generatedUrl = `https://picsum.photos/seed/${encodeURIComponent(title + '-' + seedValue)}/500/500`;
        
        setAlbumCover(generatedUrl);
        setIsGeneratingAlbumCover(false);
        setAlbumCoverGenStep('');
      }
    }, 500);
  };

  useEffect(() => {
    // Deduplicate customTracks and default library tracks
    const combined = [...customTracks, ...LIBRARY_TRACKS];
    const unique = combined.filter((v, i, a) => a.findIndex((t) => t.id === v.id) === i);
    setLibrary(unique);
    
    // Auto-select first track as default
    if (unique.length > 0 && !selectedTrack) {
      setSelectedTrack(unique[0]);
    }
  }, [customTracks]);

  // Simulated playback progress (Only for fallback simulated tracks)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && (!selectedTrack || !selectedTrack.audioUrl)) {
      interval = setInterval(() => {
        setPlayProgress((prev) => {
          if (prev >= 100) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, selectedTrack, selectedTrack?.audioUrl]);

  // Real MP3 audio player trigger & progress binding with cleanup
  useEffect(() => {
    let activeAudio: HTMLAudioElement | null = null;

    const handleTimeUpdate = () => {
      if (activeAudio) {
        const dur = activeAudio.duration || 120;
        setPlayProgress(Math.floor((activeAudio.currentTime / dur) * 100));
      }
    };

    if (isPlaying && selectedTrack && selectedTrack.audioUrl) {
      if (!audioRef.current) {
        audioRef.current = new Audio(sanitizeAudioUrl(selectedTrack.audioUrl));
        audioRef.current.loop = true;
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
  }, [isPlaying, selectedTrack, selectedTrack?.audioUrl]);

  // Synthesizer playback hook (Only when selectedTrack has no audioUrl)
  useEffect(() => {
    if (isPlaying && selectedTrack && !selectedTrack.audioUrl) {
      if (!synthRef.current) {
        synthRef.current = new AudioSynth(
          selectedTrack.style,
          selectedTrack.bpm,
          selectedTrack.chords
        );
      }
      synthRef.current.play();
    } else {
      if (synthRef.current) {
        synthRef.current.stop();
        synthRef.current = null;
      }
    }
  }, [isPlaying, selectedTrack, selectedTrack?.audioUrl]);

  // Stop player when switching selected track
  useEffect(() => {
    setIsPlaying(false);
    if (synthRef.current) {
      synthRef.current.stop();
      synthRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [selectedTrack]);

  // Clean up all playbacks on unmount
  useEffect(() => {
    return () => {
      if (synthRef.current) {
        synthRef.current.stop();
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Handle adding track to first empty slot in Album
  const handleAddTrack = (track: Track) => {
    const isAlreadyAdded = slots.some((s) => s && s.id === track.id);
    if (isAlreadyAdded) return;

    const emptyIdx = slots.indexOf(null);
    if (emptyIdx !== -1) {
      const updated = [...slots];
      updated[emptyIdx] = track;
      setSlots(updated);
    }
  };

  // Remove track from slot
  const handleRemoveTrack = (index: number) => {
    const updated = [...slots];
    updated[index] = null;
    setSlots(updated);
  };

  // List of unique styles in library for filters
  const uniqueStyles = ['All', ...Array.from(new Set(library.map((t) => t.style.split(',')[0].trim())))];

  // Filter track library
  const filteredLibrary = library.filter((track) => {
    if (filterStyle === 'All') return true;
    return track.style.toLowerCase().includes(filterStyle.toLowerCase());
  });

  // Calculate stats
  const activeSlotsCount = slots.filter(Boolean).length;
  
  // Calculate total duration in MM:SS
  const calculateTotalTime = () => {
    let totalSecs = 0;
    slots.forEach((s) => {
      if (s) {
        const parts = s.duration.split(':');
        totalSecs += Number(parts[0]) * 60 + Number(parts[1]);
      }
    });
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleCompile = () => {
    if (activeSlotsCount === 0) return;
    setIsCompiling(true);
    setCompileProgress(0);
    setIsCompiled(false);

    const steps = [
      'Scanning audio frames... / 正在扫描音频波形帧...',
      'Mapping DSP structures... / 正在绘制DSP数字信号链...',
      'Synthesizing stem harmonics... / 正在合成声轨谐波分量...',
      'Rendering spectral coefficients... / 正在渲染频域混响...',
      'Encoding lossless FLAC release... / 正在编码无损音轨归档...',
      'Finalizing meta headers... / 正在写入发布元数据信息...'
    ];

    let stepIdx = 0;
    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += 5;
      setCompileProgress(currentProgress);

      // Randomly update text step
      if (currentProgress % 20 === 0 && stepIdx < steps.length) {
        setCompileStepText(steps[stepIdx++]);
      }

      if (currentProgress >= 100) {
        clearInterval(interval);
        setIsCompiling(false);
        setIsCompiled(true);

        // Append to compiledAlbums state
        const newAlbum: CompiledAlbum = {
          id: `ALB-${Date.now()}`,
          name: albumName,
          cover: albumCover || `https://picsum.photos/seed/${encodeURIComponent(albumName + '-' + Math.floor(Math.random() * 1000))}/500/500`,
          tracks: slots.filter((s): s is Track => s !== null),
          duration: calculateTotalTime(),
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
        };
        setCompiledAlbums(prevList => [newAlbum, ...prevList]);
      }
    }, 150);
  };

  // Helper function to download all tracks (if HD audio URLs exist) and a text lyric booklet
  const handleDownloadAlbum = (album: CompiledAlbum) => {
    let text = `==================================================\n`;
    text += `   SANZO MUSIC - CONCEPT MASTER EP RELEASE\n`;
    text += `==================================================\n\n`;
    text += `ALBUM TITLE: ${album.name}\n`;
    text += `CATALOG NUMBER: ${album.id}\n`;
    text += `RELEASE DATE: ${album.timestamp}\n`;
    text += `TOTAL DURATION: ${album.duration}\n`;
    text += `TRACKS COUNT: ${album.tracks.length}\n\n`;
    text += `--------------------------------------------------\n`;
    text += `                  曲目制作内页 / LINER NOTES\n`;
    text += `--------------------------------------------------\n\n`;

    album.tracks.forEach((track, index) => {
      text += `[0${index + 1}] TITLE: ${track.title}\n`;
      text += `      STYLE: ${track.style}\n`;
      text += `      BPM: ${track.bpm} | TIME SIG: ${track.timeSig || '4/4'}\n`;
      text += `      CHORDS: ${track.chords || 'Auto'}\n`;
      text += `      VOICE SPEC: ${track.voice || 'FEMALE'}\n`;
      if (track.audioUrl) {
        text += `      HD AUDIO STREAM: ${track.audioUrl}\n`;
      }
      text += `\n--- 歌词 / LYRICS ---\n\n`;
      text += track.lyrics ? track.lyrics : `(Pure Instrumentals / 无歌词人声哼唱)\n`;
      text += `\n==================================================\n\n`;
    });

    const element = document.createElement("a");
    const file = new Blob([text], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `${album.name.replace(/[^a-z0-9]/gi, '_')}_Master_LinerNotes.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    // Trigger MP3 file downloads for any HD audio urls in tracks
    album.tracks.forEach((track) => {
      if (track.audioUrl) {
        const audioLink = document.createElement("a");
        audioLink.href = sanitizeAudioUrl(track.audioUrl);
        audioLink.target = "_blank";
        audioLink.download = `${track.title.replace(/[^a-z0-9]/gi, '_')}.mp3`;
        document.body.appendChild(audioLink);
        audioLink.click();
        document.body.removeChild(audioLink);
      }
    });
  };

  // Helper function to download a single track (MP3) and its lyric sheet (TXT)
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

  return (
    <div className="relative w-full max-w-6xl mx-auto px-4 mt-4 pb-16">
      
      {/* High-Tech Tab Bar with Glowing Underlines */}
      <div className="flex items-center justify-center gap-6 border-b border-[#121212] mb-8 pb-3">
        <button
          id="tab-select-library"
          onClick={() => setActiveTab('library')}
          className={`relative py-2 px-4 font-sans text-xs md:text-sm tracking-[0.2em] font-bold uppercase transition-all duration-300 cursor-pointer ${
            activeTab === 'library'
              ? 'text-[#00ff9d] drop-shadow-[0_0_8px_rgba(0,255,157,0.4)]'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <span>音乐珍藏库 / TRACK LIBRARY</span>
          {activeTab === 'library' && (
            <motion.div
              layoutId="activeTabUnderline"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00ff9d]"
            />
          )}
        </button>

        <button
          id="tab-select-album"
          onClick={() => setActiveTab('album')}
          className={`relative py-2 px-4 font-sans text-xs md:text-sm tracking-[0.2em] font-bold uppercase transition-all duration-300 cursor-pointer ${
            activeTab === 'album'
              ? 'text-[#00ff9d] drop-shadow-[0_0_8px_rgba(0,255,157,0.4)]'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <span>概念专辑制作 / ALBUM COMPILER</span>
          {activeTab === 'album' && (
            <motion.div
              layoutId="activeTabUnderline"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00ff9d]"
            />
          )}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {/* VIEW 1: Track Library View with Side Detail Panel */}
        {activeTab === 'library' && (
          <motion.div
            key="library-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
          >
            {/* Left Side: Track list / Grid */}
            <div className="lg:col-span-7 bg-[#0b0b0b]/90 border border-[#141414] p-6 space-y-5 shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
              {/* Header Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#141414] pb-4 gap-4">
                <div>
                  <h2 className="text-sm font-extrabold text-white tracking-widest uppercase">歌曲归档列表 / TRACK ARCHIVES</h2>
                  <p className="text-[10px] text-gray-500 font-mono tracking-wider mt-1">
                    Inspecting saved audio waves & generated masterpieces
                  </p>
                </div>

                {/* Filter and View Toggles */}
                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <div className="flex items-center gap-1.5 bg-[#101010] px-2.5 py-1.5 border border-[#1a1a1a]">
                    <SlidersHorizontal size={11} className="text-[#00ff9d]" />
                    <select
                      id="library-filter-style"
                      value={filterStyle}
                      onChange={(e) => setFilterStyle(e.target.value)}
                      className="bg-transparent text-[10px] font-mono text-gray-300 focus:outline-none cursor-pointer uppercase tracking-wider"
                    >
                      {uniqueStyles.map((s) => (
                        <option key={s} value={s} className="bg-[#121212] text-gray-200">
                          {s === 'All' ? '全部风格 / ALL' : s}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Grid / List view selectors */}
                  <div className="flex items-center border border-[#1a1a1a] bg-[#101010]">
                    <button
                      id="btn-switch-grid"
                      onClick={() => setViewMode('grid')}
                      className={`p-1.5 transition-colors cursor-pointer ${viewMode === 'grid' ? 'text-[#00ff9d] bg-[#161616]' : 'text-gray-500 hover:text-white'}`}
                      title="Grid View / 网格视图"
                    >
                      <Grid size={12} />
                    </button>
                    <button
                      id="btn-switch-list"
                      onClick={() => setViewMode('list')}
                      className={`p-1.5 transition-colors cursor-pointer ${viewMode === 'list' ? 'text-[#00ff9d] bg-[#161616]' : 'text-gray-500 hover:text-white'}`}
                      title="List View / 列表视图"
                    >
                      <List size={12} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Tracks Listing */}
              {filteredLibrary.length === 0 ? (
                <div className="py-20 text-center text-gray-500 font-mono text-xs border border-dashed border-[#1a1a1a] select-none">
                  <Library size={32} className="mx-auto text-gray-800 mb-3 animate-pulse" />
                  暂无匹配歌曲记录 / NO AUDIO RECORD FOUND
                </div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {filteredLibrary.map((track) => {
                    const isCurrent = selectedTrack && selectedTrack.id === track.id;
                    return (
                      <div
                        id={`track-card-${track.id}`}
                        key={track.id}
                        onClick={() => {
                          setSelectedTrack(track);
                          setIsPlaying(false);
                          setPlayProgress(0);
                        }}
                        className={`group relative bg-[#101010]/60 border p-4.5 space-y-3 transition-all duration-300 select-none cursor-pointer ${
                          isCurrent
                            ? 'border-[#00ff9d] shadow-[0_0_15px_rgba(0,255,157,0.1)]'
                            : 'border-[#141414] hover:border-[#00ff9d]/40'
                        }`}
                      >
                        {/* Vinyl outline cover */}
                        <div className="relative aspect-square bg-[#080808] flex items-center justify-center border border-[#1a1a1a] overflow-hidden">
                          {track.coverUrl || trackCovers[track.id] ? (
                            <img 
                              src={track.coverUrl || trackCovers[track.id]} 
                              alt={`${track.title} Cover`}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <>
                              <Disc size={60} className={`text-gray-900 group-hover:text-gray-800 transition-colors duration-300 ${isCurrent && isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }} />
                              <div className="absolute w-4 h-4 rounded-full bg-[#121212] border border-[#222] flex items-center justify-center">
                                <div className="w-1.5 h-1.5 rounded-full bg-black" />
                              </div>
                            </>
                          )}

                          {track.isCustom && (
                            <span className="absolute top-2 right-2 text-[7px] font-mono tracking-wider text-[#00ff9d] bg-[#00ff9d]/15 px-1.5 py-0.5 border border-[#00ff9d]/20">
                              CUSTOM
                            </span>
                          )}
                        </div>

                        {/* Text fields */}
                        <div className="space-y-1">
                          <h4 className="text-xs font-bold text-white truncate tracking-wider">
                            {track.title}
                          </h4>
                          <p className="text-[9px] font-mono text-gray-500 tracking-wider truncate uppercase">
                            {track.style}
                          </p>
                          <div className="flex justify-between items-center text-[9px] font-mono text-gray-600 pt-1.5 border-t border-[#161616]">
                            <span>{track.bpm} BPM</span>
                            <span>{track.duration}</span>
                          </div>
                        </div>

                        {/* Floating click prompt on hover */}
                        <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight size={12} className="text-[#00ff9d]" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredLibrary.map((track) => {
                    const isCurrent = selectedTrack && selectedTrack.id === track.id;
                    return (
                      <div
                        id={`track-list-item-${track.id}`}
                        key={track.id}
                        onClick={() => {
                          setSelectedTrack(track);
                          setIsPlaying(false);
                          setPlayProgress(0);
                        }}
                        className={`flex items-center justify-between p-3 bg-[#101010]/60 border select-none cursor-pointer transition-all duration-300 ${
                          isCurrent
                            ? 'border-[#00ff9d] bg-[#121212] shadow-[0_0_12px_rgba(0,255,157,0.06)]'
                            : 'border-[#141414] hover:border-[#00ff9d]/40'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {trackCovers[track.id] ? (
                            <img 
                              src={trackCovers[track.id]} 
                              alt={`${track.title} Cover`}
                              className="w-5 h-5 object-cover border border-[#222]"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <Disc size={20} className={`${isCurrent && isPlaying ? 'text-[#00ff9d] animate-spin' : 'text-gray-600'}`} style={{ animationDuration: '4s' }} />
                          )}
                          <div>
                            <h4 className="text-xs font-bold text-white tracking-wider truncate max-w-[150px]">{track.title}</h4>
                            <p className="text-[9px] font-mono text-gray-500 uppercase truncate max-w-[180px]">{track.style}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 font-mono text-[9px] text-gray-500">
                          <span className="hidden sm:inline">{track.bpm} BPM</span>
                          <span>{track.duration}</span>
                          <span className="text-[#00ff9d]/70 text-[8px] border border-[#00ff9d]/20 px-1 py-0.5">DETAIL / 详情</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Side: Track Detail Panel */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-[#0b0b0b]/95 border border-[#141414] p-6 shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[#141414] pb-4.5 mb-5">
                  <div className="flex items-center gap-2">
                    <Music size={13} className="text-[#00ff9d] animate-pulse" />
                    <h3 className="text-xs font-mono font-bold text-white tracking-[0.2em] uppercase">
                      歌曲规格详情 / TRACK DETAILS
                    </h3>
                  </div>
                  <Sparkles size={12} className="text-gray-600" />
                </div>

                {selectedTrack ? (
                  <div className="space-y-6">
                    {/* Cover Art Visualizer & Drag/Drop Zone */}
                    <div 
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`relative aspect-[4/3] bg-gradient-to-br from-[#0c0c0c] to-[#040404] border transition-all duration-300 flex items-center justify-center overflow-hidden ${
                        dragOverActive 
                          ? 'border-[#00ff9d] shadow-[0_0_20px_rgba(0,255,157,0.2)] bg-[#0c0c0c]/90' 
                          : 'border-[#161616]'
                      }`}
                    >
                      {/* Drag & Drop Overlay */}
                      {dragOverActive && (
                        <div className="absolute inset-0 bg-[#00ff9d]/10 backdrop-blur-xs flex flex-col items-center justify-center z-30 pointer-events-none">
                          <Upload className="text-[#00ff9d] animate-bounce mb-2" size={24} />
                          <span className="text-[10px] font-mono text-[#00ff9d] uppercase tracking-widest font-bold">
                            Drop Image to Upload / 拖拽图片以上传封面
                          </span>
                        </div>
                      )}

                      {/* Cover Generation Loading state */}
                      {isGeneratingCover && (
                        <div className="absolute inset-0 bg-black/90 backdrop-blur-xs flex flex-col items-center justify-center z-30 p-4 text-center space-y-3">
                          <div className="relative w-20 h-20 flex items-center justify-center">
                            <div className="absolute inset-0 border-2 border-dashed border-[#00ff9d] rounded-full animate-spin" />
                            <Sparkles className="text-[#00ff9d] animate-pulse" size={32} />
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] font-mono text-[#00ff9d] uppercase tracking-widest block animate-pulse font-bold">
                              AI Cover Drawing / 正在绘制AI封面...
                            </span>
                            <span className="text-[9px] font-mono text-gray-400 block max-w-xs truncate">
                              {coverGenStep}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Bouncing background audio bars representing simulated playback */}
                      <div className="absolute bottom-2 left-4 right-4 flex items-end justify-between h-8 opacity-25">
                        {Array.from({ length: 30 }).map((_, i) => (
                          <div
                            key={i}
                            className="w-1 bg-[#00ff9d] rounded-t-sm"
                            style={{
                              height: isPlaying ? `${Math.floor(Math.random() * 85) + 15}%` : '15%',
                              transition: 'height 0.15s ease-in-out'
                            }}
                          />
                        ))}
                      </div>

                      {/* Interactive disc & cover sleeve combo */}
                      <div className="relative w-56 h-56 flex items-center justify-center z-10">
                        {/* Vinyl Record that slides out / spins behind the cover sleeve */}
                        <div 
                          className={`absolute w-52 h-52 rounded-full border border-gray-900 bg-black flex items-center justify-center transition-all duration-500 ${
                            selectedTrack.coverUrl || trackCovers[selectedTrack.id] 
                              ? 'left-12 z-10' 
                              : 'left-2 z-10'
                          } ${isPlaying ? 'animate-spin' : ''}`}
                          style={{ animationDuration: '4s' }}
                        >
                          <div className="absolute inset-1 rounded-full border border-dashed border-[#00ff9d]/10" />
                          <Disc size={100} className="text-gray-800" />
                          <div className="absolute w-6 h-6 rounded-full bg-[#121212] border border-[#222] flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-[#00ff9d]" />
                          </div>
                        </div>

                        {/* Front Cover Card (Sleeve) */}
                        <div className="relative w-48 h-48 bg-[#121212] border border-[#222] z-20 shadow-xl overflow-hidden flex items-center justify-center transition-colors">
                          {selectedTrack.coverUrl || trackCovers[selectedTrack.id] ? (
                            <img 
                              src={selectedTrack.coverUrl || trackCovers[selectedTrack.id]} 
                              alt={`${selectedTrack.title} Cover`} 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center p-2 text-center text-gray-600">
                              <Image size={36} className="text-gray-700 mb-1.5" />
                              <span className="text-[8px] font-mono tracking-widest uppercase">NO COVER</span>
                            </div>
                          )}

                          {/* Corner label for premium visual layout */}
                          <div className="absolute top-1.5 left-1.5 px-2 py-0.5 bg-black/80 border border-[#222] text-[8px] font-mono text-gray-500">
                            OBSIDIAN
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Dedicated Track Meta Card below the visualizer container */}
                    <div className="bg-[#101010]/80 border border-[#1a1a1a] p-4.5 space-y-2 select-none">
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] font-mono tracking-widest text-[#00ff9d] bg-[#00ff9d]/10 px-2 py-0.5 border border-[#00ff9d]/30 uppercase block w-fit">
                          {selectedTrack.isCustom ? 'User Track / 用户生成' : 'Preloaded Wave / 预存歌曲'}
                        </span>
                        <span className="text-[9px] font-mono text-gray-500 uppercase tracking-wider font-bold">
                          {selectedTrack.bpm} BPM
                        </span>
                      </div>
                      <h4 className="text-sm font-extrabold text-white tracking-widest uppercase truncate">
                        {selectedTrack.title}
                      </h4>
                      <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wide truncate">
                        风格 / STYLE: {selectedTrack.style}
                      </p>
                    </div>

                    {/* Cover Art Toolset Controls */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Hidden File Input */}
                      <input 
                        id="hidden-cover-file-input"
                        type="file" 
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleCoverUpload(e.target.files[0]);
                          }
                        }}
                      />
                      
                      <button
                        id="btn-trigger-cover-upload"
                        onClick={() => document.getElementById('hidden-cover-file-input')?.click()}
                        className="flex items-center justify-center gap-1.5 py-2 border border-[#222] bg-[#101010] hover:bg-[#00ff9d]/10 hover:text-[#00ff9d] hover:border-[#00ff9d]/20 text-[9px] font-mono tracking-widest uppercase transition-all duration-300 cursor-pointer rounded-none active:scale-95"
                        title="Upload a custom cover image / 上传本地封面图片"
                      >
                        <Upload size={11} />
                        <span>上传封面 / UPLOAD</span>
                      </button>

                      <button
                        id="btn-trigger-cover-ai"
                        onClick={handleAIGenerateCover}
                        disabled={isGeneratingCover}
                        className="flex items-center justify-center gap-1.5 py-2 border border-[#222] bg-[#101010] hover:bg-[#00ff9d]/10 hover:text-[#00ff9d] hover:border-[#00ff9d]/20 text-[9px] font-mono tracking-widest uppercase transition-all duration-300 cursor-pointer rounded-none active:scale-95 disabled:opacity-50"
                        title="Generate cover art with AI based on style and lyrics / AI 深度视觉绘制"
                      >
                        <Sparkles size={11} className={isGeneratingCover ? "animate-spin text-[#00ff9d]" : "text-gray-400"} />
                        <span>AI 绘制封面 / AI ART</span>
                      </button>
                    </div>

                    {/* AI Prompt visualizer, shown if an AI prompt was generated for this track */}
                    {coverPrompts[selectedTrack.id] && (
                      <div className="bg-[#0b0b0b] border border-[#141414] p-3 text-[9px] font-mono text-gray-500 leading-relaxed relative">
                        <div className="absolute top-1.5 right-2 text-[7px] text-[#00ff9d]/60 tracking-wider">AI PROMPT</div>
                        <span className="text-gray-400 font-bold block mb-1">绘制意图 / Prompt Metaphor:</span>
                        <p className="line-clamp-2 hover:line-clamp-none transition-all cursor-pointer" title="点击查看完整意图 / Click to expand prompt">
                          {coverPrompts[selectedTrack.id]}
                        </p>
                      </div>
                    )}

                    {/* Integrated Simulated Player Controls */}
                    <div className="bg-[#101010] p-3.5 border border-[#1a1a1a] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            id="btn-play-pause-detail"
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00ff9d]/10 border border-[#00ff9d]/30 text-[#00ff9d] hover:bg-[#00ff9d] hover:text-black hover:border-transparent text-[9px] font-mono tracking-widest uppercase transition-all duration-300 cursor-pointer rounded-none"
                          >
                            {isPlaying ? (
                              <>
                                <Pause size={10} />
                                <span>暂停 / PAUSE</span>
                              </>
                            ) : (
                              <>
                                <Play size={10} className="fill-current" />
                                <span>播放 / PLAY WAVE</span>
                              </>
                            )}
                          </button>

                          {selectedTrack.audioUrl && (
                            <button
                              onClick={() => handleDownloadTrack(selectedTrack)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-transparent border border-gray-800 text-gray-400 hover:text-[#00ff9d] hover:border-[#00ff9d]/30 text-[9px] font-mono tracking-widest uppercase transition-all duration-300 cursor-pointer rounded-none"
                              title="Download MP3 & Lyrics / 下载歌曲与歌词"
                            >
                              <Download size={10} />
                              <span>下载 / DOWNLOAD</span>
                            </button>
                          )}
                        </div>

                        <div className="text-[9px] font-mono flex items-center gap-1.5">
                          <span className={`text-[8px] px-1.5 py-0.5 border tracking-wider ${
                            selectedTrack.audioUrl 
                              ? 'text-[#00ff9d] border-[#00ff9d]/30 bg-[#00ff9d]/10' 
                              : 'text-gray-500 border-gray-800 bg-gray-900/40'
                          }`}>
                            {selectedTrack.audioUrl ? 'HD AUDIO' : 'SYNTH MODE'}
                          </span>
                          <span className="text-gray-500">
                            {isPlaying ? 'ACTIVE' : 'IDLE'}
                          </span>
                        </div>
                      </div>

                      {/* Progress slider bar */}
                      <div className="space-y-1">
                        <div
                          id="detail-player-progress-bar"
                          onClick={(e) => {
                            if (!selectedTrack) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            const clickX = e.clientX - rect.left;
                            const percentage = Math.max(0, Math.min(1, clickX / rect.width));
                            
                            if (selectedTrack.audioUrl && audioRef.current) {
                              const dur = audioRef.current.duration || 120;
                              audioRef.current.currentTime = percentage * dur;
                            }
                            setPlayProgress(Math.floor(percentage * 100));
                          }}
                          className="relative w-full h-3 flex items-center cursor-pointer group select-none"
                          title="Jump to timeline position / 点击跳转播放位置"
                        >
                          <div className="w-full h-1 bg-gray-900 rounded-full relative overflow-visible">
                            <div
                              className="absolute left-0 top-0 h-full bg-[#00ff9d] rounded-full"
                              style={{ width: `${playProgress}%` }}
                            />
                            {/* Hover indicator node */}
                            <div
                              className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#00ff9d] opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ left: `calc(${playProgress}% - 3px)` }}
                            />
                          </div>
                        </div>
                        <div className="flex justify-between items-center text-[8px] font-mono text-gray-600">
                          <span>00:{Math.floor((playProgress / 100) * (audioRef.current?.duration || 195)).toString().padStart(2, '0')}</span>
                          <span>{selectedTrack.duration}</span>
                        </div>
                      </div>
                    </div>

                    {/* Technical spec sheet */}
                    <div className="grid grid-cols-2 gap-3.5 text-xs font-mono">
                      <div className="bg-[#101010] p-3 border border-[#161616]">
                        <span className="text-[8px] text-gray-500 uppercase tracking-widest block mb-0.5">速度 / BPM</span>
                        <span className="text-white text-[11px] font-bold">{selectedTrack.bpm} BPM</span>
                      </div>

                      <div className="bg-[#101010] p-3 border border-[#161616]">
                        <span className="text-[8px] text-gray-500 uppercase tracking-widest block mb-0.5">时长 / DURATION</span>
                        <span className="text-white text-[11px] font-bold">{selectedTrack.duration}</span>
                      </div>

                      <div className="bg-[#101010] p-3 border border-[#161616]">
                        <span className="text-[8px] text-gray-500 uppercase tracking-widest block mb-0.5">歌手性别 / SINGER GENDER</span>
                        <span className="text-[#00ff9d] text-[11px] font-bold uppercase">
                          {selectedTrack.voice ? (selectedTrack.voice.includes('/') ? selectedTrack.voice.split('/')[0].trim() : selectedTrack.voice) : 'FEMALE'}
                        </span>
                      </div>

                      <div className="bg-[#101010] p-3 border border-[#161616]">
                        <span className="text-[8px] text-gray-500 uppercase tracking-widest block mb-0.5">节拍 / TIME SIGNATURE</span>
                        <span className="text-white text-[11px] font-bold">{selectedTrack.timeSig || '4/4'}</span>
                      </div>

                      <div className="bg-[#101010] p-3 border border-[#161616] col-span-2">
                        <span className="text-[8px] text-gray-500 uppercase tracking-widest block mb-0.5">和弦配置 / CHORD MATRIX</span>
                        <span className="text-white text-[11px] font-bold truncate block">{selectedTrack.chords || 'I-V-vi-IV Progression'}</span>
                      </div>
                    </div>

                    {/* Scrollable lyrics panel */}
                    <div className="space-y-1.5">
                      <span className="text-[8px] font-mono text-gray-500 uppercase tracking-widest block">歌词文本 / LYRIC SHEETS</span>
                      <div className="relative w-full h-40 bg-[#070707] border border-[#141414] overflow-y-auto p-4 font-mono text-xs text-gray-400 leading-relaxed scrollbar-thin scrollbar-thumb-gray-800">
                        {/* Center gradient fade overlays */}
                        <div className="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-[#070707] to-transparent pointer-events-none" />
                        <div className="absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-[#070707] to-transparent pointer-events-none" />

                        <p className="whitespace-pre-line text-center py-2 select-text tracking-wider leading-6 font-sans text-[11px]">
                          {selectedTrack.lyrics || 'Pure Soundscapes / 无歌词人声哼唱器'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-24 text-center select-none">
                    <Info size={32} className="mx-auto text-gray-800 mb-4" />
                    <p className="text-xs font-mono text-gray-500 uppercase tracking-widest">
                      Please select a track from the list to inspect specifications.
                    </p>
                    <p className="text-[11px] text-gray-600 mt-1.5">
                      在左侧歌曲归档列表中点击任意歌曲，即可在此调出声音特征与歌词详情。
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* VIEW 2: Album Compiler with Toggleable Edit mode */}
        {activeTab === 'album' && (
          <motion.div
            key="album-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
          >
            {/* Left Side: Album Structure and compilation config */}
            <div className="lg:col-span-7 bg-[#0b0b0b]/90 border border-[#141414] p-6 space-y-6 shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
              {/* Header */}
              <div className="flex justify-between items-center border-b border-[#141414] pb-4">
                <div>
                  <h3 className="text-sm font-extrabold text-white tracking-widest uppercase">概念专辑排版 <span className="text-gray-500 font-normal">/ CONCEPT ALBUM COMPILER</span></h3>
                  <p className="text-xs text-slate-100 font-bold font-mono tracking-wider mt-1.5">
                    Assemble digital audio assets into a coherent sound design release
                  </p>
                </div>

                {/* Edit Mode Master Toggle button */}
                <button
                  id="btn-toggle-album-edit"
                  onClick={() => setIsEditingAlbum(!isEditingAlbum)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono tracking-widest uppercase transition-all duration-300 cursor-pointer rounded-none border ${
                    isEditingAlbum 
                      ? 'bg-[#00ff9d] text-black border-transparent font-bold shadow-[0_0_12px_rgba(0,255,157,0.25)]' 
                      : 'bg-[#101010] hover:bg-[#00ff9d]/10 text-gray-300 hover:text-[#00ff9d] border-[#1a1a1a] hover:border-[#00ff9d]/30'
                  }`}
                >
                  <Settings2 size={12} className={isEditingAlbum ? 'animate-spin' : ''} />
                  <span>{isEditingAlbum ? <>完成编辑 <span className="text-gray-400 font-normal">/ SAVE & LOCK</span></> : <>编辑专辑歌曲 <span className="text-gray-400 font-normal">/ EDIT TRACKS</span></>}</span>
                </button>
              </div>

              {/* Album identifier input */}
              <div className="space-y-2 max-w-md">
                <label className="text-[11px] font-mono text-slate-100 font-bold uppercase tracking-widest block">
                  专辑概念命名 <span className="text-gray-500 font-normal">/ ALBUM PROJECT IDENTIFIER</span>
                </label>
                <input
                  id="album-identifier-input"
                  type="text"
                  disabled={!isEditingAlbum}
                  value={albumName}
                  onChange={(e) => setAlbumName(e.target.value)}
                  className={`w-full bg-[#101010] border text-xs font-mono text-white px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#00ff9d] rounded-none uppercase tracking-widest transition-all duration-300 ${
                    isEditingAlbum 
                      ? 'border-[#00ff9d] bg-[#121212]' 
                      : 'border-[#1a1a1a] opacity-60 cursor-not-allowed'
                  }`}
                  placeholder="PROJECT: OBSIDIAN"
                />
                {!isEditingAlbum && (
                  <p className="text-[10px] text-slate-300 font-mono font-bold italic">
                    * Click 'EDIT TRACKS' above to rename this album release or modify slots.
                  </p>
                )}
              </div>

              {/* Album Cover Art section */}
              <div className="space-y-2.5">
                <label className="text-[11px] font-mono text-slate-100 font-bold uppercase tracking-widest block">
                  专辑视觉封面 <span className="text-gray-500 font-normal">/ ALBUM MASTER COVER ART</span>
                </label>
                
                <div className="flex flex-col sm:flex-row gap-4 bg-[#101010]/40 p-4 border border-[#161616]">
                  {/* Sleeve & Vinyl Preview */}
                  <div 
                    onDragOver={(e) => {
                      if (!isEditingAlbum) return;
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (!isEditingAlbum) return;
                      e.preventDefault();
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleAlbumCoverUpload(e.dataTransfer.files[0]);
                      }
                    }}
                    className={`relative w-28 h-28 bg-[#090909] border flex items-center justify-center overflow-hidden transition-all duration-300 ${
                      isEditingAlbum ? 'border-dashed border-gray-850 hover:border-[#00ff9d]/40' : 'border-[#1a1a1a]'
                    }`}
                  >
                    {/* Running loader for AI cover drawing */}
                    {isGeneratingAlbumCover && (
                      <div className="absolute inset-0 bg-black/95 z-20 flex flex-col items-center justify-center p-2 text-center">
                        <div className="w-6 h-6 border border-[#00ff9d] border-t-transparent rounded-full animate-spin mb-1.5" />
                        <span className="text-[7px] font-mono text-[#00ff9d] uppercase tracking-widest animate-pulse">DRAWING COVER...</span>
                      </div>
                    )}

                    {albumCover ? (
                      <img 
                        src={albumCover} 
                        alt="Album Cover" 
                        className="w-full h-full object-cover z-10"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-center p-2 text-gray-600">
                        <Image size={24} className="text-gray-700 mb-1" />
                        <span className="text-[7px] font-mono tracking-widest uppercase">NO COVER</span>
                      </div>
                    )}

                    {/* Badge */}
                    <div className="absolute bottom-1 right-1 px-1 bg-black/80 border border-[#222] text-[5px] font-mono text-gray-500 scale-90 z-15">
                      LP MASTER
                    </div>
                  </div>

                  {/* Upload & Generator Controls */}
                  <div className="flex-1 flex flex-col justify-center space-y-2.5">
                    <p className="text-[11px] text-slate-200 font-bold font-mono leading-relaxed">
                      {isEditingAlbum 
                        ? "Drag & drop any image, upload custom artwork, or trigger AI to sketch a conceptual cover matching your tracks."
                        : "Visual cover artwork associated with this release. Click 'EDIT TRACKS' above to customize."
                      }
                    </p>

                    <div className="flex gap-2">
                      {/* Hidden File Input for Album */}
                      <input 
                        ref={albumCoverInputRef}
                        id="hidden-album-cover-input"
                        type="file" 
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleAlbumCoverUpload(e.target.files[0]);
                          }
                        }}
                      />

                      <button
                        id="btn-upload-album-cover"
                        disabled={isCompiling}
                        onClick={() => {
                          if (!isEditingAlbum) {
                            setIsEditingAlbum(true);
                          }
                          setTimeout(() => {
                            albumCoverInputRef.current?.click();
                          }, 50);
                        }}
                        className="flex-1 flex items-center justify-center gap-1 py-2 border border-[#222] bg-[#101010] text-slate-100 hover:text-[#00ff9d] hover:border-[#00ff9d]/30 text-[11px] font-mono font-bold tracking-widest uppercase transition-all duration-300 rounded-none active:scale-95 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Upload size={10} />
                        <span>上传本地 <span className="text-gray-400 font-normal font-sans">/ UPLOAD</span></span>
                      </button>

                      <button
                        id="btn-ai-album-cover"
                        disabled={isCompiling || isGeneratingAlbumCover}
                        onClick={() => {
                          if (!isEditingAlbum) {
                            setIsEditingAlbum(true);
                          }
                          setTimeout(() => {
                            handleAIGenerateAlbumCover();
                          }, 50);
                        }}
                        className="flex-1 flex items-center justify-center gap-1 py-2 border border-[#222] bg-[#101010] text-slate-100 hover:text-[#00ff9d] hover:border-[#00ff9d]/30 text-[11px] font-mono font-bold tracking-widest uppercase transition-all duration-300 rounded-none active:scale-95 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Sparkles size={10} className={isGeneratingAlbumCover ? "animate-spin text-[#00ff9d]" : "text-gray-400"} />
                        <span>AI 智能绘制 <span className="text-gray-400 font-normal font-sans">/ AI ART</span></span>
                      </button>
                    </div>

                    {isGeneratingAlbumCover && (
                      <p className="text-[7px] font-mono text-[#00ff9d] tracking-wider animate-pulse truncate">
                        {albumCoverGenStep}
                      </p>
                    )}
                  </div>
                </div>

                {/* AI Album Prompt visualizer */}
                {albumCoverPrompt && (
                  <div className="bg-[#0b0b0b] border border-[#141414] p-3 text-[10px] font-mono text-slate-200 leading-normal relative">
                    <div className="absolute top-1.5 right-2 text-[8px] text-[#00ff9d] font-bold tracking-wider">ALBUM ART METAPHOR</div>
                    <span className="text-slate-100 font-bold block mb-0.5">视觉意境 / Aesthetic Metaphor:</span>
                    <p className="line-clamp-1 hover:line-clamp-none transition-all cursor-pointer">
                      {albumCoverPrompt}
                    </p>
                  </div>
                )}
              </div>

              {/* Slots stats row */}
              <div className="flex justify-between text-xs font-semibold font-mono text-slate-100 bg-[#101010] p-3 border border-[#1a1a1a]">
                <span>卡槽编排进度 <span className="text-gray-400 font-normal font-sans">/ ARRANGED SLOTS</span>: <strong className="text-[#00ff9d]">{activeSlotsCount}/5</strong></span>
                <span>总时长 <span className="text-gray-400 font-normal font-sans">/ TOTAL TIME</span>: <strong className="text-white">{calculateTotalTime()}</strong></span>
              </div>

              {/* Slotted tracks list */}
              <div className="space-y-3">
                {slots.map((slot, index) => (
                  <div
                    id={`album-slot-item-${index}`}
                    key={index}
                    className={`flex items-center justify-between p-4 border transition-all duration-300 relative ${
                      slot
                        ? 'bg-[#121212]/50 border-[#1a1a1a] hover:border-[#00ff9d]/25'
                        : 'bg-transparent border-dashed border-[#1a1a1a] text-gray-400'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono text-[#00ff9d] font-bold">0{index + 1}</span>
                      {slot ? (
                        <div>
                          <h4 className="text-xs font-bold text-white tracking-widest uppercase truncate max-w-[200px] md:max-w-[300px]">
                            {slot.title}
                          </h4>
                          <p className="text-[10px] font-mono text-slate-100 font-bold uppercase mt-0.5">
                            {slot.bpm} <span className="text-gray-400 font-normal">BPM</span> <span className="text-gray-600 font-normal">|</span> {slot.style.split(',')[0]} <span className="text-gray-600 font-normal">|</span> {slot.voice ? (slot.voice.includes('/') ? slot.voice.split('/')[0].trim() : slot.voice) : 'FEMALE'}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs font-mono tracking-widest text-slate-200 font-bold uppercase">
                          待编排歌曲槽 <span className="text-gray-500 font-normal font-sans">/ EMPTY ARRANGEMENT SLOT 0{index + 1}</span>
                        </span>
                      )}
                    </div>

                    {slot ? (
                      <AnimatePresence>
                        {isEditingAlbum && (
                          <motion.button
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            id={`clear-slot-btn-${index}`}
                            onClick={() => handleRemoveTrack(index)}
                            className="text-gray-500 hover:text-[#ff3c64] p-1.5 border border-transparent hover:border-[#ff3c64]/30 hover:bg-[#ff3c64]/5 transition-all duration-300 cursor-pointer rounded-none"
                            title="Clear Slot / 移除此曲"
                          >
                            <Trash2 size={13} />
                          </motion.button>
                        )}
                      </AnimatePresence>
                    ) : (
                      isEditingAlbum && (
                        <span className="text-[9px] font-mono text-[#00ff9d] animate-pulse tracking-widest uppercase">
                          待填充 / CLICK ADD BELOW
                        </span>
                      )
                    )}
                  </div>
                ))}
              </div>

              {/* Master compilation release action */}
              <div className="pt-4 border-t border-[#141414]">
                <button
                  id="album-master-compile-btn"
                  disabled={activeSlotsCount === 0 || isCompiling || isEditingAlbum}
                  onClick={handleCompile}
                  className={`w-full relative flex items-center justify-center gap-2 py-4 text-xs font-bold tracking-[0.25em] uppercase transition-all duration-300 rounded-none cursor-pointer ${
                    activeSlotsCount === 0 || isCompiling || isEditingAlbum
                      ? 'bg-[#121212] text-gray-600 border border-[#1a1a1a] cursor-not-allowed'
                      : 'bg-[#00ff9d] text-black font-extrabold hover:bg-[#00ff9d]/90 shadow-[0_0_20px_rgba(0,255,157,0.15)] hover:shadow-[0_0_25px_rgba(0,255,157,0.25)] border border-transparent'
                  }`}
                >
                  {isCompiling ? (
                    <>
                      <RefreshCw className="animate-spin" size={14} />
                      <span>混音制作中... / COMPILING MASTER {compileProgress}%</span>
                    </>
                  ) : (
                    <>
                      <Layers size={14} />
                      <span>混音母带输出 / COMPILE MASTER RELEASE</span>
                    </>
                  )}
                </button>
                {isEditingAlbum && (
                  <p className="text-[10px] text-[#ff3c64] font-bold text-center font-mono mt-2.5 uppercase tracking-wider">
                    * Please exit edit mode ("SAVE & LOCK") before compiling the album master release.
                  </p>
                )}
              </div>
            </div>

            {/* Right Side: Quick Add Archive list (Available Archive Selector) */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-[#0b0b0b]/95 border border-[#141414] p-6 shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
                <div className="flex items-center justify-between border-b border-[#141414] pb-4.5 mb-5">
                  <div className="flex items-center gap-2">
                    <Library size={13} className="text-[#00ff9d]" />
                    <h3 className="text-xs font-mono font-bold text-white tracking-[0.2em] uppercase">
                      备选曲目库 <span className="text-gray-500 font-normal font-sans">/ AVAILABLE ARCHIVE</span>
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-slate-100">{library.length} TRACKS</span>
                </div>

                {isEditingAlbum ? (
                  <div className="space-y-3.5">
                    <p className="text-xs font-mono text-slate-200 bg-[#121212] p-3 border border-dashed border-[#1a1a1a]">
                      <strong>编辑说明 <span className="text-gray-400 font-normal font-sans">/ INSTRUCTIONS</span>:</strong><br />
                      点击右侧的 ➕ 图标，即可将歌曲添加至专辑的空槽中（上限5首）。
                    </p>

                    <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                      {library.map((track) => {
                        const isSlotted = slots.some((s) => s && s.id === track.id);
                        return (
                          <div
                            id={`add-track-item-${track.id}`}
                            key={track.id}
                            className={`flex items-center justify-between p-3 border transition-colors ${
                              isSlotted 
                                ? 'bg-black/40 border-transparent opacity-40' 
                                : 'bg-[#101010]/60 border-[#161616] hover:border-[#00ff9d]/30'
                            }`}
                          >
                            <div className="truncate max-w-[150px] md:max-w-[200px]">
                              <h4 className="text-xs font-bold text-white truncate tracking-wider">{track.title}</h4>
                              <p className="text-[10px] font-mono text-slate-100 font-bold truncate uppercase">{track.style.split(',')[0]}</p>
                            </div>

                            <button
                              id={`quick-add-to-slot-${track.id}`}
                              disabled={isSlotted || activeSlotsCount >= 5}
                              onClick={() => handleAddTrack(track)}
                              className={`p-1.5 border transition-all duration-300 rounded-none cursor-pointer flex items-center gap-1 text-[9px] font-mono ${
                                isSlotted
                                  ? 'border-transparent text-gray-600'
                                  : activeSlotsCount >= 5
                                    ? 'border-transparent text-gray-600 cursor-not-allowed'
                                    : 'border-[#00ff9d]/30 text-[#00ff9d] hover:bg-[#00ff9d] hover:text-black hover:border-transparent'
                              }`}
                            >
                              <Plus size={10} />
                              <span>{isSlotted ? <>已添加 <span className="text-gray-400 font-normal font-sans">/ ADDED</span></> : <>添加 <span className="text-gray-400 font-normal font-sans">/ ADD</span></>}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-[#101010]/60 p-3.5 text-xs font-mono text-slate-200 border border-[#161616]">
                      <strong>母带工作流 <span className="text-gray-400 font-normal font-sans">/ LOCK STATUS</span>:</strong><br />
                      当前排版已锁定。点击上方的 <strong>“编辑专辑歌曲”</strong> 可重开编辑、调整曲目或更换专辑名与封面。
                    </div>

                    <div className="border-b border-[#141414] pb-2">
                      <h4 className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-widest flex items-center justify-between">
                        <span>已混音母带 EP / MASTER RELEASES</span>
                        <span className="text-[#00ff9d] bg-[#00ff9d]/10 px-1.5 py-0.5 border border-[#00ff9d]/20 text-[9px]">{compiledAlbums.length}</span>
                      </h4>
                    </div>

                    {compiledAlbums.length === 0 ? (
                      <div className="py-12 text-center border border-dashed border-[#141414] text-gray-600">
                        <Disc size={28} className="mx-auto text-gray-800 mb-2.5 animate-pulse" />
                        <span className="text-[9px] font-mono tracking-widest uppercase block">No master releases yet</span>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                        {compiledAlbums.map((album) => (
                          <div 
                            key={album.id}
                            onClick={() => setViewingAlbum(album)}
                            className="bg-[#101010]/80 border border-[#161616] hover:border-[#00ff9d]/35 hover:bg-[#121212]/90 p-3 transition-all duration-300 group flex gap-3 relative cursor-pointer"
                          >
                            {/* Cover */}
                            <div className="relative w-14 h-14 bg-black flex-shrink-0 border border-[#222] overflow-hidden">
                              <img 
                                src={album.cover} 
                                alt={album.name} 
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            </div>

                            {/* Details */}
                            <div className="flex-1 min-w-0">
                              <h5 className="text-[11px] font-bold text-white truncate uppercase tracking-widest group-hover:text-[#00ff9d] transition-colors">
                                {album.name}
                              </h5>
                              <p className="text-[8px] font-mono text-gray-500 mt-0.5 uppercase">
                                {album.tracks.length} Tracks | {album.duration} | {album.timestamp}
                              </p>
                              
                              {/* Track list mini names */}
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {album.tracks.map((t, tIdx) => (
                                  <span 
                                    key={t.id} 
                                    className="text-[7px] font-mono bg-black text-gray-400 px-1 border border-[#1a1a1a] truncate max-w-[80px]"
                                    title={t.title}
                                  >
                                    0{tIdx + 1} {t.title}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Delete compiled album action */}
                            <button
                              id={`delete-compiled-${album.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('确定要销毁该母带唱片吗 / Are you sure you want to delete this master release?')) {
                                  setCompiledAlbums(prev => prev.filter(a => a.id !== album.id));
                                }
                              }}
                              className="opacity-0 group-hover:opacity-100 absolute top-2 right-2 text-gray-600 hover:text-[#ff3c64] p-1 border border-transparent hover:border-[#ff3c64]/20 hover:bg-[#ff3c64]/5 transition-all cursor-pointer rounded-none"
                              title="Delete Release / 销毁此母带"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* High-tech compilation overlays */}
      <AnimatePresence>
        {isCompiling && (
          <div className="fixed inset-0 z-50 bg-[#050505]/95 backdrop-blur-md flex items-center justify-center">
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="max-w-md w-full bg-[#0b0b0b] border border-[#202020] p-8 text-center space-y-6 shadow-[0_0_50px_rgba(0,255,157,0.15)]"
            >
              <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 border border-[#00ff9d] rounded-full animate-spin" style={{ animationDuration: '4s' }} />
                <Disc size={36} className="text-[#00ff9d] animate-pulse" />
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-mono text-[#00ff9d] uppercase tracking-[0.3em] font-bold">
                  MASTERING RELEASE / 母带混音制作中
                </h3>
                <p className="text-xs font-mono text-gray-400 h-6">
                  {compileStepText}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-1 bg-gray-950 rounded-full overflow-hidden border border-[#1a1a1a]">
                <div
                  className="h-full bg-[#00ff9d] transition-all duration-150"
                  style={{ width: `${compileProgress}%` }}
                />
              </div>

              <p className="text-[9px] font-mono text-gray-500 tracking-wider">
                COEFFICIENT MASTER BLOCK #S_98319
              </p>
            </motion.div>
          </div>
        )}

        {isCompiled && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="max-w-lg w-full bg-[#0b0b0b] border border-[#00ff9d]/30 p-8 space-y-6 relative shadow-[0_0_60px_rgba(0,255,157,0.2)]"
            >
              {/* Green decorator accent */}
              <div className="absolute top-0 left-0 w-full h-1.5 bg-[#00ff9d]" />

              <div className="text-center space-y-2">
                <CheckCircle size={48} className="mx-auto text-[#00ff9d]" />
                <h3 className="text-xl font-extrabold text-white tracking-widest uppercase">
                  EP COMPILED SUCCESSFULLY / 母带混音完成
                </h3>
                <p className="text-xs font-mono text-gray-400">
                  {albumName} has been fully mastered into lossless audio streams.
                </p>
              </div>

              {/* Album Cover Art in Compiled Dialog */}
              <div className="relative w-40 h-40 mx-auto bg-black border border-[#222] overflow-hidden shadow-2xl flex items-center justify-center">
                {albumCover ? (
                  <img 
                    src={albumCover} 
                    alt={albumName} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-2 text-gray-700">
                    <Disc size={40} className="text-gray-800 mb-2 animate-spin" style={{ animationDuration: '8s' }} />
                    <span className="text-[8px] font-mono tracking-widest uppercase text-gray-500">DIGITAL MASTER</span>
                  </div>
                )}
                <div className="absolute top-2 left-2 px-1 bg-black/80 border border-[#222] text-[6px] font-mono text-gray-500 scale-90">
                  LP RELEASE
                </div>
              </div>

              {/* Details and breakdown */}
              <div className="bg-[#101010] p-4.5 border border-[#1a1a1a] space-y-3 font-mono text-xs">
                <div className="flex justify-between border-b border-[#161616] pb-2">
                  <span className="text-gray-500">CATALOG ID / 专辑识别号</span>
                  <span className="text-white">EP_001_A</span>
                </div>
                <div className="flex justify-between border-b border-[#161616] pb-2">
                  <span className="text-gray-500">TOTAL DURATION / 总时长</span>
                  <span className="text-white">{calculateTotalTime()}</span>
                </div>
                <div className="flex justify-between border-b border-[#161616] pb-2">
                  <span className="text-gray-500">TRACKS COUNT / 收录歌曲数</span>
                  <span className="text-white">{activeSlotsCount}</span>
                </div>

                <div className="pt-1.5 space-y-1">
                  <span className="text-gray-500 block text-[9px] uppercase">TRACKLIST STREAM / 曲目清单</span>
                  {slots.map((s, idx) => {
                    if (!s) return null;
                    return (
                      <div key={idx} className="flex justify-between text-[11px] text-gray-300">
                        <span>0{idx + 1}. {s.title}</span>
                        <span>{s.duration}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  id="btn-download-album"
                  onClick={() => {
                    handleDownloadAlbum({
                      id: `ALB-TEMP-${Date.now()}`,
                      name: albumName,
                      cover: albumCover || `https://picsum.photos/seed/${encodeURIComponent(albumName)}/500/500`,
                      tracks: slots.filter((s): s is Track => s !== null),
                      duration: calculateTotalTime(),
                      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
                    });
                    setIsCompiled(false);
                  }}
                  className="py-3.5 bg-[#00ff9d] text-black font-sans font-bold text-xs tracking-wider uppercase transition-all duration-300 hover:bg-[#00ff9d]/90 flex items-center justify-center gap-1.5 rounded-none cursor-pointer"
                >
                  <ExternalLink size={13} />
                  <span>下载数字EP / DOWNLOAD EP</span>
                </button>
                <button
                  id="btn-close-compiled-dialog"
                  onClick={() => {
                    setIsCompiled(false);
                    setSlots([null, null, null, null, null]);
                    setAlbumCover('');
                    setAlbumCoverPrompt('');
                    setAlbumName('PROJECT: OBSIDIAN');
                  }}
                  className="py-3.5 border border-gray-700 text-gray-300 font-sans font-bold text-xs tracking-wider uppercase transition-all duration-300 hover:border-gray-500 hover:text-white rounded-none cursor-pointer"
                >
                  返回 / DISMISS
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* viewingAlbum dialog */}
        {viewingAlbum && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="max-w-3xl w-full bg-[#0b0b0b] border border-[#00ff9d]/30 p-8 space-y-6 relative shadow-[0_0_60px_rgba(0,255,157,0.2)]"
            >
              {/* Green decorator accent */}
              <div className="absolute top-0 left-0 w-full h-1.5 bg-[#00ff9d]" />

              {/* Close button X */}
              <button
                onClick={() => setViewingAlbum(null)}
                className="absolute top-4 right-4 text-gray-500 hover:text-white font-mono text-lg transition-colors cursor-pointer"
              >
                ✕
              </button>

              {/* Header: Album Cover & Title */}
              <div className="flex flex-col sm:flex-row gap-6 border-b border-[#161616] pb-5 text-left">
                <div className="relative w-28 h-28 bg-black border border-[#222] overflow-hidden shadow-xl flex-shrink-0 mx-auto sm:mx-0">
                  <img 
                    src={viewingAlbum.cover} 
                    alt={viewingAlbum.name} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute bottom-1 right-1 px-1 bg-black/80 border border-[#222] text-[5px] font-mono text-gray-500 scale-90">
                    LP MASTER
                  </div>
                </div>

                <div className="flex-1 text-center sm:text-left space-y-2">
                  <span className="text-[9px] font-mono tracking-widest text-[#00ff9d] bg-[#00ff9d]/10 px-2 py-0.5 border border-[#00ff9d]/30 uppercase inline-block">
                    已发布数字唱片 / COMPILED ALBUM RELEASE
                  </span>
                  <h3 className="text-xl font-extrabold text-white tracking-widest uppercase">
                    {viewingAlbum.name}
                  </h3>
                  <p className="text-xs font-mono text-gray-500">
                    发布时间 / RELEASED: {viewingAlbum.timestamp} | 总时长: {viewingAlbum.duration} | 收录曲目: {viewingAlbum.tracks.length}
                  </p>
                </div>
              </div>

              {/* Two-Column details layout */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                
                {/* Left Column: Slotted track list selector */}
                <div className="md:col-span-5 space-y-2.5">
                  <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest block text-left">
                    收录曲目清单 / TRACKLIST ({viewingAlbum.tracks.length})
                  </span>
                  
                  <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                    {viewingAlbum.tracks.map((track, idx) => {
                      const isSelected = viewingAlbumSelectedTrack && viewingAlbumSelectedTrack.id === track.id;
                      return (
                        <div
                          key={track.id}
                          onClick={() => setViewingAlbumSelectedTrack(track)}
                          className={`p-3 border flex items-center justify-between cursor-pointer transition-all duration-300 ${
                            isSelected
                              ? 'bg-[#00ff9d]/5 border-[#00ff9d]/50 text-white'
                              : 'bg-[#101010]/60 border-[#161616] hover:border-[#00ff9d]/20 text-gray-400 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <span className={`text-[10px] font-mono ${isSelected ? 'text-[#00ff9d] font-bold' : 'text-gray-600'}`}>
                              0{idx + 1}
                            </span>
                            <div className="truncate text-left">
                              <h4 className="text-xs font-bold truncate max-w-[120px]">{track.title}</h4>
                              <p className="text-[8px] font-mono text-gray-500 truncate">{track.bpm} BPM | {track.style.split(',')[0]}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Short duration */}
                            <span className="text-[9px] font-mono text-gray-600">{track.duration}</span>
                            
                            {/* Mini direct jump-to-play button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTrack(track);
                                setIsPlaying(true);
                                setViewingAlbum(null);
                              }}
                              className="p-1 border border-transparent hover:border-[#00ff9d]/40 text-[#00ff9d] hover:bg-[#00ff9d]/10 transition-all cursor-pointer rounded-none"
                              title="Play this track / 立即试听"
                            >
                              <Play size={10} className="fill-[#00ff9d]/20" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right Column: Active Slotted Track Specs & Lyrics */}
                <div className="md:col-span-7 bg-[#101010]/90 border border-[#161616] p-4.5 space-y-4">
                  {viewingAlbumSelectedTrack ? (
                    <div className="space-y-4 text-left">
                      {/* Sub header */}
                      <div className="flex items-center justify-between border-b border-[#1b1b1b] pb-2">
                        <h4 className="text-xs font-extrabold text-white tracking-wider uppercase truncate max-w-[180px]">
                          {viewingAlbumSelectedTrack.title}
                        </h4>
                        <span className="text-[9px] font-mono text-[#00ff9d] border border-[#00ff9d]/20 bg-[#00ff9d]/5 px-2 py-0.5">
                          {viewingAlbumSelectedTrack.bpm} BPM | {viewingAlbumSelectedTrack.timeSig || '4/4'}
                        </span>
                      </div>

                      {/* Specs */}
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-gray-400">
                        <div>和弦 / CHORDS: <strong className="text-white block truncate">{viewingAlbumSelectedTrack.chords || 'Auto Progression'}</strong></div>
                        <div>人声 / VOICE: <strong className="text-white block uppercase">{viewingAlbumSelectedTrack.voice || 'FEMALE'}</strong></div>
                      </div>

                      {/* Scrollable Lyrics */}
                      <div className="space-y-1">
                        <span className="text-[8px] font-mono text-gray-500 uppercase tracking-widest block">歌词正文 / LYRICS:</span>
                        <div className="w-full h-32 bg-[#070707] border border-[#141414] overflow-y-auto p-3 font-mono text-[10px] text-gray-400 leading-relaxed scrollbar-thin select-text">
                          <p className="whitespace-pre-line text-center">
                            {viewingAlbumSelectedTrack.lyrics || 'Pure Instrumentals / 无歌词人声哼唱'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-20 text-center select-none text-gray-600 font-mono text-xs">
                      Please select a track on the left.
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-[#161616]">
                <button
                  onClick={() => handleDownloadAlbum(viewingAlbum)}
                  className="px-6 py-2.5 bg-[#00ff9d] text-black font-sans font-bold text-xs tracking-wider uppercase transition-all duration-300 hover:bg-[#00ff9d]/90 flex items-center justify-center gap-1.5 rounded-none cursor-pointer"
                >
                  <ExternalLink size={12} />
                  <span>下载数字EP / DOWNLOAD EP</span>
                </button>
                <button
                  onClick={() => setViewingAlbum(null)}
                  className="px-6 py-2.5 border border-gray-700 text-gray-300 font-sans font-bold text-xs tracking-wider uppercase transition-all duration-300 hover:border-gray-500 hover:text-white rounded-none cursor-pointer"
                >
                  返回 / CLOSE
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
