
import React, { useEffect } from "react";

const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onFinish, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-blue-700 via-blue-600 to-blue-800 text-white z-50">
      <div className="animate-[bounce_2s_infinite] mb-6 relative">
         <div className="absolute inset-0 bg-white/20 rounded-full blur-xl animate-pulse"></div>
        <div className="w-28 h-28 bg-white rounded-2xl flex items-center justify-center shadow-2xl relative z-10 transform rotate-3 hover:rotate-6 transition-transform">
          <i className="fa-solid fa-sack-dollar text-blue-600 text-6xl"></i>
        </div>
      </div>
      <h1 className="text-5xl font-bold tracking-tight mb-2 drop-shadow-lg text-transparent bg-clip-text bg-gradient-to-r from-white to-blue-200">
        SM EARN
      </h1>
      <div className="bg-orange-500 text-white px-4 py-1 rounded-full text-sm font-medium shadow-lg transform -skew-x-12 mb-4">
        Sab Milega,Trust Me
      </div>
      
      <div className="absolute bottom-12 w-64 h-2 bg-blue-900/50 rounded-full overflow-hidden backdrop-blur-sm">
        <div className="h-full bg-orange-400 animate-[width_3s_ease-out] w-full origin-left shadow-[0_0_10px_rgba(251,146,60,0.8)]"></div>
      </div>
    </div>
  );
};

export default SplashScreen;