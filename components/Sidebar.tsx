
import React, { useState } from "react";
import { UserProfile } from "../types";
import { ConfirmModal } from "./Shared/ConfirmModal";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../i18n";
import { update, ref } from "firebase/database";
import { db } from "../firebase";

const Sidebar = ({ isOpen, onClose, user, onLogout, onViewProfile, onAdmin, onRules, theme, toggleTheme }: any) => {
  const { t, i18n } = useTranslation();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showLanguageOptions, setShowLanguageOptions] = useState(false);

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    onLogout();
    setShowLogoutConfirm(false);
  };

  const handleChangeLanguage = async (code: string) => {
      i18n.changeLanguage(code);
      // Update Firebase preference
      try {
          await update(ref(db, `users/${user.uid}`), { language: code });
      } catch(e) { console.error("Lang sync fail", e); }
      setShowLanguageOptions(false);
  };

  const isPrivileged = user.username === 'admin' || user.username === 'superadmin' || user.username === '@admin' || user.username === '@superadmin';

  return (
    <>
      {/* Backdrop z-index increased */}
      {isOpen && <div className="fixed inset-0 bg-black/60 z-[140] backdrop-blur-sm" onClick={onClose}></div>}
      
      {/* Sidebar z-index increased to 150 to cover BottomNav (usually 100) */}
      <div className={`fixed top-0 left-0 h-full w-72 bg-white dark:bg-slate-900 z-[150] shadow-2xl transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col">
           {/* Header */}
           <div className={`p-6 pt-12 text-white ${user.username === 'superadmin' ? 'bg-gradient-to-r from-slate-900 to-slate-800' : 'bg-gradient-to-r from-blue-600 to-blue-800'}`}>
              <div className="flex items-center gap-4 mb-4">
                 <div className="w-16 h-16 bg-white rounded-full p-1 shadow-lg overflow-hidden">
                    <img src={user.profilePic || "https://api.dicebear.com/7.x/avataaars/svg?seed=" + user.username} className="w-full h-full rounded-full object-cover" alt="Profile" />
                 </div>
                 <div>
                    <h3 className="font-semibold text-lg truncate w-40">{user.username === 'superadmin' ? 'Super Admin' : user.name}</h3>
                    <p className="text-blue-200 text-sm">{user.phoneNumber || "No Phone"}</p>
                 </div>
              </div>
              
              <div className="flex items-center justify-between mt-4 bg-white/10 rounded-lg p-2 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                      <i className="fa-solid fa-crosshairs text-orange-400"></i>
                      <div>
                          <p className="text-[10px] text-blue-200 uppercase font-medium">Total Kills</p>
                          <p className="font-semibold text-white text-sm leading-none">{user.totalKills || 0}</p>
                      </div>
                  </div>
                  {user.socialLink && (
                      <a href={user.socialLink} target="_blank" rel="noopener noreferrer" className="w-8 h-8 bg-white text-blue-600 rounded-full flex items-center justify-center hover:scale-110 transition shadow-sm">
                          <i className="fa-solid fa-link"></i>
                      </a>
                  )}
              </div>
           </div>

           {/* Menu */}
           <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <button onClick={() => { onViewProfile(); onClose(); }} className="w-full flex items-center p-3 rounded-xl hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium transition">
                 <i className="fa-solid fa-user w-8 text-blue-500"></i> {t('profile')}
              </button>
              
              <div className="relative">
                  <button onClick={() => setShowLanguageOptions(!showLanguageOptions)} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium transition">
                     <div className="flex items-center">
                        <i className="fa-solid fa-language w-8 text-blue-500"></i> {t('language')}
                     </div>
                     <i className={`fa-solid fa-chevron-down transition-transform ${showLanguageOptions ? 'rotate-180' : ''} text-xs text-slate-400`}></i>
                  </button>
                  {showLanguageOptions && (
                      <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-2 mx-3 border border-slate-100 dark:border-slate-700 grid grid-cols-2 gap-2 animate-[fade-enter_0.2s]">
                          {LANGUAGES.map(l => (
                              <button 
                                key={l.code} 
                                onClick={() => handleChangeLanguage(l.code)}
                                className={`text-xs p-2 rounded-lg text-left ${i18n.language === l.code ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                              >
                                  {l.name}
                              </button>
                          ))}
                      </div>
                  )}
              </div>

              <button onClick={() => { onRules(); onClose(); }} className="w-full flex items-center p-3 rounded-xl hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium transition">
                 <i className="fa-solid fa-file-contract w-8 text-blue-500"></i> Rules & Terms
              </button>
              
              <button onClick={toggleTheme} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium transition cursor-pointer">
                 <div className="flex items-center">
                    <i className={`fa-solid ${theme === 'dark' ? 'fa-moon' : 'fa-sun'} w-8 ${theme === 'dark' ? 'text-blue-400' : 'text-orange-500'}`}></i> 
                    {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                 </div>
                 <div className={`w-10 h-5 rounded-full relative transition-colors ${theme === 'dark' ? 'bg-blue-600' : 'bg-slate-300'}`}>
                     <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${theme === 'dark' ? 'left-6' : 'left-1'}`}></div>
                 </div>
              </button>
              
              {isPrivileged && (
                  <>
                  <button onClick={() => { onAdmin(); onClose(); }} className="w-full flex items-center p-3 rounded-xl bg-orange-50 dark:bg-orange-900/30 hover:bg-orange-100 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-400 font-medium transition mt-4">
                    <i className="fa-solid fa-shield-halved w-8"></i> {user.username === 'superadmin' ? 'Super Admin Panel' : 'Admin Panel'}
                  </button>
                  </>
              )}
           </div>

           {/* Footer */}
           <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
              <button onClick={handleLogoutClick} className="w-full flex items-center p-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 font-medium transition">
                 <i className="fa-solid fa-right-from-bracket w-8"></i> {t('logout')}
              </button>
           </div>
        </div>
      </div>

      {showLogoutConfirm && (
        <ConfirmModal 
          title="Logout?"
          message="Are you sure you want to sign out of your account?"
          onConfirm={confirmLogout}
          onCancel={() => setShowLogoutConfirm(false)}
          confirmText="Logout"
          isDangerous={true}
        />
      )}
    </>
  );
};

export default Sidebar;
