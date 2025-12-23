
import React from "react";
import { Tab, UserProfile } from "../../types";
import { PullToRefresh } from "../Shared/PullToRefresh";
import { useTranslation } from "react-i18next";

const HomeScreen = ({ user, setTab, onRefresh, onSelectGame }: { user: UserProfile, setTab: (t: Tab) => void, onRefresh: () => Promise<void>, onSelectGame: (id: string) => void }) => {
  const { t } = useTranslation();

  return (
    <div className="pb-24 pt-20 px-4 h-full">
       <PullToRefresh onRefresh={onRefresh}>
       {/* Slider */}
       <div className="w-full h-40 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl shadow-lg mb-6 relative overflow-hidden group">
          <div className="absolute inset-0 flex items-center justify-center text-white text-center p-4">
             <div>
               <h2 className="text-2xl font-bold mb-1">{t('mega_tournament')}</h2>
               <p className="text-sm opacity-90 font-medium">{t('join_ff')}</p>
               <button onClick={() => onSelectGame('FREE FIRE')} className="mt-3 px-4 py-1 bg-white text-purple-600 rounded-full text-xs font-semibold shadow hover:scale-105 transition">{t('play_now')}</button>
             </div>
          </div>
          {/* Decorative circles */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/20 rounded-full"></div>
          <div className="absolute top-20 -left-10 w-24 h-24 bg-white/10 rounded-full"></div>
       </div>

       {/* Game Grid */}
       <h3 className="font-semibold text-slate-800 text-lg mb-4 flex items-center gap-2">
          <i className="fa-solid fa-gamepad text-orange-500"></i> {t('popular_games')}
       </h3>
       
       <div className="grid grid-cols-2 gap-4">
          {/* Free Fire - Main Focus */}
          <div onClick={() => onSelectGame('FREE FIRE')} className="col-span-2 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-4 shadow-xl relative overflow-hidden cursor-pointer hover:scale-[1.02] transition active:scale-95">
             <div className="absolute right-0 top-0 w-32 h-full bg-orange-500/20 transform skew-x-12"></div>
             <div className="flex justify-between items-center relative z-10">
                <div>
                  <span className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded font-medium uppercase tracking-wider">{t('live')}</span>
                  <h4 className="text-white font-bold text-xl mt-1">Free Fire</h4>
                  <p className="text-slate-400 text-xs mt-1 font-normal">Squad vs Squad • Bermuda</p>
                  <div className="mt-3 flex items-center gap-2">
                     <span className="text-green-400 font-semibold text-sm">{t('win_cash')}</span>
                     <span className="text-slate-500 text-xs">|</span>
                     <span className="text-slate-300 text-xs">{t('daily_matches')}</span>
                  </div>
                </div>
                <div className="w-16 h-16 bg-white/10 rounded-xl flex items-center justify-center">
                    <i className="fa-solid fa-skull-crossbones text-3xl text-orange-500"></i>
                </div>
             </div>
          </div>

          {/* Tic Tac Toe */}
          <div onClick={() => onSelectGame('TICTACTOE')} className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-md flex flex-col items-center justify-center gap-2 cursor-pointer hover:scale-105 transition active:scale-95 border border-slate-100 dark:border-slate-700 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-bl-full"></div>
             <i className="fa-solid fa-xmarks-lines text-blue-500 text-3xl z-10"></i>
             <span className="font-bold text-slate-700 dark:text-white text-sm z-10">Tic Tac Toe</span>
             <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded font-bold z-10">{t('play_now')}</span>
          </div>
          
          {/* Bingo (Replaced Ludo) */}
          <div onClick={() => onSelectGame('BINGO')} className="bg-gradient-to-br from-purple-100 to-pink-100 dark:from-slate-800 dark:to-slate-800 rounded-2xl p-4 shadow-md flex flex-col items-center justify-center gap-2 cursor-pointer hover:scale-105 transition active:scale-95 border border-purple-200 dark:border-slate-700 relative overflow-hidden group">
             <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition"></div>
             <i className="fa-solid fa-table-cells text-purple-600 text-3xl z-10"></i>
             <span className="font-bold text-slate-800 dark:text-white text-sm z-10">Bingo</span>
             <span className="text-[10px] bg-purple-500 text-white px-2 py-0.5 rounded font-bold z-10 shadow-sm shadow-purple-500/30">HOT 🔥</span>
          </div>
       </div>
       </PullToRefresh>
    </div>
  );
};

export default HomeScreen;
