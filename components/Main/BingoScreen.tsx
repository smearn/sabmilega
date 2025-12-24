
import React, { useState, useEffect, useRef } from "react";
import { UserProfile, ToastType } from "../../types";
import { update, ref, push, onValue, remove, get, set, runTransaction, query, limitToFirst, onDisconnect } from "firebase/database";
import { db } from "../../firebase";
import { updateSystemWallet } from "../../utils";

type GameState = 'lobby' | 'finding' | 'countdown' | 'playing' | 'result';

const TIERS = [
    { entry: 5, prize: 9 },
    { entry: 10, prize: 18 },
    { entry: 20, prize: 36 },
    { entry: 50, prize: 90 },
    { entry: 100, prize: 180 },
];

const RANDOM_NAMES = ["Aryan", "Simran", "Kabir", "Mehak", "Sameer", "Tanvi", "Rishabh", "Ishani", "Yash", "Zoya"];

const BingoScreen = ({ user, onBack, showToast, onNavigateToWallet, latency }: { user: UserProfile, onBack: () => void, showToast: (m: string, t: ToastType) => void, onNavigateToWallet: () => void, latency: number | null }) => {
    const [gameState, setGameState] = useState<GameState>('lobby');
    const [selectedTier, setSelectedTier] = useState<{ entry: number, prize: number } | null>(null);
    const [gameId, setGameId] = useState<string | null>(null);
    const [opponentName, setOpponentName] = useState("Opponent");
    const [isMyTurn, setIsMyTurn] = useState(false);
    
    // Game Data
    const [board, setBoard] = useState<number[]>([]);
    const [markedNumbers, setMarkedNumbers] = useState<number[]>([]);
    const [linesCompleted, setLinesCompleted] = useState(0);
    const [winnerUid, setWinnerUid] = useState<string | null>(null);
    const [lastCalledNumber, setLastCalledNumber] = useState<number | null>(null);
    const [hearts, setHearts] = useState({ host: 3, joiner: 3 });

    // Finding Page Animations
    const [cyclingIndex, setCyclingIndex] = useState(0);

    // UI Helpers
    const [showHowTo, setShowHowTo] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [localHistory, setLocalHistory] = useState<any[]>([]);

    // Timers
    const [countdown, setCountdown] = useState(3);
    const [searchTimeLeft, setSearchTimeLeft] = useState(60);
    const [turnTimer, setTurnTimer] = useState(15);

    const matchRef = useRef<any>(null);
    const payoutProcessed = useRef(false);

    const generateBoard = () => {
        const nums = Array.from({ length: 25 }, (_, i) => i + 1);
        return nums.sort(() => Math.random() - 0.5);
    };

    useEffect(() => {
        return () => {
            if (gameState === 'finding' && selectedTier) {
                cancelSearch(true);
            }
        };
    }, [gameState, selectedTier]);

    // Cycling avatars effect
    useEffect(() => {
        let interval: any;
        if (gameState === 'finding') {
            interval = setInterval(() => {
                setCyclingIndex(prev => (prev + 1) % RANDOM_NAMES.length);
            }, 150);
        }
        return () => clearInterval(interval);
    }, [gameState]);

    // FIXED SEARCH TIMER
    useEffect(() => {
        let interval: any;
        if (gameState === 'finding') {
            setSearchTimeLeft(60);
            interval = setInterval(() => {
                setSearchTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(interval);
                        cancelSearch();
                        showToast("Searching failed. No players online.", "info");
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => { if(interval) clearInterval(interval); };
    }, [gameState]);

    const handleJoinQueue = async (tier: { entry: number, prize: number }) => {
        const balance = (user.wallet.added || 0) + (user.wallet.winning || 0);
        if (balance < tier.entry) {
            showToast(`Insufficient balance. Need ₹${tier.entry}`, 'error');
            onNavigateToWallet();
            return;
        }

        payoutProcessed.current = false;
        setSelectedTier(tier);
        setGameState('finding');

        const queueRoot = `bingo_queue/tier_${tier.entry}`;
        try {
            const q = query(ref(db, queueRoot), limitToFirst(10));
            const snapshot = await get(q);
            let matched = false;
            
            if (snapshot.exists()) {
                const potentialOpponents = snapshot.val();
                for (const oppUid of Object.keys(potentialOpponents)) {
                    if (oppUid === user.uid) continue;
                    const oppRef = ref(db, `${queueRoot}/${oppUid}`);
                    const newGameId = `${oppUid}_${user.uid}_${Date.now()}`;
                    
                    const result = await runTransaction(oppRef, (currentData) => {
                        if (currentData === null) return null;
                        if (currentData.matchId) return;
                        return { ...currentData, matchId: newGameId, matchedBy: user.uid };
                    });

                    if (result.committed) {
                        matched = true;
                        const opponent = result.snapshot.val();
                        const gameData = {
                            players: {
                                host: { uid: oppUid, name: opponent.name },
                                joiner: { uid: user.uid, name: user.username }
                            },
                            calls: [],
                            turn: oppUid,
                            hearts: { host: 3, joiner: 3 },
                            status: 'starting',
                            tier: tier,
                            createdAt: Date.now()
                        };
                        await set(ref(db, `bingo_games/${newGameId}`), gameData);
                        setupGame(newGameId, opponent.name);
                        break;
                    }
                }
            }
            if (!matched) {
                const myQueueRef = ref(db, `${queueRoot}/${user.uid}`);
                await set(myQueueRef, { uid: user.uid, name: user.username, timestamp: Date.now() });
                onDisconnect(myQueueRef).remove();
                waitForMatch(queueRoot, user.uid);
            }
        } catch (e) {
            setGameState('lobby');
        }
    };

    const waitForMatch = (queueRoot: string, myUid: string) => {
        const myRef = ref(db, `${queueRoot}/${myUid}`);
        const listener = onValue(myRef, (snap) => {
            const data = snap.val();
            if (!data) return;
            if (data.matchId) {
                onDisconnect(myRef).cancel();
                remove(myRef);
                setupGame(data.matchId, "Opponent");
            }
        });
        matchRef.current = listener;
    };

    const cancelSearch = async (silent = false) => {
        if (matchRef.current) { matchRef.current(); matchRef.current = null; }
        if (selectedTier) {
            const myQueuePath = `bingo_queue/tier_${selectedTier.entry}/${user.uid}`;
            const myRef = ref(db, myQueuePath);
            const snap = await get(myRef);
            if (snap.exists() && snap.val().uid === user.uid) {
                await remove(myRef);
                onDisconnect(myRef).cancel();
            }
        }
        setGameState('lobby');
        if (!silent) showToast("Search Cancelled", "info");
    };

    const setupGame = (gId: string, placeholderName: string) => {
        setGameId(gId);
        setBoard(generateBoard());
        setMarkedNumbers([]);
        setLinesCompleted(0);
        setWinnerUid(null);
        setGameState('countdown');
        setHearts({ host: 3, joiner: 3 });
        
        let attempts = 0;
        const fetchDetails = async () => {
            const snap = await get(ref(db, `bingo_games/${gId}`));
            if(snap.exists()) {
                const val = snap.val();
                const isHost = val.players.host.uid === user.uid;
                setOpponentName(isHost ? val.players.joiner.name : val.players.host.name);
                setIsMyTurn(val.turn === user.uid);
            } else if (attempts < 3) {
                attempts++; setTimeout(fetchDetails, 500);
            }
        };
        fetchDetails();
    };

    useEffect(() => {
        let interval: any;
        if (gameState === 'countdown') {
            interval = setInterval(() => {
                setCountdown(prev => {
                    if (prev === 1) {
                        clearInterval(interval);
                        processEntryFee();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [gameState]);

    const processEntryFee = async () => {
        if (!selectedTier || !gameId) return;
        try {
            const cost = selectedTier.entry;
            let added = user.wallet.added || 0;
            let winning = user.wallet.winning || 0;
            if (added >= cost) added -= cost;
            else { const rem = cost - added; added = 0; winning -= rem; }
            await update(ref(db, `users/${user.uid}/wallet`), { added, winning });
            await push(ref(db, `transactions/${user.uid}`), {
                type: 'game', amount: cost, date: Date.now(), details: 'Bingo Entry', category: 'winning', closingBalance: added + winning
            });
            await updateSystemWallet(cost, "Bingo Entry");
            setGameState('playing');
            setTurnTimer(15);
        } catch (e) {
            setGameState('lobby');
        }
    };

    useEffect(() => {
        if (gameState === 'playing' && gameId) {
            const gameRef = ref(db, `bingo_games/${gameId}`);
            const unsub = onValue(gameRef, (snap) => {
                const data = snap.val();
                if (data) {
                    if (data.calls) {
                        const callsArray = Object.values(data.calls) as number[];
                        setMarkedNumbers(callsArray);
                        setLastCalledNumber(callsArray[callsArray.length - 1]);
                    }
                    if (data.hearts) setHearts(data.hearts);
                    setIsMyTurn(data.turn === user.uid);
                    if (data.winner) handleGameEnd(data.winner);
                }
            });
            return () => unsub();
        }
    }, [gameState, gameId]);

    useEffect(() => {
        if (gameState === 'playing' && markedNumbers.length >= 5) {
            const lines = checkLines(board, markedNumbers);
            setLinesCompleted(lines);
            if (lines >= 5 && !winnerUid) {
                update(ref(db, `bingo_games/${gameId}`), { winner: user.uid });
            }
        }
    }, [markedNumbers, board, gameState]);

    useEffect(() => {
        let interval: any;
        if (gameState === 'playing' && !winnerUid) {
            interval = setInterval(() => {
                setTurnTimer(prev => {
                    if (prev <= 1) {
                        if (isMyTurn) handleTimeout();
                        return 15;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isMyTurn, gameState, winnerUid]);

    useEffect(() => { setTurnTimer(15); }, [isMyTurn]);

    const handleTimeout = async () => {
        if (!isMyTurn || !gameId || winnerUid) return;
        const snap = await get(ref(db, `bingo_games/${gameId}`));
        if(!snap.exists()) return;
        const data = snap.val();
        const myRole = data.players.host.uid === user.uid ? 'host' : 'joiner';
        const nextHearts = Math.max(0, data.hearts[myRole] - 1);
        const nextTurn = data.players.host.uid === user.uid ? data.players.joiner.uid : data.players.host.uid;
        const updates: any = {
            [`bingo_games/${gameId}/hearts/${myRole}`]: nextHearts,
            [`bingo_games/${gameId}/turn`]: nextTurn
        };
        if (nextHearts <= 0) {
            updates[`bingo_games/${gameId}/winner`] = nextTurn;
        }
        await update(ref(db), updates);
        showToast("Time Out! Heart Lost.", "error");
    };

    const handleNumberClick = async (num: number) => {
        if (!isMyTurn || markedNumbers.includes(num) || winnerUid) return;
        const snap = await get(ref(db, `bingo_games/${gameId}/players`));
        if(!snap.exists()) return;
        const p = snap.val();
        const nextTurn = p.host.uid === user.uid ? p.joiner.uid : p.host.uid;
        await push(ref(db, `bingo_games/${gameId}/calls`), num);
        await update(ref(db, `bingo_games/${gameId}`), { turn: nextTurn });
    };

    const checkLines = (grid: number[], marked: number[]) => {
        let count = 0;
        for(let i=0; i<5; i++) {
            let rowFull = true; for(let j=0; j<5; j++) if(!marked.includes(grid[i*5 + j])) rowFull = false;
            if(rowFull) count++;
            let colFull = true; for(let j=0; j<5; j++) if(!marked.includes(grid[j*5 + i])) colFull = false;
            if(colFull) count++;
        }
        let d1 = true; for(let i=0; i<5; i++) if(!marked.includes(grid[i*5+i])) d1 = false;
        if(d1) count++;
        let d2 = true; for(let i=0; i<5; i++) if(!marked.includes(grid[i*5 + (4-i)])) d2 = false;
        if(d2) count++;
        return count;
    };

    const handleGameEnd = async (wUid: string) => {
        if (payoutProcessed.current) return;
        setWinnerUid(wUid);
        setGameState('result');
        if (!selectedTier) return;
        if (wUid === user.uid) {
            payoutProcessed.current = true;
            const prize = selectedTier.prize;
            const newWinning = (user.wallet.winning || 0) + prize;
            await update(ref(db, `users/${user.uid}/wallet`), { winning: newWinning });
            await push(ref(db, `transactions/${user.uid}`), {
                type: 'game', amount: prize, date: Date.now(), details: 'Bingo Win', category: 'winning', closingBalance: newWinning + (user.wallet.added || 0)
            });
            await updateSystemWallet(-prize, "Bingo Payout");
        }
    };

    const resetGame = () => {
        setGameState('lobby');
        setWinnerUid(null);
        setGameId(null);
        setSelectedTier(null);
        payoutProcessed.current = false;
    };

    const handlePlayAgain = () => {
        const prevTier = selectedTier;
        if (!prevTier) {
            resetGame();
            return;
        }
        setWinnerUid(null);
        setGameId(null);
        payoutProcessed.current = false;
        handleJoinQueue(prevTier);
    };

    const fetchHistory = async () => {
        setShowHistory(true);
        const snap = await get(ref(db, `transactions/${user.uid}`));
        if (snap.exists()) {
            const data = snap.val();
            const list = Object.keys(data)
                .map(k => ({...data[k], id: k}))
                .filter(t => t.details?.includes("Bingo"))
                .reverse()
                .slice(0, 10);
            setLocalHistory(list);
        }
    };

    const myHearts = opponentName === "Opponent" ? 3 : (gameId && hearts ? (hearts as any)[user.uid === gameId.split('_')[0] ? 'host' : 'joiner'] : 3);
    const oppHearts = opponentName === "Opponent" ? 3 : (gameId && hearts ? (hearts as any)[user.uid === gameId.split('_')[0] ? 'joiner' : 'host'] : 3);

    return (
        <div className="fixed inset-0 bg-slate-950 text-white flex flex-col font-sans z-[150]">
            {/* Header - Hidden during finding and result */}
            {gameState !== 'finding' && gameState !== 'result' && (
                <div className="bg-gradient-to-b from-purple-900 to-slate-950 border-b border-purple-900/50 pb-6 pt-4 px-6 shadow-xl relative overflow-hidden shrink-0">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-pink-600/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                    <div className="flex items-start justify-between relative z-10">
                        <button onClick={onBack} className="w-10 h-10 rounded-xl bg-slate-800/50 border border-white/10 flex items-center justify-center hover:bg-slate-700 transition">
                            <i className="fa-solid fa-arrow-left text-slate-300"></i>
                        </button>
                        <div className="flex items-center gap-2">
                            <button onClick={fetchHistory} className="w-10 h-10 rounded-xl bg-slate-800/50 border border-white/10 flex items-center justify-center text-slate-300"><i className="fa-solid fa-clock-rotate-left"></i></button>
                            <button onClick={() => setShowHowTo(true)} className="w-10 h-10 rounded-xl bg-slate-800/50 border border-white/10 flex items-center justify-center text-slate-300"><i className="fa-solid fa-circle-info"></i></button>
                        </div>
                    </div>
                    
                    <div className="mt-6 flex items-center gap-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30 rotate-3">
                            <i className="fa-solid fa-table-cells text-3xl text-white"></i>
                        </div>
                        <div>
                            <h1 className="text-2xl font-extrabold tracking-tight text-white drop-shadow-md">BINGO</h1>
                            <p className="text-xs text-purple-200 font-medium bg-purple-900/40 px-2 py-0.5 rounded-lg w-fit mt-1 border border-purple-500/20">Classic 1 vs 1</p>
                        </div>
                    </div>
                </div>
            )}

            {/* LOBBY */}
            {gameState === 'lobby' && (
                <div className="flex-1 p-5 overflow-y-auto">
                    <div className="flex items-center gap-2 mb-4">
                        <i className="fa-solid fa-fire text-orange-500 animate-pulse"></i>
                        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Select Table</h3>
                    </div>
                    <div className="grid gap-4">
                        {TIERS.map((tier, idx) => (
                            <div key={idx} className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-pink-500/50 transition-all duration-300">
                                <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-slate-800 via-transparent to-transparent opacity-50"></div>
                                <div className="flex items-center justify-between relative z-10">
                                    <div className="flex flex-col gap-1">
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Entry</p>
                                        <p className="text-2xl font-black text-white">₹{tier.entry}</p>
                                        <p className="text-xs font-bold text-green-400 mt-1">Win ₹{tier.prize}</p>
                                    </div>
                                    <button onClick={() => handleJoinQueue(tier)} className="h-12 px-8 bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-2xl text-sm font-bold shadow-xl shadow-purple-900/30 active:scale-95 transition-transform flex items-center gap-2">PLAY <i className="fa-solid fa-play"></i></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* FINDING OVERHAUL */}
            {gameState === 'finding' && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-950 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-900/20 via-slate-950 to-slate-950"></div>
                    
                    {/* Top Timer Circle */}
                    <div className="relative z-10 mb-12 flex flex-col items-center">
                        <div className="w-24 h-24 rounded-full border-4 border-slate-800 flex items-center justify-center relative">
                            <div className="absolute inset-0 border-4 border-pink-500 rounded-full border-t-transparent animate-spin"></div>
                            <span className="text-3xl font-black text-white">{searchTimeLeft}</span>
                        </div>
                        <div className="mt-4 flex items-center gap-2 bg-slate-900/50 px-3 py-1 rounded-full border border-white/5 backdrop-blur-sm">
                            <div className={`w-2 h-2 rounded-full ${latency ? 'bg-pink-500 animate-pulse' : 'bg-slate-600'}`}></div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{latency ? `Connection: Stable (${latency}ms)` : 'Connecting...'}</span>
                        </div>
                    </div>

                    {/* VS Player Icons */}
                    <div className="flex items-center gap-6 relative z-10 mb-16">
                        {/* Me */}
                        <div className="flex flex-col items-center gap-2 animate-[slide-up_0.4s_ease-out]">
                            <div className="relative">
                                <div className="w-28 h-28 rounded-full border-4 border-pink-500 p-1 shadow-[0_0_20px_rgba(236,72,153,0.3)] overflow-hidden bg-slate-800">
                                    <img src={user.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} className="w-full h-full rounded-full object-cover" />
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-10 h-10 bg-pink-600 rounded-xl flex items-center justify-center border-2 border-slate-950 shadow-lg rotate-12">
                                    <i className="fa-solid fa-bolt-lightning text-white text-xl"></i>
                                </div>
                            </div>
                            <span className="text-xs font-bold text-pink-400 uppercase tracking-widest">Player 1</span>
                        </div>

                        {/* VS Text */}
                        <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center border border-white/10 backdrop-blur-sm">
                            <span className="text-sm font-black italic text-slate-500">VS</span>
                        </div>

                        {/* Opponent Cycler */}
                        <div className="flex flex-col items-center gap-2 animate-[slide-up_0.4s_ease-out_0.1s]">
                            <div className="relative">
                                <div className="w-28 h-28 rounded-full border-4 border-slate-800 p-1 overflow-hidden bg-slate-800">
                                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${RANDOM_NAMES[cyclingIndex]}`} className="w-full h-full rounded-full object-cover transition-opacity duration-150" />
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center border-2 border-slate-950 shadow-lg -rotate-12">
                                    <i className="fa-solid fa-question text-white text-xl"></i>
                                </div>
                            </div>
                            <span className="text-xs font-bold text-slate-500 animate-pulse uppercase tracking-widest">Searching</span>
                        </div>
                    </div>
                    
                    <h3 className="text-lg font-bold text-white mb-8 animate-pulse relative z-10 tracking-widest uppercase">Finding Match...</h3>

                    <button onClick={() => cancelSearch()} className="px-10 py-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-pink-500 font-black text-xs uppercase tracking-widest hover:bg-pink-500/10 active:scale-95 transition-all z-10 shadow-xl">
                        Cancel Search
                    </button>
                </div>
            )}

            {/* COUNTDOWN */}
            {gameState === 'countdown' && (
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-900">
                    <div className="text-[120px] font-black text-transparent bg-clip-text bg-gradient-to-b from-pink-400 to-purple-600 animate-bounce">{countdown > 0 ? countdown : "GO!"}</div>
                </div>
            )}

            {/* GAME BOARD */}
            {gameState === 'playing' && (
                <div className="flex-1 flex flex-col p-4 max-w-md mx-auto w-full overflow-y-auto">
                    {/* Header Info */}
                    <div className="flex justify-between items-center mb-6 bg-slate-900/50 p-3 rounded-2xl border border-slate-800">
                        <div className={`flex flex-col items-center px-4 transition-opacity ${isMyTurn ? 'opacity-100 scale-105' : 'opacity-50'}`}>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">You</span>
                            <div className="flex gap-0.5 my-0.5">
                                {[1,2,3].map(i => <i key={i} className={`fa-solid fa-heart text-[8px] ${i <= myHearts ? 'text-red-500' : 'text-slate-700'}`}></i>)}
                            </div>
                            <span className="text-xs font-bold text-white">Line: {linesCompleted}/5</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className={`text-2xl font-mono font-black ${turnTimer < 5 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>{turnTimer}</span>
                            <span className="text-[8px] text-slate-500 uppercase font-bold">Sec</span>
                        </div>
                        <div className={`flex flex-col items-center px-4 transition-opacity ${!isMyTurn ? 'opacity-100 scale-105' : 'opacity-50'}`}>
                            <span className="text-[10px] font-bold text-slate-400 uppercase truncate max-w-[60px]">{opponentName}</span>
                            <div className="flex gap-0.5 my-0.5">
                                {[1,2,3].map(i => <i key={i} className={`fa-solid fa-heart text-[8px] ${i <= oppHearts ? 'text-red-500' : 'text-slate-700'}`}></i>)}
                            </div>
                            <span className="text-xs font-bold text-white">{!isMyTurn ? 'Thinking...' : 'Waiting'}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-5 gap-2 mb-2 px-1">
                        {['B', 'I', 'N', 'G', 'O'].map((char, i) => (
                            <div key={i} className={`h-10 flex items-center justify-center rounded-lg font-black text-xl transition-all duration-500 ${i < linesCompleted ? 'bg-gradient-to-b from-yellow-300 to-orange-500 text-black shadow-[0_0_15px_rgba(234,179,8,0.6)] scale-110' : 'bg-slate-800 text-slate-600'}`}>{char}</div>
                        ))}
                    </div>

                    <div className="grid grid-cols-5 gap-2 aspect-square bg-slate-900 p-2 rounded-2xl border border-slate-800 shadow-2xl relative">
                        {board.map((num, idx) => {
                            const isMarked = markedNumbers.includes(num);
                            const isLast = lastCalledNumber === num;
                            return (
                                <button key={idx} onClick={() => handleNumberClick(num)} disabled={isMarked || !isMyTurn || !!winnerUid} className={`rounded-xl flex items-center justify-center text-lg font-bold transition-all duration-200 relative overflow-hidden ${isMarked ? 'bg-gradient-to-br from-pink-600 to-purple-700 text-white shadow-inner border border-purple-500/50' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 active:scale-95'} ${!isMarked && isMyTurn ? 'ring-2 ring-purple-500/20' : ''}`}>
                                    {isLast && <div className="absolute inset-0 bg-white/30 animate-ping rounded-xl"></div>}
                                    {num}
                                </button>
                            );
                        })}
                    </div>
                    
                    <p className="text-center text-xs text-slate-500 mt-6 font-medium">{isMyTurn ? "Your Turn - Pick a number" : `Waiting for ${opponentName}...`}</p>
                </div>
            )}

            {/* DEDICATED RESULT PAGE */}
            {gameState === 'result' && winnerUid && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-950 animate-[fade-enter_0.3s]">
                    <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 text-center shadow-2xl relative overflow-hidden">
                        <div className={`absolute top-0 left-0 w-full h-2 ${winnerUid === user.uid ? 'bg-pink-500' : 'bg-red-500'}`}></div>
                        
                        <div className="relative z-10">
                            <div className="text-7xl mb-6 transform scale-125 animate-bounce">
                                {winnerUid === user.uid ? '🏆' : '💀'}
                            </div>

                            <h2 className={`text-4xl font-black mb-1 uppercase tracking-tighter italic ${winnerUid === user.uid ? 'text-pink-500' : 'text-red-500'}`}>
                                {winnerUid === user.uid ? 'VICTORY' : 'DEFEAT'}
                            </h2>
                            
                            <div className="flex items-center justify-center gap-2 mb-8">
                                <div className="h-[1px] bg-slate-800 flex-1"></div>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Bingo Battle Result</span>
                                <div className="h-[1px] bg-slate-800 flex-1"></div>
                            </div>

                            {/* Prize section */}
                            {winnerUid === user.uid && selectedTier && (
                                <div className="bg-pink-500/10 border border-pink-500/20 rounded-2xl p-4 mb-8">
                                    <p className="text-[10px] text-pink-500/70 font-bold uppercase mb-1">Profit Credited</p>
                                    <p className="text-3xl font-black text-pink-400">₹{selectedTier.prize}</p>
                                </div>
                            )}

                            {/* Versus Details */}
                            <div className="flex items-center justify-between mb-10 px-4">
                                <div className="flex flex-col items-center gap-1">
                                    <img src={user.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} className="w-12 h-12 rounded-full border-2 border-pink-500" />
                                    <span className="text-[10px] font-bold text-pink-400">YOU</span>
                                    <span className="text-xs font-bold text-slate-400">{linesCompleted}/5 Lines</span>
                                </div>
                                <div className="text-slate-700 font-black italic">VS</div>
                                <div className="flex flex-col items-center gap-1">
                                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${opponentName}`} className="w-12 h-12 rounded-full border-2 border-purple-500" />
                                    <span className="text-[10px] font-bold text-purple-400 uppercase">{opponentName.split(' ')[0]}</span>
                                    <span className="text-xs font-bold text-slate-400">Battle Over</span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <button 
                                    onClick={handlePlayAgain}
                                    className="w-full py-4 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-black rounded-2xl shadow-lg shadow-pink-900/40 transform active:scale-95 transition-all uppercase tracking-widest text-sm"
                                >
                                    Play Again (₹{selectedTier?.entry})
                                </button>
                                <button 
                                    onClick={resetGame}
                                    className="w-full py-3 bg-slate-800 text-slate-300 font-bold rounded-2xl border border-slate-700 hover:bg-slate-700 transition-all uppercase text-xs tracking-widest"
                                >
                                    Exit to Lobby
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modals similar to TicTacToe */}
            {showHistory && (
                <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-[fade-enter_0.2s]" onClick={() => setShowHistory(false)}>
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4"><h3 className="font-bold">Bingo History</h3><button onClick={() => setShowHistory(false)}><i className="fa-solid fa-xmark"></i></button></div>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                            {localHistory.length === 0 ? <p className="text-center text-slate-500 text-xs py-4">No recent bingo transactions</p> : 
                            localHistory.map(h => (
                                <div key={h.id} className="bg-slate-800 p-3 rounded-xl flex justify-between items-center">
                                    <div><p className="text-xs font-bold text-slate-200">{h.details}</p><p className="text-[10px] text-slate-500">{new Date(h.date).toLocaleString()}</p></div>
                                    <p className={`font-bold ${h.details?.includes("Win") ? 'text-green-500' : 'text-red-500'}`}>{h.details?.includes("Win") ? '+' : '-'}₹{h.amount}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {showHowTo && (
                <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-[fade-enter_0.2s]" onClick={() => setShowHowTo(false)}>
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4"><h3 className="font-bold">How To Play Bingo</h3><button onClick={() => setShowHowTo(false)}><i className="fa-solid fa-xmark"></i></button></div>
                        <div className="space-y-3 text-xs text-slate-400">
                            <p>1. <strong className="text-white">Grid:</strong> You have a 5x5 grid with numbers 1-25. Symbols B-I-N-G-O represent your progress.</p>
                            <p>2. <strong className="text-white">Gameplay:</strong> On your turn, pick a number. It gets marked on BOTH players' grids.</p>
                            <p>3. <strong className="text-white">Winning:</strong> Complete 5 lines (Horizontal, Vertical, or Diagonal) to win. Each line lights up one letter of B-I-N-G-O.</p>
                            <p>4. <strong className="text-white">Hearts:</strong> You have 3 Hearts. If your 15s timer runs out on your turn, you lose a heart. Lose all hearts = Defeat.</p>
                        </div>
                        <button onClick={() => setShowHowTo(false)} className="w-full mt-6 bg-pink-600 py-3 rounded-xl font-bold text-sm">Got it!</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BingoScreen;
