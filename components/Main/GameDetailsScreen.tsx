
import React, { useState, useEffect } from "react";
import { ref, onValue, update, push, get, remove } from "firebase/database";
import { db } from "../../firebase";
import { Tournament, ToastType, UserProfile, Transaction } from "../../types";
import { formatDate, getGameStats, updateSystemWallet } from "../../utils";
import CountdownTimer from "../Shared/CountdownTimer";
import { ValidatedInput } from "../Shared/ValidatedInput";
import { PullToRefresh } from "../Shared/PullToRefresh";
import { ConfirmModal } from "../Shared/ConfirmModal";
import MatchLobby from "./MatchLobby";

type Tab = 'upcoming' | 'joined' | 'results';

const GameDetailsScreen = ({ gameId, onBack, user, showToast, onNavigateToWallet }: { gameId: string, onBack: () => void, user: UserProfile, showToast: (m: string, t: ToastType) => void, onNavigateToWallet: () => void }) => {
    const [activeTab, setActiveTab] = useState<Tab>('upcoming');
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [gameTypeFilter, setGameTypeFilter] = useState<'ALL' | 'BR RANKED' | 'CLASH SQUAD' | 'LONE WOLF'>('ALL');
    const [modeFilter, setModeFilter] = useState('ALL'); 
    const [showFilterModal, setShowFilterModal] = useState(false);
    const [priceRange, setPriceRange] = useState({ min: 0, max: 1000 });
    const [ammoFilter, setAmmoFilter] = useState<'ALL' | 'LIMITED' | 'ULTIMATE'>('ALL');
    const [playWithFilter, setPlayWithFilter] = useState<'ALL' | 'RANDOMLY' | 'FRIENDS'>('ALL');
    const [showSpecialOnly, setShowSpecialOnly] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [resultDateFilter, setResultDateFilter] = useState<'today'|'yesterday'|'custom'>('today');
    const [customDate, setCustomDate] = useState("");
    const [joinModalOpen, setJoinModalOpen] = useState(false);
    const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
    const [teamJoinForms, setTeamJoinForms] = useState<{gameName: string, uid: string, level: string}[]>([]);
    const [rulesAccepted, setRulesAccepted] = useState(false);
    const [showRules, setShowRules] = useState(false);
    const [joining, setJoining] = useState(false);
    const [isUpdateMode, setIsUpdateMode] = useState(false); 
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [tournamentToShare, setTournamentToShare] = useState<Tournament | null>(null);
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [tournamentToCancel, setTournamentToCancel] = useState<Tournament | null>(null);
    const [showCredentials, setShowCredentials] = useState(false);
    const [credentialsData, setCredentialsData] = useState<{id: string, pass: string} | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'lobby'>('list');
    const [lobbyTournament, setLobbyTournament] = useState<Tournament | null>(null);
    const [privatePromptOpen, setPrivatePromptOpen] = useState(false);
    const [selectedPrivateTournament, setSelectedPrivateTournament] = useState<Tournament | null>(null);
    const [inputPass, setInputPass] = useState("");
    
    const [pendingJoin, setPendingJoin] = useState(false);
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);

    useEffect(() => {
        fetchData();
        setCustomDate(new Date().toISOString().split('T')[0]);
    }, [user.uid]);

    const fetchData = async () => {
        const tRef = ref(db, 'tournaments');
        onValue(tRef, (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                const list: Tournament[] = Object.keys(data).map(k => ({ ...data[k], id: k }));
                setTournaments(list);
                if (lobbyTournament) {
                    const updated = list.find(t => t.id === lobbyTournament.id);
                    if(updated) setLobbyTournament(updated);
                }
            } else {
                setTournaments([]);
            }
        }, { onlyOnce: true });
    };

    const getFilteredList = () => {
        const now = Date.now();
        const cleanSearch = searchQuery.trim().toLowerCase();
        const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
        const endOfToday = new Date(); endOfToday.setHours(23,59,59,999);
        const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        const endOfYesterday = new Date(endOfToday); endOfYesterday.setDate(endOfYesterday.getDate() - 1);
        let customStart = 0; let customEnd = 0;
        if(customDate) { const cd = new Date(customDate); customStart = cd.getTime(); customEnd = customStart + 86400000 - 1; }

        return tournaments.filter(t => {
            if (t.gameApp !== gameId) return false;
            if (cleanSearch) {
                const matchesId = t.id.toLowerCase().includes(cleanSearch);
                const matchesRoomId = t.roomId && t.roomId.toLowerCase().includes(cleanSearch);
                if (!matchesId && !matchesRoomId) return false;
            }
            const isFinished = t.status === 'completed' || t.status === 'cancelled';
            const isLive = t.startTime <= now && !isFinished;
            const isUpcoming = t.startTime > now && !isFinished;
            const participants = t.participants || {};
            const isJoined = !!participants[user.uid];
            // @ts-ignore
            const { maxPlayers } = getGameStats(t.gameName, t.mode, t.entryFee, t.maxPlayers);
            const joinedCount = Object.keys(participants).length;
            const isFull = joinedCount >= maxPlayers;

            let matchesTab = false;
            if (activeTab === 'results') {
                if (isJoined && isFinished) {
                    if (resultDateFilter === 'today') { if (t.startTime >= startOfToday.getTime() && t.startTime <= endOfToday.getTime()) matchesTab = true; }
                    else if (resultDateFilter === 'yesterday') { if (t.startTime >= startOfYesterday.getTime() && t.startTime <= endOfYesterday.getTime()) matchesTab = true; }
                    else if (resultDateFilter === 'custom') { if (t.startTime >= customStart && t.startTime <= customEnd) matchesTab = true; }
                }
            } else if (activeTab === 'joined') {
                if (isJoined && !isFinished) matchesTab = true;
            } else {
                if (isUpcoming && (!isFull || isJoined)) matchesTab = true;
            }
            if (!matchesTab) return false;
            if (gameTypeFilter !== 'ALL' && t.gameName !== gameTypeFilter) return false;
            if (modeFilter !== 'ALL' && t.mode !== modeFilter) return false;
            if (t.entryFee < priceRange.min || t.entryFee > priceRange.max) return false;
            if (ammoFilter !== 'ALL' && t.ammo !== ammoFilter) return false;
            if (playWithFilter !== 'ALL' && t.playWith !== playWithFilter) return false;
            if (showSpecialOnly && !t.isSpecial) return false;
            return true;
        }).sort((a, b) => activeTab === 'results' ? b.startTime - a.startTime : a.startTime - b.startTime);
    };

    const openLobby = (t: Tournament) => { setLobbyTournament(t); setViewMode('lobby'); };
    const promptCancelJoin = (t: Tournament, e?: React.MouseEvent) => { if(e) e.stopPropagation(); setTournamentToCancel(t); setCancelModalOpen(true); };
    
    const handleCancelJoin = async () => {
        if (!tournamentToCancel) return;
        try {
            const refundAmt = Math.floor(tournamentToCancel.entryFee * 0.95);
            await update(ref(db, `tournaments/${tournamentToCancel.id}/participants/${user.uid}`), null);
            if (refundAmt > 0) {
                 await update(ref(db, `users/${user.uid}/wallet`), { added: (user.wallet.added || 0) + refundAmt });
                 await push(ref(db, `transactions/${user.uid}`), { type: 'bonus', amount: refundAmt, date: Date.now(), details: 'Refund: Participation Cancelled', category: 'added' });
            }
            showToast("Cancelled successfully", "success");
            setCancelModalOpen(false);
            setTournamentToCancel(null);
            if (lobbyTournament && lobbyTournament.id === tournamentToCancel.id) setViewMode('list');
        } catch (e) {
            showToast("Failed to cancel", "error");
        }
    };

    const initiateJoinProcess = (tournament: Tournament) => {
        let size = 1;
        if (tournament.mode === 'DUO') size = 2;
        if (tournament.mode === 'SQUAD') size = 4;

        const existingForms = [];
        if (tournament.participants && tournament.participants[user.uid]) {
             setIsUpdateMode(true);
             const p = tournament.participants[user.uid];
             existingForms.push({ gameName: p.gameName, uid: p.gameUid, level: p.level.toString() });
             for(let i=1; i<size; i++) existingForms.push({ gameName: "", uid: "", level: "" });
        } else {
             setIsUpdateMode(false);
             for(let i=0; i<size; i++) {
                 if (i===0) {
                     existingForms.push({ gameName: user.gameDetails?.gameName || user.name, uid: user.gameDetails?.gameUid || "", level: user.gameDetails?.level?.toString() || "" });
                 } else {
                     existingForms.push({ gameName: "", uid: "", level: "" });
                 }
             }
        }
        setTeamJoinForms(existingForms);
        setJoinModalOpen(true);
    };

    const handleJoinRequest = (t?: Tournament) => {
        const tournament = t || selectedTournament;
        if (!tournament) return;
        setSelectedTournament(tournament);

        const isAlreadyJoined = tournament.participants && tournament.participants[user.uid];

        if(tournament.isPrivate && !isAlreadyJoined) {
            setSelectedPrivateTournament(tournament);
            setPendingJoin(true); 
            setPrivatePromptOpen(true);
        } else {
            initiateJoinProcess(tournament);
        }
    };

    const handleTeamFormChange = (index: number, field: string, value: string) => {
        const newForms = [...teamJoinForms];
        // @ts-ignore
        newForms[index][field] = value;
        setTeamJoinForms(newForms);
    };

    const submitJoin = async () => {
        if (!selectedTournament) return;
        for(const f of teamJoinForms) {
            if(!f.gameName || !f.uid || !f.level) return showToast("Please fill all player details", "error");
            if(parseInt(f.level) < 25) return showToast(`Level must be > 25 (Player: ${f.gameName})`, "error");
        }
        if(!rulesAccepted && !isUpdateMode) return showToast("Please accept rules", "error");

        setJoining(true);
        try {
            const totalFee = selectedTournament.entryFee * teamJoinForms.length;
            
            if (!isUpdateMode && totalFee > 0) {
                 const walletBal = (user.wallet.added || 0) + (user.wallet.winning || 0);
                 if (walletBal < totalFee) throw new Error("Insufficient Balance");
                 
                 let remaining = totalFee;
                 let newAdded = user.wallet.added || 0;
                 let newWinning = user.wallet.winning || 0;
                 
                 if (newAdded >= remaining) {
                     newAdded -= remaining;
                     remaining = 0;
                 } else {
                     remaining -= newAdded;
                     newAdded = 0;
                     newWinning -= remaining;
                 }
                 
                 await update(ref(db, `users/${user.uid}/wallet`), { added: newAdded, winning: newWinning });
                 await push(ref(db, `transactions/${user.uid}`), {
                     type: 'game', amount: totalFee, date: Date.now(), details: `Joined ${selectedTournament.gameName}`, category: 'winning'
                 });
                 
                 await updateSystemWallet(totalFee, "Tournament Entry Fee");
            }

            const mainPlayer = teamJoinForms[0];
            const updates: any = {};
            
            updates[`tournaments/${selectedTournament.id}/participants/${user.uid}`] = {
                uid: user.uid,
                username: user.username,
                gameName: mainPlayer.gameName,
                gameUid: mainPlayer.uid,
                level: parseInt(mainPlayer.level),
                joinedAt: Date.now(),
            };
            
            await update(ref(db), updates);
            
            await update(ref(db, `users/${user.uid}/gameDetails`), {
                gameName: mainPlayer.gameName,
                gameUid: mainPlayer.uid,
                level: parseInt(mainPlayer.level)
            });

            showToast(isUpdateMode ? "Updated!" : "Joined Successfully!", "success");
            setJoinModalOpen(false);
            
        } catch(e: any) {
            showToast(e.message || "Failed to join", "error");
        } finally {
            setJoining(false);
        }
    };

    const handlePrivateCheck = (t: Tournament) => { 
        if (t.isPrivate) { 
            setSelectedPrivateTournament(t); 
            setPendingJoin(false); 
            setInputPass(""); 
            setPrivatePromptOpen(true); 
        } else { 
            openLobby(t); 
        } 
    };

    const submitPrivatePass = () => { 
        if (!selectedPrivateTournament) return; 
        if (inputPass.trim() === selectedPrivateTournament.privatePass) { 
            setPrivatePromptOpen(false); 
            if(pendingJoin) {
                setSelectedTournament(selectedPrivateTournament);
                initiateJoinProcess(selectedPrivateTournament);
                setPendingJoin(false);
            } else {
                openLobby(selectedPrivateTournament); 
            }
        } else { 
            showToast("Incorrect Password", "error"); 
        } 
    };

    const handleCopy = (e: React.MouseEvent, text: string) => { e.stopPropagation(); navigator.clipboard.writeText(text); showToast("Copied!", "success"); };
    
    const list = getFilteredList();
    const totalStats = list.reduce((acc, t) => { if (t.status === 'completed' && t.participants && t.participants[user.uid]) { const p = t.participants[user.uid]; const profit = (p.winnings || 0) - t.entryFee; return acc + profit; } return acc; }, 0);

    const TournamentCard: React.FC<{ t: Tournament, fullWidth?: boolean }> = ({ t, fullWidth }) => {
        // @ts-ignore
        const { maxPlayers, totalPool } = getGameStats(t.gameName, t.mode, t.entryFee, t.maxPlayers);
        const participants = t.participants ? Object.keys(t.participants) : [];
        const joinedCount = participants.length;
        const filledPercent = (joinedCount / maxPlayers) * 100;
        const isJoined = t.participants && t.participants[user.uid];
        const isFull = joinedCount >= maxPlayers;
        
        let centerAmount = 0; let centerTag = "WINNER";
        if (t.gameName === 'CLASH SQUAD' || t.gameName === 'LONE WOLF') { centerAmount = t.rewardAmount; centerTag = "BOOYAH"; }
        else if (t.rewardType === 'PER KILL') { centerAmount = t.rewardAmount; centerTag = "PER KILL"; }
        else if (t.prizeDistribution && t.prizeDistribution.length > 0) {
            const margin = t.margin || 10;
            let distPool = totalPool;
            if (t.entryFee > 0) {
                const hostFee = Math.floor(totalPool * (margin / 100)); distPool = totalPool - hostFee;
                if(hostFee > 500 && margin === 10) distPool = totalPool - 500;
                if (t.rewardType === 'PER KILL & RANK') { const killReserve = maxPlayers * t.rewardAmount; distPool = Math.max(0, distPool - killReserve); }
            } else { distPool = t.rewardAmount; }
            const firstRow = t.prizeDistribution[0]; const portion = Math.floor(distPool * (firstRow.percentage / 100)); const count = (firstRow.to - firstRow.from) + 1;
            centerAmount = Math.floor(portion / count);
            if (t.rewardType === 'ACHIEVE KILL') { centerTag = `${firstRow.from}+ KILLS`; } else { centerTag = "1st RANK"; }
        } else { centerAmount = t.rewardAmount; if(t.rewardType === 'MAX KILL') centerTag = "1st RANK"; else if(t.rewardType === 'RANK') centerTag = "1st RANK"; }

        let poolValue = `₹${totalPool}`; if(t.rewardType === 'BOOYAH' && t.rewardAmount > 0) poolValue = `₹${t.rewardAmount}`; 
        const myData = isJoined ? t.participants![user.uid] : null; let winningAmount = 0; if (t.status === 'completed' && myData) { winningAmount = (myData as any).winnings || 0; }
        const timeToStart = t.startTime - Date.now(); const showViewId = timeToStart <= 10 * 60 * 1000;

        let cardGradient = "bg-white dark:bg-slate-900 border-t border-l border-white dark:border-slate-800";
        let textColor = "text-slate-800 dark:text-white";
        let iconBg = "bg-slate-100 dark:bg-slate-800 text-slate-500";
        let isDarkGradient = false;

        if (t.gameName === 'BR RANKED') { cardGradient = "bg-gradient-to-r from-[#4f46e5] to-[#7c3aed] shadow-indigo-500/20 border-t border-l border-white/20"; isDarkGradient = true; }
        else if (t.gameName === 'CLASH SQUAD') { cardGradient = "bg-gradient-to-r from-[#f97316] to-[#dc2626] shadow-orange-500/20 border-t border-l border-white/20"; isDarkGradient = true; }
        else if (t.gameName === 'LONE WOLF') { cardGradient = "bg-gradient-to-r from-[#10b981] to-[#0f766e] shadow-emerald-500/20 border-t border-l border-white/20"; isDarkGradient = true; }

        if (isDarkGradient) { textColor = "text-white"; iconBg = "bg-white/20 text-white backdrop-blur-sm"; }

        let rewardIcon = "fa-trophy";
        if (t.rewardType === 'PER KILL') rewardIcon = "fa-skull";
        else if (t.rewardType === 'MAX KILL') rewardIcon = "fa-crosshairs";
        else if (t.rewardType === 'BOOYAH') rewardIcon = "fa-trophy";
        else if (t.rewardType === 'PER KILL & RANK') rewardIcon = "fa-ranking-star";
        else if (t.rewardType === 'ACHIEVE KILL') rewardIcon = "fa-bullseye";

        return (
            <div onClick={() => handlePrivateCheck(t)} className={`relative group overflow-hidden rounded-xl shadow-xl hover:shadow-2xl transition-all duration-300 ${cardGradient} ${fullWidth ? 'w-full' : 'min-w-[280px] w-[280px]'} mb-5 ring-1 ring-black/5 cursor-pointer`}>
                {t.isSpecial && (
                    <div className="absolute top-0 left-0 z-20">
                        <div className="bg-yellow-400 text-black text-[9px] font-black px-3 py-1 rounded-br-2xl shadow-sm flex items-center gap-1">
                            <i className="fa-solid fa-star text-[10px]"></i> SPECIAL
                        </div>
                    </div>
                )}
                
                <div className="absolute top-3 right-3 z-20 flex gap-2">
                    <button onClick={(e) => handleCopy(e, t.id)} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold shadow-sm backdrop-blur-md ${isDarkGradient ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                        ID: {t.id.slice(-4)} <i className="fa-regular fa-copy"></i>
                    </button>
                    {t.isPrivate && !isJoined && (
                        <div className="w-6 h-6 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/20">
                            <i className="fa-solid fa-lock text-white text-[10px]"></i>
                        </div>
                    )}
                </div>

                <div className="p-5">
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${iconBg}`}>
                                <i className={`fa-solid ${t.gameName === 'BR RANKED' ? 'fa-map-location-dot' : 'fa-crosshairs'} text-xl`}></i>
                            </div>
                            <div>
                                <h3 className={`font-black text-base leading-tight tracking-wide ${textColor}`}>{t.gameName}</h3>
                                <div className="flex items-center gap-1.5 mt-1">
                                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-md shadow-sm ${isDarkGradient ? 'bg-black/30 text-white border border-white/10' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'}`}>{t.mode}</span>
                                    {t.map && <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-md shadow-sm ${isDarkGradient ? 'bg-black/30 text-white border border-white/10' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'}`}>{t.map}</span>}
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex flex-col items-end pt-6">
                            {activeTab === 'upcoming' ? (
                                <div className={`${isDarkGradient ? 'bg-white/10 border-white/10 text-white' : 'bg-blue-50 dark:bg-blue-900/30 border-blue-100 dark:border-blue-800'} backdrop-blur-md px-2.5 py-1.5 rounded-xl border shadow-sm scale-95 origin-right`}>
                                    <CountdownTimer targetDate={t.startTime} compact />
                                </div>
                            ) : (
                                <span className={`text-[9px] font-black px-2.5 py-1 rounded-lg shadow-sm ${t.status === 'cancelled' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                    {t.status.toUpperCase()}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 items-end mb-6 relative z-10">
                        <div className="flex flex-col items-start pb-1">
                            <p className={`text-[9px] font-bold uppercase tracking-wider mb-0.5 opacity-80 ${textColor}`}>Pool</p>
                            <p className={`text-base font-bold ${textColor}`}>{poolValue}</p>
                        </div>

                        <div className={`flex flex-col items-center relative -top-2`}>
                             <div className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest mb-1 shadow-sm ${isDarkGradient ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}`}>
                                {centerTag}
                             </div>
                             <div className="flex items-center justify-center gap-1">
                                 <i className={`fa-solid ${rewardIcon} text-yellow-300 text-lg drop-shadow-md filter`}></i>
                                 <span className={`text-2xl font-black tracking-tight ${textColor} drop-shadow-sm`}>₹{centerAmount}</span>
                             </div>
                        </div>

                        <div className="flex flex-col items-end pb-1">
                            <p className={`text-[9px] font-bold uppercase tracking-wider mb-0.5 opacity-80 ${textColor}`}>Entry Fee</p>
                            <p className={`text-xl font-black ${t.entryFee === 0 ? 'text-green-300' : 'text-yellow-400'}`}>{t.entryFee === 0 ? 'FREE' : `₹${t.entryFee}`}</p>
                        </div>
                    </div>

                    <div className={`mt-3 pt-3 border-t ${isDarkGradient ? 'border-white/10' : 'border-slate-100 dark:border-slate-800'}`}>
                        <div className="flex items-end gap-3">
                            <div className="flex-1">
                                <div className="flex justify-between text-[9px] font-bold mb-1 opacity-90">
                                    <span className={textColor}>{isJoined ? "Joined" : "Filling"}</span>
                                    <span className={textColor}>{joinedCount}/{maxPlayers}</span>
                                </div>
                                <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDarkGradient ? 'bg-black/30' : 'bg-slate-200 dark:bg-slate-700'}`}>
                                    <div className={`h-full rounded-full transition-all duration-500 shadow-sm ${filledPercent >= 100 ? 'bg-red-500' : isJoined ? 'bg-green-400' : (isDarkGradient ? 'bg-white' : 'bg-blue-500')}`} style={{width: `${Math.max(5, filledPercent)}%`}}></div>
                                </div>
                            </div>

                            <div className="shrink-0">
                                {activeTab === 'upcoming' && (
                                    isJoined ? (
                                        showViewId ? (
                                            <button onClick={(e) => { e.stopPropagation(); openLobby(t); }} className={`px-4 py-2 rounded-xl font-bold text-xs shadow-lg transition-all active:scale-95 ${isDarkGradient ? 'bg-white text-slate-900 hover:bg-slate-100' : 'bg-slate-900 text-white'}`}>
                                                VIEW ID
                                            </button>
                                        ) : (
                                            <div className={`px-3 py-2 rounded-xl font-bold text-[10px] flex items-center justify-center gap-1 border border-dashed ${isDarkGradient ? 'bg-white/5 border-white/20 text-white/70' : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400'}`}>
                                                <i className="fa-solid fa-lock"></i> LOCKED
                                            </div>
                                        )
                                    ) : (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleJoinRequest(t); }} 
                                            className={`px-5 py-2 rounded-xl font-bold text-xs shadow-xl flex items-center justify-center gap-1 transition-transform hover:scale-[1.02] active:scale-95 ${isFull ? 'bg-slate-500 cursor-not-allowed opacity-70 text-white' : (isDarkGradient ? 'bg-white text-slate-900 hover:bg-blue-50' : 'bg-blue-600 text-white hover:bg-blue-700')}`}
                                            disabled={isFull}
                                        >
                                            {isFull ? 'FULL' : 'JOIN'}
                                        </button>
                                    )
                                )}
                                {activeTab === 'joined' && (
                                    showViewId ? (
                                        <button onClick={(e) => { e.stopPropagation(); openLobby(t); }} className={`px-4 py-2 rounded-xl font-bold text-xs shadow-lg transition-all active:scale-95 ${isDarkGradient ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}`}>
                                            VIEW ID
                                        </button>
                                    ) : (
                                        <div className={`px-3 py-2 rounded-xl font-bold text-[10px] flex items-center justify-center gap-1 border border-dashed ${isDarkGradient ? 'bg-white/5 border-white/20 text-white/70' : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400'}`}>
                                            <i className="fa-solid fa-lock"></i> LOCKED
                                        </div>
                                    )
                                )}
                                {activeTab === 'results' && isJoined && (
                                     winningAmount > 0 ? (
                                         <div className="flex items-center gap-1 bg-green-500/20 px-3 py-1.5 rounded-lg border border-green-500/50 backdrop-blur-md">
                                             <i className="fa-solid fa-sack-dollar text-yellow-400 text-sm"></i>
                                             <span className="text-sm font-black text-white drop-shadow-md">₹{winningAmount}</span>
                                         </div>
                                     ) : (
                                         <div className="flex items-center gap-1 opacity-80 bg-white/10 px-3 py-1.5 rounded-lg">
                                             <i className="fa-solid fa-gamepad text-white text-sm"></i>
                                             <span className="text-[10px] font-bold text-white">Played</span>
                                         </div>
                                     )
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderTournamentList = () => {
        if (list.length === 0) {
            return (
                 <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-600 opacity-80">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-3">
                        <i className="fa-solid fa-ghost text-2xl"></i>
                    </div>
                    <p className="font-bold text-slate-500 dark:text-slate-400">No Matches Found</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Try changing filters or search query</p>
                </div>
            );
        }
        return (
            <div className="px-4 pb-4 pt-2 space-y-4">
                {list.map(t => (
                    <TournamentCard key={t.id} t={t} fullWidth={true} />
                ))}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
            {viewMode === 'lobby' && lobbyTournament ? (
                 <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950">
                    <MatchLobby 
                        tournament={lobbyTournament} 
                        user={user} 
                        onJoin={() => handleJoinRequest(lobbyTournament)} 
                        onCancelJoin={() => promptCancelJoin(lobbyTournament)}
                        onBack={() => setViewMode('list')} 
                        onRefresh={fetchData}
                        // @ts-ignore
                        isJoined={!!(lobbyTournament.participants && lobbyTournament.participants[user.uid])}
                        // @ts-ignore
                        canJoin={(Object.keys(lobbyTournament.participants || {}).length) < getGameStats(lobbyTournament.gameName, lobbyTournament.mode, lobbyTournament.entryFee, lobbyTournament.maxPlayers).maxPlayers}
                    />
                </div>
            ) : (
                <>
                <div className="sticky top-0 z-[60] bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shadow-sm transition-colors duration-300">
                    <div className="flex items-center justify-between px-4 py-3 gap-3 h-16">
                        {/* Back Button and Title Container */}
                        <div className="flex items-center gap-3 flex-1 overflow-hidden">
                            <button onClick={onBack} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition flex-shrink-0"><i className="fa-solid fa-arrow-left"></i></button>
                            
                            {!isSearchExpanded && (
                                <h2 className="font-extrabold text-lg text-slate-800 dark:text-white uppercase tracking-wider italic animate-[fade-enter_0.2s]">FREE FIRE</h2>
                            )}
                        </div>
                        
                        {/* Search Container */}
                        <div className={`flex items-center justify-end transition-all duration-300 ${isSearchExpanded ? 'w-full' : 'w-auto'}`}>
                            {isSearchExpanded ? (
                                <div className="bg-slate-100 dark:bg-slate-800 rounded-full px-4 py-2 flex items-center w-full animate-[width_0.2s_ease-out]">
                                    <input 
                                        autoFocus
                                        placeholder="Search ID" 
                                        className="bg-transparent w-full outline-none text-xs font-bold text-slate-700 dark:text-slate-300"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        onBlur={() => !searchQuery && setIsSearchExpanded(false)}
                                    />
                                    <button onClick={() => { setSearchQuery(""); setIsSearchExpanded(false); }} className="text-slate-400 ml-2"><i className="fa-solid fa-xmark"></i></button>
                                </div>
                            ) : (
                                <button onClick={() => setIsSearchExpanded(true)} className="w-8 h-8 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:scale-110 transition">
                                    <i className="fa-solid fa-magnifying-glass"></i>
                                </button>
                            )}
                        </div>
                    </div>
                    
                    <div className="px-4 pb-2">
                        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                            {['upcoming', 'joined', 'results'].map(t => (
                                <button key={t} onClick={() => setActiveTab(t as Tab)} className={`flex-1 py-1.5 text-xs font-medium uppercase rounded-lg transition ${activeTab === t ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm' : 'text-slate-400 dark:text-slate-500'}`}>{t}</button>
                            ))}
                        </div>
                    </div>
                    <div className="px-4 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar bg-white dark:bg-slate-900">
                        {['ALL', 'BR RANKED', 'CLASH SQUAD', 'LONE WOLF'].map(type => {
                            let label = type === 'BR RANKED' ? 'BR' : type === 'CLASH SQUAD' ? 'CS' : type === 'LONE WOLF' ? 'LW' : 'ALL';
                            return (
                                <button key={type} onClick={() => setGameTypeFilter(type as any)} className={`px-4 py-1.5 rounded-full text-xs font-medium border transition whitespace-nowrap ${gameTypeFilter === type ? 'bg-slate-800 text-white border-slate-800' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>{label}</button>
                            );
                        })}
                        <div className="w-[1px] h-6 bg-slate-300 dark:bg-slate-700 mx-1"></div>
                        <button onClick={() => setShowFilterModal(true)} className="w-8 h-8 flex-shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 shadow-sm"><i className="fa-solid fa-sliders"></i></button>
                        <button onClick={() => setShowSpecialOnly(!showSpecialOnly)} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition whitespace-nowrap flex items-center gap-1 ${showSpecialOnly ? 'bg-orange-500 text-white border-orange-600 shadow-md shadow-orange-500/20' : 'bg-white dark:bg-slate-900 text-orange-500 border-orange-200 dark:border-orange-900'}`}>
                            <i className="fa-solid fa-star"></i> Special
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <PullToRefresh onRefresh={fetchData}>
                        {renderTournamentList()}
                    </PullToRefresh>
                </div>

                {activeTab === 'results' && list.length > 0 && (
                    <div className="fixed bottom-20 left-4 right-4 z-30 animate-[slide-up_0.3s_ease-out]">
                        <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-white/20 flex items-center justify-between ring-1 ring-slate-200 dark:ring-slate-700">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xl shadow-lg ${totalStats >= 0 ? 'bg-gradient-to-br from-green-400 to-green-600' : 'bg-gradient-to-br from-red-400 to-red-600'}`}>
                                    {totalStats >= 0 ? <i className="fa-solid fa-heart"></i> : <i className="fa-solid fa-heart-crack"></i>}
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Net Earnings <i className="fa-solid fa-heart text-red-500 ml-0.5 text-[8px]"></i></p>
                                    <p className={`text-lg font-black leading-none ${totalStats >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                                        {totalStats >= 0 ? '+' : ''}₹{totalStats}
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg">
                                    {list.length} Matches
                                </span>
                            </div>
                        </div>
                    </div>
                )}
                </>
            )}

            {/* Modals */}
            {showFilterModal && (
                <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-[fade-enter_0.2s]">
                    <div className="bg-white dark:bg-slate-900 w-full sm:w-96 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl overflow-y-auto max-h-[80vh]">
                        <div className="flex justify-between items-center mb-6"><h3 className="font-semibold text-lg dark:text-white">Filters</h3><button onClick={() => setShowFilterModal(false)} className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center dark:text-white"><i className="fa-solid fa-xmark"></i></button></div>
                        <div className="mb-6">
                            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-2 block">Team Mode</label>
                            <div className="flex gap-3">
                                {['ALL', 'SOLO', 'DUO', 'SQUAD'].map(m => (
                                    <button key={m} onClick={() => setModeFilter(m)} className={`flex-1 py-2 border rounded-xl text-xs font-medium ${modeFilter === m ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'border-slate-200 dark:border-slate-700 dark:text-white'}`}>{m}</button>
                                ))}
                            </div>
                        </div>
                        <button onClick={() => setShowFilterModal(false)} className="w-full bg-slate-900 text-white font-medium py-3.5 rounded-xl">Apply Filters</button>
                    </div>
                </div>
            )}
            {privatePromptOpen && selectedPrivateTournament && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-[fade-enter_0.2s]" onClick={() => setPrivatePromptOpen(false)}>
                    <div className="bg-white dark:bg-slate-900 w-full max-w-xs rounded-2xl p-6 shadow-2xl relative overflow-hidden" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setPrivatePromptOpen(false)} className="absolute top-3 right-3 text-slate-400"><i className="fa-solid fa-xmark"></i></button>
                        <div className="text-center mb-4">
                            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-500 dark:text-slate-300">
                                <i className="fa-solid fa-lock text-2xl"></i>
                            </div>
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Private Match</h3>
                            <p className="text-xs text-slate-500">Enter password to view</p>
                        </div>
                        <input 
                            type="tel" 
                            autoFocus
                            placeholder="Password"
                            className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-center font-bold mb-4 outline-none dark:text-white"
                            value={inputPass}
                            onChange={e => setInputPass(e.target.value)}
                        />
                        <button onClick={submitPrivatePass} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg active:scale-95 transition">
                            Unlock
                        </button>
                    </div>
                </div>
            )}
            
            {joinModalOpen && selectedTournament && (
                <>
                <div className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm" onClick={() => setJoinModalOpen(false)}></div>
                <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 z-[110] rounded-t-3xl p-5 shadow-2xl animate-[slide-up_0.3s_ease-out]">
                    <div className="flex justify-between items-center mb-3"><div><h3 className="text-xl font-semibold text-slate-800 dark:text-white">{isUpdateMode ? "Edit Details" : "Join Match"}</h3><p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{selectedTournament.gameName} • {selectedTournament.mode}</p></div><button onClick={() => setShowRules(true)} className="px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800 rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-yellow-100 transition"><i className="fa-solid fa-book-open"></i> Rules</button></div>
                    <div className="space-y-2.5 mb-3 max-h-[50vh] overflow-y-auto">
                        {!isUpdateMode && (
                            <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 rounded-xl flex justify-between items-center"><span className="text-xs font-medium text-blue-800 dark:text-blue-400">Entry Fee (Total)</span><span className="text-lg font-semibold text-blue-800 dark:text-blue-400">₹{selectedTournament.entryFee * teamJoinForms.length}</span></div>
                        )}
                        {teamJoinForms.map((form, idx) => (
                            <div key={idx} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-slate-50 dark:bg-slate-800">
                                <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 uppercase">Player {idx + 1} {idx === 0 ? '(You)' : ''}</h4>
                                <ValidatedInput label="In-Game Name" value={form.gameName} onChange={v => handleTeamFormChange(idx, 'gameName', v)} placeholder="Exact Free Fire Name" icon="fa-user-tag" maxLength={20} required />
                                <div className="grid grid-cols-2 gap-3">
                                    <ValidatedInput label="Game UID" value={form.uid} onChange={v => handleTeamFormChange(idx, 'uid', v.replace(/\D/g, ''))} placeholder="1234567890" icon="fa-id-badge" type="tel" maxLength={15} required />
                                    <ValidatedInput label="Level (25-100)" value={form.level} onChange={v => handleTeamFormChange(idx, 'level', v.replace(/\D/g, ''))} placeholder="e.g. 45" icon="fa-layer-group" type="tel" maxLength={3} required />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                        <label className="flex items-center gap-2 mb-3 cursor-pointer">
                            <input type="checkbox" checked={rulesAccepted} onChange={e => setRulesAccepted(e.target.checked)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" disabled={isUpdateMode} />
                            <span className="text-xs text-slate-600 dark:text-slate-400">I accept the Match Rules & Fair Play Policy</span>
                        </label>
                    </div>
                    <button 
                        onClick={submitJoin} 
                        disabled={joining}
                        className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 disabled:opacity-70"
                    >
                        {joining ? <i className="fa-solid fa-spinner fa-spin"></i> : (isUpdateMode ? "Update Details" : "Confirm Join")}
                    </button>
                </div>
                </>
            )}

            {showRules && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fade-enter_0.2s]" onClick={() => setShowRules(false)}>
                    <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Match Rules</h3>
                            <button onClick={() => setShowRules(false)}><i className="fa-solid fa-xmark text-slate-400"></i></button>
                        </div>
                        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                             <div className="flex gap-3"><span className="font-bold text-orange-500">01.</span><p><strong className="text-slate-800 dark:text-white">Teaming:</strong> Strictly prohibited. Teaming results in a permanent ban.</p></div>
                             <div className="flex gap-3"><span className="font-bold text-orange-500">02.</span><p><strong className="text-slate-800 dark:text-white">Wait Time:</strong> Host will wait max 5 mins after start time.</p></div>
                             <div className="flex gap-3"><span className="font-bold text-orange-500">03.</span><p><strong className="text-slate-800 dark:text-white">Cancellation:</strong> Cancel up to 10 mins before match start for 95% refund.</p></div>
                             <div className="flex gap-3"><span className="font-bold text-orange-500">04.</span><p><strong className="text-slate-800 dark:text-white">Fair Play:</strong> No Hacks/Teaming. Level must be &gt; 25.</p></div>
                        </div>
                        <button onClick={() => setShowRules(false)} className="w-full mt-6 bg-slate-900 dark:bg-slate-700 text-white font-bold py-3 rounded-xl">I Understand</button>
                    </div>
                </div>
            )}
            
            {cancelModalOpen && tournamentToCancel && (
                <ConfirmModal 
                    title="Cancel Participation?" 
                    message="You will receive a 95% refund of your entry fee." 
                    confirmText="Yes, Cancel" 
                    cancelText="No, Keep"
                    onConfirm={handleCancelJoin} 
                    onCancel={() => setCancelModalOpen(false)} 
                    isDangerous={true} 
                />
            )}
        </div>
    );
};

export default GameDetailsScreen;
