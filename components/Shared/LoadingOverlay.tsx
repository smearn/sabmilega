
import React from "react";

export const LoadingOverlay = ({ message = "SM EARN" }: { message?: string }) => {
  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-transparent backdrop-blur-[2px] animate-[fade-enter_0.2s]">
      <div className="relative flex items-center justify-center">
        {/* Main Spinning Circle */}
        <div className="absolute w-32 h-32 border-4 border-blue-500/10 border-t-blue-600 rounded-full animate-spin"></div>
        
        {/* App Icon in center */}
        <div className="w-20 h-20 bg-white dark:bg-slate-900 rounded-2xl flex items-center justify-center shadow-2xl relative z-10 animate-[pulse_2s_infinite]">
          <i className="fa-solid fa-sack-dollar text-blue-600 dark:text-blue-400 text-4xl"></i>
        </div>
      </div>

      <div className="mt-8 text-center relative z-10">
        <h3 className="text-sm font-black tracking-[0.3em] text-slate-800 dark:text-white uppercase drop-shadow-md">
          {message}
        </h3>
        <p className="text-[10px] font-bold text-blue-500 mt-2 animate-pulse uppercase tracking-widest">Initialising...</p>
      </div>
    </div>
  );
};
