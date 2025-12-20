
import React, { useState, useEffect } from "react";
import { createUserWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { ref, get, update, push, set } from "firebase/database";
import { auth, db, googleProvider } from "../../firebase";
import { Screen, ToastType, UserProfile } from "../../types";
import { generateReferralCode, updateSystemWallet } from "../../utils";
import { LoadingOverlay } from "../Shared/LoadingOverlay";
import { LANGUAGES } from "../../i18n";
import { useTranslation } from "react-i18next";

// Moved outside to prevent re-mounting on state change
const InputField = ({ label, value, onChange, type="text", icon, placeholder, maxLength }: any) => (
    <div className="mb-3">
        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 mb-0.5 block">{label}</label>
        <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className={`fa-solid ${icon} text-slate-500 text-xs group-focus-within:text-blue-500 transition-colors`}></i>
            </div>
            <input 
                type={type} 
                value={value} 
                onChange={e => onChange(e.target.value)} 
                maxLength={maxLength}
                placeholder={placeholder}
                className="w-full pl-8 pr-3 py-2.5 bg-slate-800 border border-slate-700 focus:bg-slate-800 focus:border-blue-500 rounded-xl outline-none font-bold text-xs text-white placeholder-slate-600 transition-all shadow-sm"
            />
        </div>
    </div>
);

const RegisterScreen = ({ onNavigate, showToast }: { onNavigate: (s: Screen) => void, showToast: (m: string, t: ToastType) => void }) => {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState({ name: "", username: "", email: "", phone: "", password: "", referral: "" });
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [loading, setLoading] = useState(false);

  // Auto-detect Language/Region on Mount
  useEffect(() => {
      const detectLanguage = () => {
          // 1. Check Browser Language
          const browserLang = navigator.language.split('-')[0];
          
          // 2. Check Timezone for India context
          const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const isIndia = timeZone === 'Asia/Kolkata';

          // Prioritize Hindi if India and browser is Hindi, otherwise default to English or browser match
          if (isIndia && browserLang === 'hi') {
              return 'hi';
          }
          
          // Check if browser lang is supported
          const supported = LANGUAGES.find(l => l.code === browserLang);
          return supported ? browserLang : 'en';
      };

      const detected = detectLanguage();
      setSelectedLanguage(detected);
      i18n.changeLanguage(detected); // Preview change
  }, []);

  // Handle Language Change manually
  const handleLanguageChange = (code: string) => {
      setSelectedLanguage(code);
      i18n.changeLanguage(code);
  };

  // Validators
  const phoneValidator = (v: string) => /^[6-9]\d{9}$/.test(v); 
  const usernameValidator = (v: string) => /^[a-zA-Z0-9_]{3,20}$/.test(v.replace('@',''));
  const emailValidator = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const handleGoogleFetch = async () => {
      setLoading(true);
      try {
          const result = await signInWithPopup(auth, googleProvider);
          const user = result.user;
          
          // Check if user already has an account
          const snap = await get(ref(db, `users/${user.uid}`));
          if (snap.exists()) {
              // User exists, just stay logged in
              showToast("Account exists! Logging in...", "success");
              // App.tsx will handle navigation to Main
          } else {
              // New user: Pre-fill form and sign out so they can create account manually
              setForm(prev => ({
                  ...prev,
                  name: user.displayName || "",
                  email: user.email || "",
              }));
              
              await signOut(auth);
              showToast("Details fetched from Google! Please complete the form.", "success");
          }
      } catch (e: any) {
          showToast("Failed to fetch details", "error");
      } finally {
          setLoading(false);
      }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Trim Inputs
    const cleanName = form.name.trim();
    const cleanUsername = form.username.trim();
    const cleanEmail = form.email.trim();
    const cleanPhone = form.phone.trim().replace(/\D/g,'');
    const cleanReferral = form.referral.trim().toUpperCase();

    if (!cleanName || !cleanUsername || !cleanEmail || !form.password || !cleanPhone) {
        showToast("Please fill all required fields", "error");
        return;
    }
    if (!phoneValidator(cleanPhone)) {
        showToast("Invalid Indian Phone Number", "error");
        return;
    }
    setLoading(true);

    try {
      const usersRef = ref(db, 'users');
      const snapshot = await get(usersRef);
      let usernameTaken = false;
      let phoneTaken = false;
      let referrerId: string | null = null;
      const targetUsername = cleanUsername.startsWith('@') ? cleanUsername : '@' + cleanUsername;

      if (snapshot.exists()) {
        const users = snapshot.val();
        Object.values(users).forEach((u: any) => {
          if (u.username && u.username.toLowerCase() === targetUsername.toLowerCase()) usernameTaken = true;
          if (u.phoneNumber === cleanPhone) phoneTaken = true;
          if (cleanReferral && u.referralCode === cleanReferral) referrerId = u.uid;
        });
      }

      if (usernameTaken) throw new Error("Username already taken.");
      if (phoneTaken) throw new Error("Phone number already registered.");
      if (cleanReferral && !referrerId) throw new Error("Invalid referral code.");

      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, form.password);
      const initialWallet = { added: 5, winning: 0 }; 

      // System Finance: Deduct Welcome Bonus (5) from System
      await updateSystemWallet(-5, "User Registration Bonus");

      if (referrerId) {
          initialWallet.added += 5;
          const referrerRefSnap = await get(ref(db, `users/${referrerId}/wallet`));
          const currentReferrerWallet = referrerRefSnap.val() || { added: 0, winning: 0 };
          await update(ref(db, `users/${referrerId}/wallet`), { added: currentReferrerWallet.added + 5 });
          await push(ref(db, `transactions/${referrerId}`), { type: 'bonus', amount: 5, date: Date.now(), details: 'Referral Bonus', category: 'added' });
          
          // System Finance: Deduct Referral Bonus (5) from System
          await updateSystemWallet(-5, "Referral Bonus");
      }

      const newUser: UserProfile = {
        uid: cred.user.uid,
        name: cleanName,
        username: targetUsername,
        email: cleanEmail,
        phoneNumber: cleanPhone,
        wallet: initialWallet,
        language: selectedLanguage, // Save language preference
        referralCode: generateReferralCode(targetUsername),
        joinedAt: Date.now()
      };
      
      if (referrerId) {
          newUser.referredBy = referrerId;
          newUser.redeemedCode = cleanReferral; // Save the redeemed code
      }

      // Write to DB
      await set(ref(db, 'users/' + cred.user.uid), newUser);
      await push(ref(db, `transactions/${cred.user.uid}`), { type: 'bonus', amount: initialWallet.added, date: Date.now(), details: 'Welcome Bonus', category: 'added' });

      showToast("Account created successfully!", "success");
      // App.tsx auth listener handles navigation after DB write is detected by retry logic
    } catch (e: any) {
      if(e.code === 'auth/email-already-in-use') showToast("Email already in use", "error");
      else showToast(e.message, "error");
      setLoading(false); // Only stop loading on error, otherwise let App.tsx handle transition
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 relative overflow-hidden">
      {loading && <LoadingOverlay message="Processing..." />}
      
      {/* Decorative BG */}
      <div className="absolute top-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl translate-x-1/3 translate-y-1/3"></div>

      <div className="max-w-sm w-full bg-slate-900/80 backdrop-blur-xl rounded-[2rem] shadow-2xl p-6 relative z-10 border border-slate-800 animate-[fade-enter_0.5s_ease-out]">
        <div className="text-center mb-6">
           <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl mx-auto flex items-center justify-center shadow-lg shadow-blue-500/30 mb-3 transform rotate-6">
              <i className="fa-solid fa-user-plus text-white text-lg"></i>
           </div>
           <h2 className="text-2xl font-extrabold text-white">{t('register')}</h2>
           <p className="text-slate-400 font-medium text-xs">Create your account to start winning</p>
        </div>
        
        <button 
            type="button" 
            onClick={handleGoogleFetch}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 font-bold py-3 rounded-xl mb-4 flex items-center justify-center gap-2 hover:bg-slate-700 transition shadow-sm"
        >
            <i className="fa-brands fa-google text-red-500 text-lg"></i> Fetch email from Google
        </button>

        <div className="flex items-center gap-2 mb-4 opacity-50">
            <div className="h-[1px] bg-slate-700 flex-1"></div>
            <span className="text-[10px] font-bold text-slate-500">OR MANUAL</span>
            <div className="h-[1px] bg-slate-700 flex-1"></div>
        </div>
        
        <form onSubmit={handleRegister}>
            <div className="mb-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 mb-0.5 block">{t('select_language')}</label>
                <div className="relative">
                    <select 
                        value={selectedLanguage}
                        onChange={(e) => handleLanguageChange(e.target.value)}
                        className="w-full pl-3 pr-8 py-2.5 bg-slate-800 border border-slate-700 focus:bg-slate-800 focus:border-blue-500 rounded-xl outline-none font-bold text-xs text-white appearance-none"
                    >
                        {LANGUAGES.map(l => (
                            <option key={l.code} value={l.code}>{l.name}</option>
                        ))}
                    </select>
                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-400">
                        <i className="fa-solid fa-caret-down text-xs"></i>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <InputField label="Name" value={form.name} onChange={(v:any) => setForm({...form, name: v})} icon="fa-id-card" maxLength={30} />
                <InputField label="Username" value={form.username} onChange={(v:any) => setForm({...form, username: v})} icon="fa-at" maxLength={15} />
            </div>
            <InputField label="Email" value={form.email} onChange={(v:any) => setForm({...form, email: v})} icon="fa-envelope" type="email" />
            <InputField label="Phone" value={form.phone} onChange={(v:any) => setForm({...form, phone: v.replace(/\D/g,'')})} icon="fa-phone" type="tel" maxLength={10} placeholder="10-digit number" />
            <InputField label="Password" value={form.password} onChange={(v:any) => setForm({...form, password: v})} icon="fa-lock" type="password" />
            
            <div className="mt-2 mb-5">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 mb-0.5 block">Referral Code (Optional)</label>
                <div className="relative">
                    <input 
                        value={form.referral}
                        onChange={e => setForm({...form, referral: e.target.value})}
                        placeholder="Enter code"
                        className="w-full py-2 px-3 bg-orange-900/20 border-dashed border border-orange-500/50 rounded-xl text-orange-400 font-mono font-bold text-xs text-center outline-none focus:border-orange-500 transition-colors uppercase"
                        maxLength={10}
                    />
                </div>
            </div>
            
            <button type="submit" disabled={loading} className="w-full text-white bg-slate-100 hover:bg-white text-slate-900 shadow-xl font-bold rounded-xl text-sm px-5 py-3 transition-all transform active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2">
                {t('register')} <i className="fa-solid fa-arrow-right"></i>
            </button>
        </form>
        <div className="mt-6 text-center">
            <p className="text-slate-500 font-bold text-xs">Already a member?</p>
            <button onClick={() => onNavigate('login')} className="text-blue-500 font-extrabold hover:underline text-xs">{t('login')} Here</button>
        </div>
      </div>
    </div>
  );
};

export default RegisterScreen;
