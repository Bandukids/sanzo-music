import React, { useState, useEffect } from 'react';
import { User, Trash2, Calendar, Shield, RefreshCw, Music, HardDrive, Cpu, Database } from 'lucide-react';
import { User as UserType } from '../types';

interface AdminPanelProps {
  currentUser: UserType | null;
}

interface ManagedUser {
  id: string;
  username: string;
  role: 'user' | 'admin';
  createdAt: string;
}

interface ManagedTrack {
  id: string;
  title: string;
  bpm: number;
  duration: string;
  style: string;
  userId: string;
  username: string;
  modelSource: 'local' | 'runninghub' | 'offline';
  createdAt: string;
  coverUrl?: string;
  audioUrl?: string;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'tracks'>('users');
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [tracks, setTracks] = useState<ManagedTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchUsers = async () => {
    if (!currentUser) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        headers: {
          'x-admin-username': currentUser.username
        }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取用户列表失败');
      }
      const data = await res.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message || '连接服务器失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchTracks = async () => {
    if (!currentUser) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/tracks', {
        headers: {
          'x-admin-username': currentUser.username
        }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取生成记录失败');
      }
      const data = await res.json();
      setTracks(data);
    } catch (err: any) {
      setError(err.message || '连接服务器失败');
    } finally {
      setLoading(false);
    }
  };

  const loadData = () => {
    if (activeTab === 'users') {
      fetchUsers();
    } else {
      fetchTracks();
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser, activeTab]);

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!currentUser) return;
    if (!window.confirm(`确定要删除用户 "${username}" 吗？此操作无法撤销。`)) {
      return;
    }

    setActionLoadingId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'x-admin-username': currentUser.username
        }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '删除用户失败');
      }
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err: any) {
      alert(err.message || '删除用户失败');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteTrack = async (trackId: string, trackTitle: string) => {
    if (!currentUser) return;
    if (!window.confirm(`确定要删除生成记录 "${trackTitle}" 吗？此操作无法撤销。`)) {
      return;
    }

    setActionLoadingId(trackId);
    try {
      const res = await fetch(`/api/admin/tracks/${trackId}`, {
        method: 'DELETE',
        headers: {
          'x-admin-username': currentUser.username
        }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '删除记录失败');
      }
      setTracks(prev => prev.filter(t => t.id !== trackId));
    } catch (err: any) {
      alert(err.message || '删除记录失败');
    } finally {
      setActionLoadingId(null);
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('zh-CN', { hour12: false });
    } catch (e) {
      return isoString;
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto mt-6 bg-[#0c0c0c]/80 border border-[#121212] rounded-none p-6 md:p-8 backdrop-blur-md shadow-2xl relative select-none animate-fade-in">
      <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#00ff9d]/25 to-transparent" />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-[#121212] pb-6">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-[0.2em] font-sans flex items-center gap-2.5">
            <Shield className="text-[#00ff9d]" size={20} />
            <span>后台管理系统 / ADMIN PANEL</span>
          </h2>
          <p className="text-[10px] text-gray-500 mt-2 uppercase tracking-[0.15em]">
            管理注册用户、系统数据及生成记录 / DB users and track logs
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="self-start sm:self-center bg-[#101010] border border-[#222] hover:border-[#00ff9d]/30 hover:text-[#00ff9d] text-gray-300 rounded-none px-4 py-2 text-[10px] font-sans tracking-widest font-bold transition-all duration-300 flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          <span>刷新数据 / REFRESH</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-8 border-b border-[#121212] pb-px">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 text-xs font-sans tracking-[0.15em] font-bold uppercase transition-all duration-300 rounded-none cursor-pointer border-b-2 ${
            activeTab === 'users'
              ? 'text-white border-[#00ff9d]'
              : 'text-gray-500 border-transparent hover:text-gray-300'
          }`}
        >
          用户账号管理 / USER ACCOUNTS
        </button>
        <button
          onClick={() => setActiveTab('tracks')}
          className={`px-4 py-2 text-xs font-sans tracking-[0.15em] font-bold uppercase transition-all duration-300 rounded-none cursor-pointer border-b-2 ${
            activeTab === 'tracks'
              ? 'text-white border-[#00ff9d]'
              : 'text-gray-500 border-transparent hover:text-gray-300'
          }`}
        >
          音乐生成数据库 / TRACK RECORDS
        </button>
      </div>

      {error && (
        <div className="mb-6 p-3.5 bg-red-950/10 border border-red-500/20 text-red-400 text-[10px] font-sans tracking-wider uppercase font-bold rounded-none">
          {error}
        </div>
      )}

      {/* Tab 1: Users account panel */}
      {activeTab === 'users' && (
        <div className="overflow-x-auto w-full border border-[#121212] rounded-none bg-[#080808]/40">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#121212] bg-[#121212]/30 text-gray-500 text-[9px] font-sans font-bold tracking-widest uppercase">
                <th className="py-4 px-6">用户名 / USERNAME</th>
                <th className="py-4 px-6">用户 ID / USER ID</th>
                <th className="py-4 px-6">角色 / ROLE</th>
                <th className="py-4 px-6">注册时间 / CREATED AT</th>
                <th className="py-4 px-6 text-right">操作 / ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs text-gray-500">
                    <div className="inline-block w-5 h-5 border-2 border-[#00ff9d] border-t-transparent rounded-full animate-spin mb-2" />
                    <div>正在读取用户列表...</div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs text-gray-500 uppercase tracking-widest">
                    没有注册用户 / NO REGISTERED USERS FOUND
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-[#121212] hover:bg-[#121212]/20 transition-all duration-150 text-xs text-gray-300"
                  >
                    <td className="py-4 px-6 font-semibold text-white flex items-center gap-2.5">
                      <User size={14} className="text-gray-600" />
                      <span>{user.username}</span>
                    </td>
                    <td className="py-4 px-6 font-mono text-[10px] text-gray-600">
                      {user.id}
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-none text-[8px] font-mono tracking-wider uppercase ${
                          user.role === 'admin'
                            ? 'bg-[#00ff9d]/10 text-[#00ff9d] border border-[#00ff9d]/20'
                            : 'bg-[#00bfff]/10 text-[#00bfff] border border-[#00bfff]/20'
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-xs text-gray-500">
                      <span>{formatDate(user.createdAt)}</span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      {user.role === 'admin' ? (
                        <span className="text-[9px] text-gray-600 font-sans tracking-wider font-bold uppercase select-none pr-3">
                          系统保护 / SYSTEM PROTECTED
                        </span>
                      ) : (
                        <button
                          onClick={() => handleDeleteUser(user.id, user.username)}
                          disabled={actionLoadingId === user.id}
                          className="text-red-400 hover:text-red-300 hover:bg-red-950/20 border border-transparent hover:border-red-500/20 rounded-none p-1.5 transition-all duration-300 cursor-pointer disabled:opacity-50"
                          title="删除用户"
                        >
                          {actionLoadingId === user.id ? (
                            <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Generated tracks database panel */}
      {activeTab === 'tracks' && (
        <div className="overflow-x-auto w-full border border-[#121212] rounded-none bg-[#080808]/40">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#121212] bg-[#121212]/30 text-gray-500 text-[9px] font-sans font-bold tracking-widest uppercase">
                <th className="py-4 px-6">歌曲封面与名称 / TITLE & COVER</th>
                <th className="py-4 px-6">创作者 / CREATOR</th>
                <th className="py-4 px-6">算力源 / MODEL SOURCE</th>
                <th className="py-4 px-6">生成时间 / GENERATED AT</th>
                <th className="py-4 px-6 text-right">操作 / ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading && tracks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs text-gray-500">
                    <div className="inline-block w-5 h-5 border-2 border-[#00ff9d] border-t-transparent rounded-full animate-spin mb-2" />
                    <div>正在读取歌曲数据库...</div>
                  </td>
                </tr>
              ) : tracks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs text-gray-500 uppercase tracking-widest">
                    没有歌曲生成记录 / NO GENERATION RECORDS FOUND
                  </td>
                </tr>
              ) : (
                tracks.map((track) => (
                  <tr
                    key={track.id}
                    className="border-b border-[#121212] hover:bg-[#121212]/20 transition-all duration-150 text-xs text-gray-300"
                  >
                    <td className="py-4 px-6 font-semibold text-white flex items-center gap-3">
                      <div className="w-10 h-10 border border-[#222] bg-[#0c0c0c] flex-shrink-0 relative overflow-hidden group/thumb rounded-none">
                        {track.coverUrl ? (
                          <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-700">
                            <Music size={16} />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-white font-sans font-bold tracking-wider">{track.title}</span>
                        <span className="text-[9px] text-gray-500 font-mono tracking-widest mt-0.5 uppercase">
                          {track.style} | {track.bpm}BPM | {track.duration}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6 font-semibold text-gray-400">
                      <div className="flex items-center gap-1.5">
                        <User size={12} className="text-gray-600" />
                        <span>{track.username}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-none text-[8px] font-mono tracking-wider uppercase ${
                          track.modelSource === 'runninghub'
                            ? 'bg-[#00bfff]/10 text-[#00bfff] border border-[#00bfff]/20'
                            : track.modelSource === 'local'
                            ? 'bg-[#00ff9d]/10 text-[#00ff9d] border border-[#00ff9d]/20'
                            : 'bg-gray-800/10 text-gray-500 border border-gray-800'
                        }`}
                      >
                        {track.modelSource === 'runninghub' ? (
                          <>
                            <Cpu size={10} />
                            <span>RunningHub API</span>
                          </>
                        ) : track.modelSource === 'local' ? (
                          <>
                            <HardDrive size={10} />
                            <span>本地模型 / LOCAL GPU</span>
                          </>
                        ) : (
                          <>
                            <Database size={10} />
                            <span>离线合成 / OFFLINE</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-xs text-gray-500">
                      <span>{formatDate(track.createdAt)}</span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => handleDeleteTrack(track.id, track.title)}
                        disabled={actionLoadingId === track.id}
                        className="text-red-400 hover:text-red-300 hover:bg-red-950/20 border border-transparent hover:border-red-500/20 rounded-none p-1.5 transition-all duration-300 cursor-pointer disabled:opacity-50"
                        title="删除记录"
                      >
                        {actionLoadingId === track.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
