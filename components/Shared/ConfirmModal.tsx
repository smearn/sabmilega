import React from "react";

export const ConfirmModal = ({ title, message, onConfirm, onCancel, confirmText = "Confirm", cancelText = "Cancel", isDangerous = false }: any) => {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fade-enter_0.2s]">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl scale-100">
        <h3 className="text-xl font-bold text-slate-800 mb-2">{title}</h3>
        <p className="text-slate-500 mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition">
            {cancelText}
          </button>
          <button onClick={onConfirm} className={`flex-1 py-3 font-bold text-white rounded-xl shadow-lg transition ${isDangerous ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30'}`}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
