import React from "react";

export const LoadingOverlay = ({ message = "Loading..." }: { message?: string }) => {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-md text-white animate-[fade-enter_0.2s]">
      <div className="animate-[bounce_2s_infinite] mb-6 relative">
         <div className="absolute inset-0 bg-blue-500/30 rounded-full blur-xl animate-pulse"></div>
        <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-2xl relative z-10 transform rotate-3">
          <i className="fa-solid fa-sack-dollar text-blue-600 text-4xl"></i>
        </div>
      </div>
      <h3 className="text-xl font-bold tracking-tight animate-pulse">{message}</h3>
      <div className="mt-4 flex gap-1">
        <div className="w-2 h-2 bg-blue-400 rounded-full animate-[bounce_1s_infinite_0ms]"></div>
        <div className="w-2 h-2 bg-blue-400 rounded-full animate-[bounce_1s_infinite_100ms]"></div>
        <div className="w-2 h-2 bg-blue-400 rounded-full animate-[bounce_1s_infinite_200ms]"></div>
      </div>
    </div>
  );
};