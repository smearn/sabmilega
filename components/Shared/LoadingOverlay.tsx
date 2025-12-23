
import React from "react";

export const LoadingOverlay = ({ message = "SM EARN" }: { message?: string }) => {
  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm animate-[fade-enter_0.2s]">
      <div className="relative group">
        {/* Glow effect */}
        <div className="absolute inset-0 bg-blue-500/30 rounded-full blur-2xl animate-pulse"></div>
        
        {/* App Icon */}
        <div className="w-24 h-24 bg-white dark:bg-slate-900 rounded-3xl flex items-center justify-center shadow-2xl relative z-10 transform animate-[bounce_2s_infinite]">
          <i className="fa-solid fa-sack-dollar text-blue-600 dark:text-blue-400 text-5xl"></i>
        </div>
      </div>

      <div className="mt-6 text-center relative z-10">
        <h3 className="text-xl font-black tracking-[0.2em] text-white uppercase drop-shadow-lg shadow-black">
          {message}
        </h3>
      </div>
    </div>
  );
};
