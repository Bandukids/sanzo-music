import React, { useState } from 'react';
import { User, Lock, Music, ArrowRight } from 'lucide-react';
import { User as UserType } from '../types';

interface AuthScreenProps {
  onLoginSuccess: (user: UserType) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码 / PLEASE ENTER CREDENTIALS');
      return;
    }

    setError('');
    setLoading(true);

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '请求失败 / REQUEST FAILED');
      }

      if (isLogin) {
        onLoginSuccess(data.user);
      } else {
        // Auto-login after successful registration
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password })
        });
        const loginData = await loginRes.json();
        if (loginRes.ok) {
          onLoginSuccess(loginData.user);
        } else {
          setIsLogin(true);
          setError('注册成功，请登录 / REGISTERED SUCCESS, PLEASE LOGIN');
        }
      }
    } catch (err: any) {
      setError(err.message || '连接服务器失败 / SERVER CONNECTION FAILED');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#050505] p-4 relative overflow-hidden select-none">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-[#00ff9d]/5 blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[300px] h-[300px] rounded-full bg-[#00e1ff]/5 blur-[100px]" />

      <div className="w-full max-w-sm z-10">
        {/* Logo and title */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-12 h-12 bg-[#00ff9d] flex items-center justify-center shadow-lg shadow-[#00ff9d]/10 mb-4 rounded-none">
            <Music size={22} className="text-black stroke-[2.5]" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-[0.2em] font-sans">SANZO MUSIC</h1>
          <p className="text-[9px] text-gray-600 tracking-[0.3em] uppercase mt-2 opacity-80">
            三生幻域智能音乐工坊 / PROD. BY SANSHENG HUANYU
          </p>
        </div>

        {/* Card wrapper */}
        <div className="bg-[#0c0c0c]/80 border border-[#121212] rounded-none p-8 backdrop-blur-md shadow-2xl relative">
          <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#00ff9d]/25 to-transparent" />
          
          <h2 className="text-xs font-sans font-bold tracking-[0.25em] text-white uppercase mb-8 border-b border-[#121212] pb-4">
            {isLogin ? '登录账户 / LOGIN USER' : '注册账户 / REGISTER USER'}
          </h2>

          {error && (
            <div className="mb-6 p-3 bg-red-950/10 border border-red-500/20 text-red-400 text-[10px] font-sans tracking-wider uppercase font-bold rounded-none">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Username Input */}
            <div className="space-y-2">
              <label className="text-[9px] font-sans font-bold text-gray-500 tracking-[0.2em] uppercase block">
                用户名 / USERNAME
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-600">
                  <User size={14} />
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="USERNAME"
                  className="w-full bg-[#080808]/80 border border-[#1b1b1b] rounded-none py-3 pl-10 pr-4 text-xs font-mono tracking-widest text-white placeholder-gray-700 focus:outline-none focus:border-[#00ff9d] transition-all duration-300"
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <label className="text-[9px] font-sans font-bold text-gray-500 tracking-[0.2em] uppercase block">
                密码 / PASSWORD
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-600">
                  <Lock size={14} />
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="PASSWORD"
                  className="w-full bg-[#080808]/80 border border-[#1b1b1b] rounded-none py-3 pl-10 pr-4 text-xs font-mono tracking-widest text-white placeholder-gray-700 focus:outline-none focus:border-[#00ff9d] transition-all duration-300"
                  required
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#00ff9d] hover:bg-[#00ff9d]/90 hover:shadow-[0_0_20px_rgba(0,255,157,0.3)] active:scale-[0.98] text-black font-sans font-bold py-3.5 px-4 text-xs tracking-[0.2em] uppercase flex items-center justify-center gap-2 transition-all duration-300 rounded-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{isLogin ? '立即登录' : '立即注册'}</span>
                  <ArrowRight size={14} className="stroke-[2.5]" />
                </>
              )}
            </button>
          </form>

          {/* Toggle button */}
          <div className="mt-8 text-center border-t border-[#121212] pt-5">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setUsername('');
                setPassword('');
              }}
              className="text-[9px] font-sans font-bold tracking-[0.2em] text-gray-500 hover:text-[#00ff9d] uppercase transition-colors duration-300 cursor-pointer"
            >
              {isLogin ? '没有账户？创建新账户 / CREATE AN ACCOUNT' : '已有账户？返回登录 / ALREADY HAVE ACCOUNT'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
