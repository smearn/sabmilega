import React, { useState } from "react";

export const ValidatedInput = ({ 
  label, 
  type = "text", 
  value, 
  onChange, 
  placeholder, 
  icon,
  validator,
  errorMessage,
  required = false,
  maxLength
}: { 
  label: string, 
  type?: string, 
  value: string, 
  onChange: (val: string) => void, 
  placeholder?: string, 
  icon?: string,
  validator?: (val: string) => boolean,
  errorMessage?: string,
  required?: boolean,
  maxLength?: number
}) => {
  const [touched, setTouched] = useState(false);
  const isValid = validator ? validator(value) : true;
  const showSuccess = touched && value.length > 0 && isValid;
  const showError = touched && ((required && value.length === 0) || !isValid);

  return (
    <div className="mb-4">
      <label className="block text-sm font-semibold text-slate-700 mb-1">{label}</label>
      <div className="relative">
        {icon && (
          <div className={`absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none transition-colors ${showError ? 'text-red-500' : showSuccess ? 'text-green-500' : 'text-slate-400'}`}>
            <i className={`fa-solid ${icon}`}></i>
          </div>
        )}
        <input
          type={type}
          value={value}
          maxLength={maxLength}
          onChange={(e) => {
            onChange(e.target.value);
            if (!touched) setTouched(true);
          }}
          onBlur={() => setTouched(true)}
          className={`w-full bg-white text-slate-900 border-2 text-sm rounded-xl focus:ring-0 block p-3 ${icon ? 'pl-10' : ''} transition-all duration-200 outline-none
            ${showError 
              ? 'border-red-500 focus:border-red-600 bg-red-50' 
              : showSuccess 
                ? 'border-green-500 focus:border-green-600 bg-green-50' 
                : 'border-slate-200 focus:border-blue-500'
            }`}
          placeholder={placeholder}
        />
        {showError && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-red-500">
            <i className="fa-solid fa-circle-exclamation"></i>
          </div>
        )}
        {showSuccess && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-green-500">
            <i className="fa-solid fa-circle-check"></i>
          </div>
        )}
      </div>
      {showError && (
        <p className="mt-1 text-xs text-red-500 font-medium animate-pulse">
          {value.length === 0 && required ? `${label} is required` : errorMessage}
        </p>
      )}
    </div>
  );
};