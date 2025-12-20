
import React, { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { ref, get, update } from "firebase/database";
import { Analytics } from "@vercel/analytics/react";
import { auth, db } from "./firebase";
import { Screen, Tab, ToastType, UserProfile } from "./types";
import { generateReferralCode } from "./utils";
import i18n from "./i18n"; // Import i18n

import SplashScreen from "./components/SplashScreen";
import LoginScreen from "./components/Auth/LoginScreen";
import RegisterScreen from "./components/Auth/RegisterScreen";
import Sidebar from "./components/Sidebar";
import HomeScreen from "./components/Main/HomeScreen";
import WalletScreen from "./components/Main/WalletScreen";
import FriendsScreen from "./components/Main/FriendsScreen";
import ReferEarnScreen from "./components/Main/ReferEarnScreen";
import CreateTournamentScreen from "./components/Main/CreateTournamentScreen"; 
import GameDetailsScreen from "./components/Main/GameDetailsScreen";
import TicTacToeScreen from "./components/Main/TicTacToeScreen";
import AdminScreen from "./components/Admin/AdminScreen";
import ProfileEditScreen from "./components/ProfileEditScreen";
import { Toast } from "./components/Shared/Toast";
import { LoadingOverlay } from "./components/Shared/LoadingOverlay";

const App = () => {
  const [screen, setScreen] = useState<Screen>('splash');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  
  // Theme State - Default to Dark
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
      if (typeof window !== 'undefined') {
          const saved = localStorage.getItem('theme');
          if (saved === 'dark' || saved === 'light') return saved;
          return 'dark';
      }
      return 'dark';
  });

  // Navigation State
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [isHosting, setIsHosting] = useState(false); 
  const [hostViewMode, setHostViewMode] = useState<'manage' | 'create'>('create');

  // Auth Loading State
  const [authLoaded, setAuthLoaded] = useState(false);
  const [splashFinished, setSplashFinished] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(false);

  // Apply Theme
  useEffect(() => {
      if (theme === 'dark') {
          document.documentElement.classList.add('dark');
      } else {
          document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
      setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  const loadUserProfile = async (uid: string, userAuth: any) => {
    setGlobalLoading(true);
    try {
      let snap = await get(ref(db, `users/${uid}`));
      let attempts = 0;
      
      while (!snap.exists() && attempts < 3) {
          await new Promise(r => setTimeout(r, 1000));
          snap = await get(ref(db, `users/${uid}`));
          attempts++;
      }

      if(snap.exists()) {
           let data = snap.val();
           
           if (data.isBanned) {
               await signOut(auth);
               showToast("Your account has been banned.", "error");
               setGlobalLoading(false);
               return false;
           }

           if (!data.referralCode) {
               const newCode = generateReferralCode(data.username || "USER");
               await update(ref(db, `users/${uid}`), { referralCode: newCode });
               data.referralCode = newCode;
           }

           const safeProfile = {
              ...data,
              wallet: data.wallet || { added: 0, winning: 0, smCoins: 0 }
           };
           setUserProfile(safeProfile);
           
           // Set Language from Profile
           if (safeProfile.language) {
               i18n.changeLanguage(safeProfile.language);
           }

           setGlobalLoading(false);
           return true;
      } else {
           const creationTime = userAuth.metadata.creationTime ? new Date(userAuth.metadata.creationTime).getTime() : 0;
           const isNewUser = (Date.now() - creationTime) < 30000; 

           if (isNewUser) {
              setGlobalLoading(false);
              return false;
           } else {
              await signOut(auth);
              showToast("Account access restricted or deleted.", "error");
              setGlobalLoading(false);
              return false;
           }
      }
    } catch(e) {
      console.error(e);
      setGlobalLoading(false);
      return false;
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
       if(u) {
          await loadUserProfile(u.uid, u);
       } else {
          setUserProfile(null);
       }
       setAuthLoaded(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
      if (authLoaded && splashFinished) {
          if (userProfile) {
              setScreen('main');
          } else {
              setScreen(prev => (prev === 'splash' || prev === 'main') ? 'login' : prev);
          }
      }
  }, [authLoaded, splashFinished, userProfile]);

  const handleRefresh = async () => {
     if(auth.currentUser) {
         await loadUserProfile(auth.currentUser.uid, auth.currentUser);
         showToast("Data refreshed", "info");
     }
  };

  const finishSplash = () => {
      setSplashFinished(true);
  };

  const navigateToWallet = () => {
      setSelectedGame(null);
      setActiveTab('wallet');
  };

  const handleTabChange = (tab: Tab) => {
      setSelectedGame(null); 
      setIsHosting(false); 
      setShowAdmin(false); // Close Admin if open
      setShowProfileEdit(false); // Close Profile if open
      setActiveTab(tab);
  };

  if (screen === 'main' && userProfile && (userProfile.username === 'superadmin' || userProfile.username === '@superadmin')) {
      return (
          <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
              {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
              <AdminScreen 
                  onClose={() => signOut(auth)} 
                  isSuperAdminView={true} 
                  currentUser={userProfile}
                  showToast={showToast}
              />
          </div>
      );
  }

  const TopBar = () => {
    if (selectedGame) return null; 

    let title = "SM EARN";
    if (isHosting) title = "HOST MATCH";
    else if (activeTab === 'wallet') title = "WALLET";
    
    return (
      <div className={`fixed top-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 dark:border-slate-800 backdrop-blur-md z-30 px-4 py-3 shadow-sm flex items-center justify-between h-16 transition-all border-b`}>
         <div className="flex items-center gap-3">
            {isHosting ? (
                <button onClick={() => setIsHosting(false)} className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition active:scale-95 shadow-sm">
                    <i className="fa-solid fa-arrow-left text-lg"></i>
                </button>
            ) : (
                <button onClick={() => setSidebarOpen(true)} className={`w-10 h-10 rounded-full flex items-center justify-center hover:bg-opacity-80 transition active:scale-95 shadow-sm bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white`}>
                   <i className="fa-solid fa-bars-staggered text-lg"></i>
                </button>
            )}
            <span className={`font-semibold tracking-tight text-lg text-blue-700 dark:text-blue-400`}>{title}</span>
         </div>
         
         <div className="flex items-center gap-2">
             {isHosting ? (
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                    <button 
                      onClick={() => setHostViewMode('manage')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${hostViewMode === 'manage' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-400'}`}
                    >
                      MANAGE
                    </button>
                    <button 
                      onClick={() => setHostViewMode('create')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${hostViewMode === 'create' ? 'bg-white dark:bg-slate-700 text-orange-500 shadow-sm' : 'text-slate-400'}`}
                    >
                      CREATE
                    </button>
                </div>
             ) : (
                <button onClick={() => { setActiveTab('wallet'); setSelectedGame(null); setIsHosting(false); }} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border bg-blue-50 dark:bg-slate-800 border-blue-100 dark:border-slate-700 text-slate-800 dark:text-white`}>
                    <i className="fa-solid fa-wallet text-blue-600 dark:text-blue-400"></i>
                    <span className="font-medium text-sm">₹{userProfile ? (userProfile.wallet.added + userProfile.wallet.winning) : 0}</span>
                </button>
             )}
         </div>
      </div>
    );
  };

  const BottomBar = () => {
    return (
      <div className={`fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 px-6 py-2 flex justify-between items-center z-[100] pb-safe`}>
         {[
           { id: 'home', icon: 'fa-house', label: i18n.t('home') },
           { id: 'friends', icon: 'fa-user-group', label: i18n.t('friends') },
           { id: 'host', icon: 'fa-gamepad', label: 'Host', special: true }, 
           { id: 'wallet', icon: 'fa-wallet', label: i18n.t('wallet') },
           { id: 'refer', icon: 'fa-trophy', label: i18n.t('refer') },
         ].map((item: any) => (
           item.special ? (
              <button key={item.id} onClick={() => { setIsHosting(true); setSelectedGame(null); setShowAdmin(false); setShowProfileEdit(false); }} className={`relative -top-5 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg transform hover:scale-110 transition bg-orange-500 shadow-orange-500/40 ${isHosting ? 'ring-4 ring-orange-100 dark:ring-orange-900' : ''}`}>
                 <i className={`fa-solid ${item.icon} text-xl`}></i>
              </button>
           ) : (
              <button key={item.id} onClick={() => handleTabChange(item.id)} className={`flex flex-col items-center gap-1 ${activeTab === item.id && !isHosting && !selectedGame ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'} transition`}>
                 <i className={`fa-solid ${item.icon} ${activeTab === item.id && !isHosting && !selectedGame ? 'text-xl' : 'text-lg'}`}></i>
                 <span className="text-[10px] font-medium">{item.label}</span>
              </button>
           )
         ))}
      </div>
    );
  };

  return (
    <div className={`min-h-screen font-sans selection:bg-blue-200 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white`}>
       <Analytics />
       {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
       {globalLoading && <LoadingOverlay message="Please Wait..." />}
       
       {screen === 'splash' && <SplashScreen onFinish={finishSplash} />}
       
       {screen === 'login' && <LoginScreen onNavigate={setScreen} showToast={showToast} />}
       {screen === 'register' && <RegisterScreen onNavigate={setScreen} showToast={showToast} />}

       {screen === 'main' && userProfile && (
          <>
             <TopBar />
             <Sidebar 
                isOpen={sidebarOpen} 
                onClose={() => setSidebarOpen(false)} 
                user={userProfile} 
                onLogout={() => signOut(auth)}
                onViewProfile={() => setShowProfileEdit(true)}
                onAdmin={() => setShowAdmin(true)}
                onRules={() => setShowRulesModal(true)}
                theme={theme}
                toggleTheme={toggleTheme}
             />
             
             {isHosting ? (
                 <CreateTournamentScreen 
                    user={userProfile} 
                    showToast={showToast} 
                    viewMode={hostViewMode}
                    setViewMode={setHostViewMode}
                 />
             ) : selectedGame === 'FREE FIRE' ? (
                 <GameDetailsScreen 
                    gameId={selectedGame} 
                    onBack={() => setSelectedGame(null)} 
                    user={userProfile} 
                    showToast={showToast}
                    onNavigateToWallet={navigateToWallet}
                 />
             ) : selectedGame === 'TICTACTOE' ? (
                 <TicTacToeScreen
                    user={userProfile}
                    onBack={() => setSelectedGame(null)}
                    showToast={showToast}
                    onNavigateToWallet={navigateToWallet}
                 />
             ) : (
                <>
                   {activeTab === 'home' && <HomeScreen user={userProfile} setTab={handleTabChange} onRefresh={handleRefresh} onSelectGame={setSelectedGame} />}
                   {activeTab === 'wallet' && <WalletScreen user={userProfile} showToast={showToast} />}
                   {activeTab === 'friends' && <FriendsScreen user={userProfile} />}
                   {activeTab === 'refer' && <ReferEarnScreen user={userProfile} showToast={showToast} />}
                </>
             )}

             <BottomBar />

             {showAdmin && <AdminScreen onClose={() => setShowAdmin(false)} currentUser={userProfile} showToast={showToast} />}
             {showProfileEdit && <ProfileEditScreen user={userProfile} onClose={() => setShowProfileEdit(false)} onUpdate={setUserProfile} />}
             
             {showRulesModal && (
                 <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-[fade-enter_0.2s]">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col shadow-2xl border dark:border-slate-800">
                        <div className="p-4 border-b dark:border-slate-800 flex justify-between items-center"><h3 className="font-semibold text-lg text-red-600"><i className="fa-solid fa-scale-balanced mr-2"></i> App Rules</h3><button onClick={() => setShowRulesModal(false)} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><i className="fa-solid fa-xmark"></i></button></div>
                        <div className="p-6 overflow-y-auto text-sm text-slate-700 dark:text-slate-300 space-y-3 font-normal">
                           <p>1. <strong className="font-semibold">Fair Play:</strong> Cheating or teaming up with other squads in solo mode will lead to a permanent ban.</p>
                           <p>2. <strong className="font-semibold">Refunds:</strong> If a match is cancelled by the host, entry fees are refunded automatically.</p>
                           <p>3. <strong className="font-semibold">Hosting:</strong> You can only host 1 active BR and 1 active CS/Lone Wolf match at a time.</p>
                           <p>4. <strong className="font-semibold">Verification:</strong> Ensure your profile details are correct for withdrawals.</p>
                           <p>5. <strong className="font-semibold">Level Requirement:</strong> Your Free Fire ID level must be greater than 25 to participate.</p>
                        </div>
                    </div>
                 </div>
             )}
          </>
       )}
    </div>
  );
};

export default App;
