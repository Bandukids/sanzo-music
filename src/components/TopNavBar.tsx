import React, { useState } from 'react';
import { Screen, User } from '../types';
import { User as UserIcon, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TopNavBarProps {
  currentScreen: Screen;
  setScreen: (screen: Screen) => void;
  currentUser: User | null;
  onLogout: () => void;
  onRequestLogin: () => void;
}

export const TopNavBar: React.FC<TopNavBarProps> = ({ currentScreen, setScreen, currentUser, onLogout, onRequestLogin }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleLinkClick = (screen: Screen) => {
    setScreen(screen);
    setIsOpen(false);
  };

  return (
    <nav className="fixed top-0 left-0 w-full z-50 bg-[#050505]/80 backdrop-blur-md border-b border-[#121212]">
      <div className="flex justify-between items-center px-4 md:px-12 h-16 w-full">
        {/* Logo Group */}
        <div className="flex items-center gap-4 select-none cursor-pointer" onClick={() => handleLinkClick('home')}>
          <div className="font-sans font-black text-2xl tracking-tighter text-white">SANZO</div>
          <div className="hidden lg:block text-[9px] text-gray-500 tracking-[0.3em] uppercase opacity-80">
            三生幻域工作室出品 / Prod. by Sansheng Huanyu
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <div className="hidden md:flex gap-8">
          <a
            id="nav-link-inspiration"
            onClick={(e) => {
              e.preventDefault();
              handleLinkClick('home');
            }}
            className={`cursor-pointer text-xs font-semibold uppercase tracking-widest pb-1 transition-all duration-200 border-b-2 ${
              currentScreen === 'home'
                ? 'text-white border-[#00ff9d]'
                : 'text-gray-400 border-transparent hover:text-[#00ff9d]'
            }`}
            href="#"
          >
            灵感捕捉 / INSPIRATION
          </a>

          <a
            id="nav-link-studio"
            onClick={(e) => {
              e.preventDefault();
              handleLinkClick('studio');
            }}
            className={`cursor-pointer text-xs font-semibold uppercase tracking-widest pb-1 transition-all duration-200 border-b-2 ${
              currentScreen === 'studio'
                ? 'text-white border-[#00ff9d]'
                : 'text-gray-400 border-transparent hover:text-[#00ff9d]'
            }`}
            href="#"
          >
            声音工坊 / STUDIO
          </a>

          <a
            id="nav-link-treasury"
            onClick={(e) => {
              e.preventDefault();
              handleLinkClick('treasury');
            }}
            className={`cursor-pointer text-xs font-semibold uppercase tracking-widest pb-1 transition-all duration-200 border-b-2 ${
              currentScreen === 'treasury'
                ? 'text-white border-[#00ff9d]'
                : 'text-gray-400 border-transparent hover:text-[#00ff9d]'
            }`}
            href="#"
          >
            个人宝藏库 / TREASURY
          </a>

          {currentUser?.role === 'admin' && (
            <a
              id="nav-link-admin"
              onClick={(e) => {
                e.preventDefault();
                handleLinkClick('admin');
              }}
              className={`cursor-pointer text-xs font-semibold uppercase tracking-widest pb-1 transition-all duration-200 border-b-2 ${
                currentScreen === 'admin'
                  ? 'text-white border-[#00ff9d]'
                  : 'text-gray-400 border-transparent hover:text-[#00ff9d]'
              }`}
              href="#"
            >
              用户管理 / ADMIN
            </a>
          )}

          <a
            id="nav-link-square"
            onClick={(e) => {
              e.preventDefault();
            }}
            className="cursor-pointer text-xs font-semibold uppercase tracking-widest pb-1 transition-all duration-200 border-b-2 text-gray-400 border-transparent hover:text-[#00ff9d] opacity-50"
            href="#"
          >
            声音广场 / SQUARE
          </a>
        </div>

        {/* User Info / Logout Button & Hamburger Toggle */}
        <div className="flex items-center gap-4">
          {currentUser ? (
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col items-end select-none">
                <span className="text-xs font-semibold text-white">{currentUser.username}</span>
                <span className="text-[9px] text-[#00ff9d] uppercase tracking-wider">{currentUser.role}</span>
              </div>
              <button
                onClick={onLogout}
                className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors duration-200 border border-red-500/20 hover:border-red-500/40 rounded px-2.5 py-1 bg-red-950/10 backdrop-blur cursor-pointer"
              >
                登出 / LOGOUT
              </button>
            </div>
          ) : (
            <button
              id="user-profile-btn"
              onClick={onRequestLogin}
              className="text-gray-400 hover:text-[#00ff9d] transition-colors duration-200 p-1 flex items-center justify-center rounded-full border border-transparent hover:border-[#00ff9d]/30 cursor-pointer"
              aria-label="User profile"
            >
              <UserIcon size={18} />
            </button>
          )}

          {/* Mobile Menu Hamburger Icon */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden text-gray-400 hover:text-[#00ff9d] transition-colors p-1 flex items-center justify-center cursor-pointer"
            aria-label="Toggle mobile menu"
          >
            {isOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden w-full bg-[#050505]/95 backdrop-blur-lg border-b border-[#121212] flex flex-col py-4 px-6 gap-4 select-none"
          >
            <a
              onClick={(e) => {
                e.preventDefault();
                handleLinkClick('home');
              }}
              className={`text-xs font-bold uppercase tracking-widest py-2 transition-all duration-200 ${
                currentScreen === 'home' ? 'text-[#00ff9d]' : 'text-gray-400 hover:text-[#00ff9d]'
              }`}
              href="#"
            >
              灵感捕捉 / INSPIRATION
            </a>

            <a
              onClick={(e) => {
                e.preventDefault();
                handleLinkClick('studio');
              }}
              className={`text-xs font-bold uppercase tracking-widest py-2 transition-all duration-200 ${
                currentScreen === 'studio' ? 'text-[#00ff9d]' : 'text-gray-400 hover:text-[#00ff9d]'
              }`}
              href="#"
            >
              声音工坊 / STUDIO
            </a>

            <a
              onClick={(e) => {
                e.preventDefault();
                handleLinkClick('treasury');
              }}
              className={`text-xs font-bold uppercase tracking-widest py-2 transition-all duration-200 ${
                currentScreen === 'treasury' ? 'text-[#00ff9d]' : 'text-gray-400 hover:text-[#00ff9d]'
              }`}
              href="#"
            >
              个人宝藏库 / TREASURY
            </a>

            {currentUser?.role === 'admin' && (
              <a
                onClick={(e) => {
                  e.preventDefault();
                  handleLinkClick('admin');
                }}
                className={`text-xs font-bold uppercase tracking-widest py-2 transition-all duration-200 ${
                  currentScreen === 'admin' ? 'text-[#00ff9d]' : 'text-gray-400 hover:text-[#00ff9d]'
                }`}
                href="#"
              >
                用户管理 / ADMIN
              </a>
            )}

            <a
              onClick={(e) => {
                e.preventDefault();
              }}
              className="text-xs font-bold uppercase tracking-widest py-2 text-gray-600 cursor-not-allowed opacity-50"
              href="#"
            >
              声音广场 / SQUARE
            </a>

            {currentUser && (
              <div className="border-t border-[#121212] pt-3 flex flex-col gap-1 select-none">
                <span className="text-[10px] text-gray-500">登录用户 / LOGGED IN AS:</span>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-white">{currentUser.username}</span>
                  <span className="text-[9px] text-[#00ff9d] uppercase tracking-wider font-semibold">{currentUser.role}</span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};
