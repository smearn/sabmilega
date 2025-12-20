import React, { useEffect } from "react";
import { ToastType } from "../../types";

export const Toast = ({ message, type, onClose }: { message: string, type: ToastType, onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const styles = {
    success: { bg: 'bg-slate-900', icon: '✅', text: 'text-green-400' },
    error: { bg: 'bg-slate-900', icon: '❌', text: 'text-red-400' },
    info: { bg: 'bg-slate-900', icon: 'ℹ️', text: 'text-blue-400' }
  };

  const style = styles[type];

  return (
    <div className={`fixed bottom-20 left-1/2 transform -translate-x-1/2 z-[100] flex items-center gap-3 px-6 py-3.5 rounded-2xl shadow-2xl ${style.bg} border border-slate-800 animate-[slide-up_0.3s_ease-out] min-w-[300px]`}>
      <span className="text-lg">{style.icon}</span>
      <span className={`font-bold text-sm text-white`}>{message}</span>
    </div>
  );
};