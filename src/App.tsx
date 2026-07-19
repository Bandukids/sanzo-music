import { useState, useEffect } from 'react';
import { Screen, PresetTag, Track, User } from './types';
import { TopNavBar } from './components/TopNavBar';
import { ParticleBackground } from './components/ParticleBackground';
import { MoodHome } from './components/MoodHome';
import { StudioGeneration } from './components/StudioGeneration';
import { CardGridStudio } from './components/CardGridStudio';
import { AuthScreen } from './components/AuthScreen';
import { AdminPanel } from './components/AdminPanel';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [selectedMood, setSelectedMood] = useState<PresetTag | string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('sanzo_user');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      console.error('Failed to load user session', e);
      return null;
    }
  });

  const [showAuthModal, setShowAuthModal] = useState(false);

  const [savedTracks, setSavedTracks] = useState<Track[]>([]);

  // Load saved tracks from backend when user logs in
  useEffect(() => {
    const fetchUserTracks = async () => {
      if (!currentUser) {
        setSavedTracks([]);
        return;
      }
      try {
        const res = await fetch('/api/tracks', {
          headers: {
            'x-username': currentUser.username
          }
        });
        if (res.ok) {
          const data = await res.json();
          setSavedTracks(data);
        }
      } catch (err) {
        console.error('Failed to fetch user tracks from backend:', err);
      }
    };
    fetchUserTracks();
  }, [currentUser]);

  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem('sanzo_user', JSON.stringify(currentUser));
      } else {
        localStorage.removeItem('sanzo_user');
      }
    } catch (e) {
      console.error('Failed to persist user session', e);
    }
  }, [currentUser]);

  // Callback when user selects mood tag or types mood
  const handleSelectMood = (mood: PresetTag | string) => {
    setSelectedMood(mood);
    setCurrentScreen('studio');
  };

  // Callback when user plays recommended track
  const handlePlayTrack = (track: Track) => {
    setSelectedMood({
      label: track.title,
      englishLabel: track.style,
      style: track.style,
      bpm: track.bpm,
      chords: 'I-IV-V-I Progression',
      timeSig: '4/4',
      lyricsPrompt: `Ambient track inspired by ${track.title}`
    });
    setCurrentScreen('studio');
  };

  // Callback when a track gets successfully generated and saved inside Studio
  const handleSaveToLibrary = async (track: Track, taskId?: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/tracks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-username': currentUser.username
        },
        body: JSON.stringify({ track, taskId })
      });
      if (res.ok) {
        const data = await res.json();
        // Use the track returned by backend (which contains userId, modelSource, createdAt)
        setSavedTracks((prev) => [data.track, ...prev]);
      } else {
        console.error('Failed to save track to backend');
        setSavedTracks((prev) => [track, ...prev]);
      }
    } catch (err) {
      console.error('Error saving track to backend:', err);
      setSavedTracks((prev) => [track, ...prev]);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentScreen('home');
  };

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-200 overflow-x-hidden font-sans select-none pb-12">
      {/* Background canvas of drifting particles */}
      <ParticleBackground />

      {/* Global Navigation Bar */}
      <TopNavBar
        currentScreen={currentScreen}
        setScreen={setCurrentScreen}
        currentUser={currentUser}
        onLogout={handleLogout}
        onRequestLogin={() => setShowAuthModal(true)}
      />

      {/* Main Content Router with Keep-Alive */}
      <main className="relative z-10 w-full pt-28 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div style={{ display: currentScreen === 'home' ? 'block' : 'none' }}>
          <MoodHome
            onSelectMood={handleSelectMood}
            onPlayTrack={handlePlayTrack}
            setScreen={setCurrentScreen}
            savedTracks={savedTracks}
            onSaveToLibrary={handleSaveToLibrary}
            currentUser={currentUser}
            onRequestLogin={() => setShowAuthModal(true)}
          />
        </div>

        <div style={{ display: currentScreen === 'studio' ? 'block' : 'none' }}>
          <StudioGeneration
            initialMood={selectedMood}
            onSaveToLibrary={handleSaveToLibrary}
            savedTracks={savedTracks}
            currentUser={currentUser}
            onRequestLogin={() => setShowAuthModal(true)}
          />
        </div>

        <div style={{ display: currentScreen === 'treasury' ? 'block' : 'none' }}>
          {!currentUser ? (
            <div className="w-full max-w-md mx-auto text-center py-20 bg-[#0c0c0c]/60 border border-[#1b1b1b] p-8 rounded-none backdrop-blur-xl">
              <h3 className="text-sm font-sans font-bold tracking-[0.2em] text-white uppercase mb-4">
                请先登录 / LOGIN REQUIRED
              </h3>
              <p className="text-xs text-gray-500 tracking-wider mb-6">
                登录后即可保存歌曲并查阅您的个人宝藏库 / Log in to save and browse your generated tracks library.
              </p>
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-6 py-2.5 bg-[#00ff9d] text-black font-sans font-bold text-xs tracking-widest uppercase transition-all duration-300 hover:bg-[#00ff9d]/90 rounded-none cursor-pointer"
              >
                立即登录 / LOG IN NOW
              </button>
            </div>
          ) : (
            <CardGridStudio
              customTracks={savedTracks}
            />
          )}
        </div>

        {currentUser && currentUser.role === 'admin' && (
          <div style={{ display: currentScreen === 'admin' ? 'block' : 'none' }}>
            <AdminPanel currentUser={currentUser} />
          </div>
        )}
      </main>

      {/* Auth Modal Overlay */}
      {showAuthModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-sm mx-4">
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors duration-200 text-[10px] font-mono tracking-widest uppercase cursor-pointer z-[101]"
              title="关闭 / CLOSE"
            >
              关闭 / CLOSE [X]
            </button>
            <AuthScreen
              onLoginSuccess={(user) => {
                setCurrentUser(user);
                setShowAuthModal(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
