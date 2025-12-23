
import React, { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { ref, get, update } from "firebase/database";
import { auth, db } from "./firebase";
import { Screen, Tab, ToastType, UserProfile } from "./types";
import { generateReferralCode } from "./utils";
import i18n from "./i18n";

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
import BingoScreen from "./components/Main/BingoScreen"; // Imported Bingo
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
  
  // Connectivity States
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [latency, setLatency] = useState<number | null>(null);
  const [isSlowConnection, setIsSlowConnection] = useState(false);

  // Theme State
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
      if (typeof window !== 'undefined') {
          const saved = localStorage.getItem('theme');
          return (saved === 'dark' || saved === 'light') ? saved : 'dark';
      }
      return 'dark';
  });

  // Navigation State
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [isHosting, setIsHosting] = useState(false); 
  const [hostViewMode, setHostViewMode] = useState<'manage' | 'create'>('create');

  // Auth/Loading States
  const [authLoaded, setAuthLoaded] = useState(false);
  const [splashFinished, setSplashFinished] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(false);

  // Network Monitoring Logic
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const measureLatency = async () => {
        if (!navigator.onLine) {
            setLatency(null);
            return;
        }
        const start = performance.now();
        try {
            // Check connection to Firebase info node
            const connectedRef = ref(db, '.info/connected');
            await get(connectedRef);
            const end = performance.now();
            const rtt = Math.round(end - start);
            setLatency(rtt);
            setIsSlowConnection(rtt > 800); 
        } catch (e) {
            setLatency(null);
        }
    };

    const interval = setInterval(measureLatency, 3000); // 3s update
    measureLatency(); 

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        clearInterval(interval);
    };
  }, []);

  useEffect(() => {
      if (theme === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const showToast = (message: string, type: ToastType) => setToast({ message, type });

  const loadUserProfile = async (uid: string, userAuth: any) => {
    setGlobalLoading(true);
    try {
      // Use a shorter timeout to prevent hanging on mobile data
      const fetchPromise = get(ref(db, `users/${uid}`));
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000));
      
      let snap: any;
      try {
          snap = await Promise.race([fetchPromise, timeoutPromise]);
      } catch (err) {
          // If timed out, try one more time without timeout for "simple net"
          snap = await get(ref(db, `users/${uid}`));
      }

      if(snap && snap.exists()) {
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
           const safeProfile = { ...data, wallet: data.wallet || { added: 0, winning: 0, smCoins: 0 } };
           setUserProfile(safeProfile);
           if (safeProfile.language) i18n.changeLanguage(safeProfile.language);
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
              showToast("Profile data missing.", "error");
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
       if(u) await loadUserProfile(u.uid, u);
       else setUserProfile(null);
       setAuthLoaded(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
      if (authLoaded && splashFinished) {
          if (userProfile) setScreen('main');
          else setScreen(prev => (prev === 'splash' || prev === 'main') ? 'login' : prev);
      }
  }, [authLoaded, splashFinished, userProfile]);

  const handleRefresh = async () => {
     if(auth.currentUser) {
         await loadUserProfile(auth.currentUser.uid, auth.currentUser);
         showToast("Data refreshed", "info");
     }
  };

  const navigateToWallet = () => {
      setSelectedGame(null);
      setActiveTab('wallet');
  };

  const handleTabChange = (tab: Tab) => {
      setSelectedGame(null); 
      setIsHosting(false); 
      setShowAdmin(false);
      setShowProfileEdit(false);
      setActiveTab(tab);
  };

  const showNetworkBar = !isOnline || isSlowConnection;
  const networkBarContent = !isOnline ? {
      text: "Connection Lost",
      icon: "fa-wifi-slash",
      bg: "bg-red-500"
  } : {
      text: "Slow Mobile Network",
      icon: "fa-gauge-high",
      bg: "bg-orange-500"
  };

  if (screen === 'main' && userProfile && (userProfile.username === 'superadmin' || userProfile.username === '@superadmin')) {
      return (
          <div className="min-h-screen bg-slate-100 dark:bg-slate-900 transition-all duration-500">
              {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
              <AdminScreen onClose={() => signOut(auth)} isSuperAdminView={true} currentUser={userProfile} showToast={showToast} />
          </div>
      );
  }

  const TopBar = () => {
    if (selectedGame) return null; 
    let title = "SM EARN";
    if (isHosting) title = "HOST MATCH";
    else if (activeTab === 'wallet') title = "WALLET";
    
    return (
      <div 
        className={`fixed left-0 right-0 bg-white/95 dark:bg-slate-900/95 dark:border-slate-800 backdrop-blur-md z-40 px-4 py-3 shadow-sm flex items-center justify-between h-16 transition-all duration-300 border-b`}
        style={{ top: showNetworkBar ? '32px' : '0px' }}
      >
         <div className="flex items-center gap-3">
            {isHosting ? (
                <button onClick={() => setIsHosting(false)} className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition shadow-sm">
                    <i className="fa-solid fa-arrow-left text-lg"></i>
                </button>
            ) : (
                <button onClick={() => setSidebarOpen(true)} className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white transition shadow-sm">
                   <i className="fa-solid fa-bars-staggered text-lg"></i>
                </button>
            )}
            <span className="font-semibold tracking-tight text-lg text-blue-700 dark:text-blue-400">{title}</span>
         </div>
         
         <div className="flex items-center gap-2">
             {isHosting ? (
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                    <button onClick={() => setHostViewMode('manage')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${hostViewMode === 'manage' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-400'}`}>MANAGE</button>
                    <button onClick={() => setHostViewMode('create')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${hostViewMode === 'create' ? 'bg-white dark:bg-slate-700 text-orange-500 shadow-sm' : 'text-slate-400'}`}>CREATE</button>
                </div>
             ) : (
                <div className="flex items-center gap-2">
                    <button onClick={() => { setActiveTab('wallet'); setSelectedGame(null); setIsHosting(false); }} className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-blue-50 dark:bg-slate-800 border-blue-100 dark:border-slate-700 text-slate-800 dark:text-white active:scale-95 transition">
                        <i className="fa-solid fa-wallet text-blue-600 dark:text-blue-400"></i>
                        <span className="font-medium text-sm">₹{userProfile ? (userProfile.wallet.added + userProfile.wallet.winning) : 0}</span>
                    </button>
                    {/* Latency Indicator */}
                    {latency !== null && (
                        <div className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[9px] font-bold shadow-sm transition-colors ${isSlowConnection ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                            <i className={`fa-solid fa-signal ${isSlowConnection ? 'animate-pulse' : ''}`}></i>
                            {latency}ms
                        </div>
                    )}
                </div>
             )}
         </div>
      </div>
    );
  };

  const BottomBar = () => {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 border-t border-slate-100 dark:border-slate-800 px-6 py-2 flex justify-between items-center z-[100] pb-safe backdrop-blur-md">
         {[
           { id: 'home', icon: 'fa-house', label: i18n.t('home') },
           { id: 'friends', icon: 'fa-user-group', label: i18n.t('friends') },
           { id: 'host', icon: 'fa-gamepad', label: 'Host', special: true }, 
           { id: 'wallet', icon: 'fa-wallet', label: i18n.t('wallet') },
           { id: 'refer', icon: 'fa-trophy', label: i18n.t('refer') },
         ].map((item: any) => (
           item.special ? (
              <button key={item.id} onClick={() => { setIsHosting(true); setSelectedGame(null); setShowAdmin(false); setShowProfileEdit(false); }} className={`relative -top-5 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg transform hover:scale-110 active:scale-90 transition bg-orange-500 shadow-orange-500/40 ${isHosting ? 'ring-4 ring-orange-100 dark:ring-orange-900/20' : ''}`}>
                 <i className={`fa-solid ${item.icon} text-xl`}></i>
              </button>
           ) : (
              <button key={item.id} onClick={() => handleTabChange(item.id)} className={`flex flex-col items-center gap-1 ${activeTab === item.id && !isHosting && !selectedGame ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'} transition active:scale-95`}>
                 <i className={`fa-solid ${item.icon} ${activeTab === item.id && !isHosting && !selectedGame ? 'text-xl' : 'text-lg'}`}></i>
                 <span className="text-[10px] font-medium">{item.label}</span>
              </button>
           )
         ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen font-sans selection:bg-blue-200 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white transition-colors duration-500 overflow-x-hidden">
       {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
       {globalLoading && <LoadingOverlay message="SM EARN" />}
       
       <div 
         className={`fixed top-0 left-0 right-0 h-8 ${networkBarContent.bg} text-white z-50 flex items-center justify-center gap-2 text-[10px] font-bold transition-all duration-300 ease-in-out`}
         style={{ transform: showNetworkBar ? 'translateY(0)' : 'translateY(-100%)' }}
       >
           <i className={`fa-solid ${networkBarContent.icon} animate-pulse`}></i>
           {networkBarContent.text}
       </div>

       {screen === 'splash' && <SplashScreen onFinish={() => setSplashFinished(true)} />}
       
       {screen === 'login' && <LoginScreen onNavigate={setScreen} showToast={showToast} />}
       {screen === 'register' && <RegisterScreen onNavigate={setScreen} showToast={showToast} />}

       {screen === 'main' && userProfile && (
          <div 
            className="flex flex-col h-full min-h-screen ui-transition"
            style={{ paddingTop: showNetworkBar ? '32px' : '0px' }}
          >
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
             
             <div className="flex-1 ui-transition animate-[fade-enter_0.4s_ease-out]">
                 {isHosting ? (
                     <CreateTournamentScreen user={userProfile} showToast={showToast} viewMode={hostViewMode} setViewMode={setHostViewMode} />
                 ) : selectedGame === 'FREE FIRE' ? (
                     <GameDetailsScreen gameId={selectedGame} onBack={() => setSelectedGame(null)} user={userProfile} showToast={showToast} onNavigateToWallet={navigateToWallet} />
                 ) : selectedGame === 'TICTACTOE' ? (
                     <TicTacToeScreen user={userProfile} onBack={() => setSelectedGame(null)} showToast={showToast} onNavigateToWallet={navigateToWallet} />
                 ) : selectedGame === 'BINGO' ? (
                     <BingoScreen user={userProfile} onBack={() => setSelectedGame(null)} showToast={showToast} onNavigateToWallet={navigateToWallet} />
                 ) : (
                    <>
                       {activeTab === 'home' && <HomeScreen user={userProfile} setTab={handleTabChange} onRefresh={handleRefresh} onSelectGame={setSelectedGame} />}
                       {activeTab === 'wallet' && <WalletScreen user={userProfile} showToast={showToast} />}
                       {activeTab === 'friends' && <FriendsScreen user={userProfile} />}
                       {activeTab === 'refer' && <ReferEarnScreen user={userProfile} showToast={showToast} />}
                    </>
                 )}
             </div>

             <BottomBar />

             {showAdmin && <AdminScreen onClose={() => setShowAdmin(false)} currentUser={userProfile} showToast={showToast} />}
             {showProfileEdit && <ProfileEditScreen user={userProfile} onClose={() => setShowProfileEdit(false)} onUpdate={setUserProfile} />}
             
             {showRulesModal && (
                 <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-[fade-enter_0.2s]">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm max-h-[80vh] flex flex-col shadow-2xl border dark:border-slate-800">
                        <div className="p-4 border-b dark:border-slate-800 flex justify-between items-center"><h3 className="font-semibold text-lg text-red-600"><i className="fa-solid fa-scale-balanced mr-2"></i> App Rules</h3><button onClick={() => setShowRulesModal(false)} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><i className="fa-solid fa-xmark"></i></button></div>
                        <div className="p-6 overflow-y-auto text-sm text-slate-700 dark:text-slate-300 space-y-3 font-normal">
                           <p>1. <strong className="font-semibold">Fair Play:</strong> Cheating or teaming up results in a permanent ban.</p>
                           <p>2. <strong className="font-semibold">Refunds:</strong> Cancelled matches are refunded instantly.</p>
                           <p>3. <strong className="font-semibold">Hosting:</strong> Max 1 active BR and 1 active CS match allowed.</p>
                           <p>4. <strong className="font-semibold">Identity:</strong> Use correct In-Game Name for prize verification.</p>
                           <p>5. <strong className="font-semibold">Support:</strong> Use the chat for help from Admin/Support.</p>
                        </div>
                    </div>
                 </div>
             )}
          </div>
       )}
    </div>
  );
};

export default App;
