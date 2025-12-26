
import React, { useState, useEffect, useRef } from "react";
import { UserProfile, ToastType } from "../../types";
import { update, ref, push, onValue, remove, get, set, runTransaction, query, limitToFirst, onDisconnect } from "firebase/database";
import { db } from "../../firebase";
import { updateSystemWallet } from "../../utils";

type GameState = 'lobby' | 'finding' | 'search_timeout' | 'matched' | 'countdown' | 'playing' | 'result';

interface BingoCall {
    num: number;
    uid: string;
}

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
    const [opponentPic, setOpponentPic] = useState("");
    const [opponentUid, setOpponentUid] = useState<string | null>(null);
    const [isMyTurn, setIsMyTurn] = useState(false);
    
    // Game Data
    const [board, setBoard] = useState<number[]>([]);
    const [markedNumbers, setMarkedNumbers] = useState<number[]>([]);
    const [calls, setCalls] = useState<BingoCall[]>([]);
    const [linesCompleted, setLinesCompleted] = useState(0);
    const [oppLinesCompleted, setOppLinesCompleted] = useState(0);
    const [winnerUid, setWinnerUid] = useState<string | null>(null);
    const [lastCalledNumber, setLastCalledNumber] = useState<number | null>(null);
    const [hearts, setHearts] = useState({ host: 3, joiner: 3 });
    const [exitReason, setExitReason] = useState<string | null>(null);

    // UI State
    const [showHowTo, setShowHowTo] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [localHistory, setLocalHistory] = useState<any[]>([]);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const [showGameExitConfirm, setShowGameExitConfirm] = useState(false);
    const [cyclingIndex, setCyclingIndex] = useState(0);

    // Timers
    const [countdown, setCountdown] = useState(3);
    const [searchTimeLeft, setSearchTimeLeft] = useState(60);
    const [timeoutCountdown, setTimeoutCountdown] = useState(3);
    const [turnTimer, setTurnTimer] = useState(15);

    const matchRef = useRef<any>(null);
    const payoutProcessed = useRef(false);
    const stateRef = useRef<GameState>('lobby');

    useEffect(() => { stateRef.current = gameState; }, [gameState]);

    useEffect(() => {
        return () => {
            if (stateRef.current === 'finding' || stateRef.current === 'matched') {
                cancelSearch(true);
            }
        };
    }, []);

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

    // Search Timer Logic
    useEffect(() => {
        let interval: any;
        if (gameState === 'finding') {
            setSearchTimeLeft(60);
            interval = setInterval(() => {
                setSearchTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(interval);
                        setGameState('search_timeout');
                        setTimeoutCountdown(3);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [gameState]);

    // Search Timeout Auto-Redirect
    useEffect(() => {
        let interval: any;
        if (gameState === 'search_timeout') {
            interval = setInterval(() => {
                setTimeoutCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(interval);
                        cancelSearch(true);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [gameState]);

    const handleJoinQueue = async (tier: { entry: number, prize: number }) => {
        const balance = (user.wallet.added || 0) + (user.wallet.winning || 0);
        if (balance < tier.entry) {
            showToast(`Insufficient balance. Need ₹${tier.entry}`, 'error');
            onNavigateToWallet();
            return;
        }

        payoutProcessed.current = false;
        setExitReason(null);
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
                        setupGame(newGameId, opponent.name, oppUid);
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
                const oppId = data.matchId.split('_')[0];
                setupGame(data.matchId, "Opponent", oppId);
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
        setShowLeaveConfirm(false);
        if (!silent) showToast("Search Cancelled", "info");
    };

    const setupGame = (gId: string, placeholderName: string, oppId: string) => {
        setGameId(gId);
        setBoard(generateBoard());
        setMarkedNumbers([]);
        setCalls([]);
        setLinesCompleted(0);
        setOppLinesCompleted(0);
        setWinnerUid(null);
        setHearts({ host: 3, joiner: 3 });
        setOpponentUid(oppId);
        setGameState('matched');
        
        let attempts = 0;
        const fetchDetails = async () => {
            const snap = await get(ref(db, `bingo_games/${gId}`));
            if(snap.exists()) {
                const val = snap.val();
                const isHost = val.players.host.uid === user.uid;
                const opName = isHost ? val.players.joiner.name : val.players.host.name;
                const opUid = isHost ? val.players.joiner.uid : val.players.host.uid;
                setOpponentName(opName);
                setOpponentUid(opUid);
                setOpponentPic(`https://api.dicebear.com/7.x/avataaars/svg?seed=${opName}`);
                setIsMyTurn(val.turn === user.uid);
            } else if (attempts < 3) {
                attempts++; setTimeout(fetchDetails, 500);
            } else {
                setOpponentName(placeholderName);
                setOpponentPic(`https://api.dicebear.com/7.x/avataaars/svg?seed=${placeholderName}`);
            }
        };
        fetchDetails();

        setTimeout(() => {
            if(stateRef.current === 'matched') {
                setGameState('countdown');
                setCountdown(3);
            }
        }, 3000);
    };

    const generateBoard = () => {
        const nums = Array.from({ length: 25 }, (_, i) => i + 1);
        return nums.sort(() => Math.random() - 0.5);
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
                        const callsArray = Object.values(data.calls) as BingoCall[];
                        setCalls(callsArray);
                        const nums = callsArray.map(c => c.num);
                        setMarkedNumbers(nums);
                        setLastCalledNumber(nums[nums.length - 1]);
                        
                        // Opponent Score Tracking
                        // To show opponent score correctly, we simulate their potential board? 
                        // In 1v1 Bingo, usually you see your lines. We'll show their line count 
                        // if we want to be competitive, but usually opponent board is hidden.
                        // For SM EARN competitive feel, we'll assume opponent board is similarly 1-25.
                        // Realistically we can't know their board without storing it.
                        // Let's add board storage to sync scores.
                    }
                    if (data.hearts) setHearts(data.hearts);
                    setIsMyTurn(data.turn === user.uid);
                    if (data.winner) {
                        if (data.exitReason) setExitReason(data.exitReason);
                        handleGameEnd(data.winner);
                    }
                }
            });
            return () => unsub();
        }
    }, [gameState, gameId]);

    // Local Win Detection
    useEffect(() => {
        if (gameState === 'playing' && markedNumbers.length >= 5) {
            const lines = checkLines(board, markedNumbers);
            setLinesCompleted(lines);
            
            // Only declaring winner if it's NOT already declared
            // AND only if I have 5 lines.
            // Problem 1 Fix: The person WHO PICKED the number should declare victory 
            // if they hit 5 lines. The opponent will see it via the DB update.
            if (lines >= 5 && !winnerUid && isMyTurn === false) {
                 // I reached bingo from an opponent's pick.
                 // We'll let the caller's logic handle the state update to avoid race conditions.
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
            updates[`bingo_games/${gameId}/exitReason`] = "TIMEOUT";
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

        // Check if I win AFTER picking this number
        const newMarked = [...markedNumbers, num];
        const newLines = checkLines(board, newMarked);
        
        const updates: any = {};
        const callRef = push(ref(db, `bingo_games/${gameId}/calls`));
        updates[`bingo_games/${gameId}/calls/${callRef.key}`] = { num, uid: user.uid };
        updates[`bingo_games/${gameId}/turn`] = nextTurn;

        if (newLines >= 5) {
            // I WIN! Fixed Problem 1: Priority to the active caller.
            updates[`bingo_games/${gameId}/winner`] = user.uid;
        }

        await update(ref(db), updates);
    };

    const handleLeaveGame = async () => {
        if (!gameId || winnerUid) return;
        const snap = await get(ref(db, `bingo_games/${gameId}`));
        if(!snap.exists()) return;
        const p = snap.val().players;
        const oppUid = p.host.uid === user.uid ? p.joiner.uid : p.host.uid;
        
        await update(ref(db, `bingo_games/${gameId}`), {
            winner: oppUid,
            exitReason: "LEFT"
        });
        setShowGameExitConfirm(false);
    };

    const checkLines = (grid: number[], marked: number[]) => {
        let count = 0;
        // Rows
        for(let i=0; i<5; i++) {
            let rowFull = true; for(let j=0; j<5; j++) if(!marked.includes(grid[i*5 + j])) rowFull = false;
            if(rowFull) count++;
        }
        // Cols
        for(let i=0; i<5; i++) {
            let colFull = true; for(let j=0; j<5; j++) if(!marked.includes(grid[j*5 + i])) colFull = false;
            if(colFull) count++;
        }
        // Diagonals
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
            showToast("Victory!", "success");
        }
    };

    const resetGame = () => {
        setGameState('lobby');
        setWinnerUid(null);
        setGameId(null);
        setSelectedTier(null);
        payoutProcessed.current = false;
        setShowLeaveConfirm(false);
        setShowGameExitConfirm(false);
        setExitReason(null);
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

    const myHearts = gameId && hearts ? (hearts as any)[user.uid === gameId.split('_')[0] ? 'host' : 'joiner'] : 3;
    const oppHearts = gameId && hearts ? (hearts as any)[user.uid === gameId.split('_')[0] ? 'joiner' : 'host'] : 3;

    return (
        <div className="fixed inset-0 bg-slate-950 text-white flex flex-col font-sans z-[150]">
            {/* Beast Header */}
            {(gameState === 'lobby' || gameState === 'finding' || gameState === 'search_timeout') && (
                <div className="bg-gradient-to-b from-purple-900 to-slate-950 border-b border-purple-900/50 pb-6 pt-4 px-6 shadow-xl relative overflow-hidden shrink-0">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-pink-600/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                    <div className="flex items-start justify-between relative z-10">
                        {gameState === 'lobby' ? (
                            <button onClick={onBack} className="w-10 h-10 rounded-xl bg-slate-800/50 border border-white/10 flex items-center justify-center hover:bg-slate-700 transition">
                                <i className="fa-solid fa-arrow-left text-slate-300"></i>
                            </button>
                        ) : (
                            <button onClick={() => setShowLeaveConfirm(true)} className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 hover:bg-red-500/20 transition active:scale-95">
                                <i className="fa-solid fa-right-from-bracket"></i>
                            </button>
                        )}
                        <div className="flex items-center gap-2">
                            {latency !== null && (
                                <div className="flex items-center gap-1 bg-slate-900/50 px-2 py-1 rounded-full border border-purple-500/30 text-[10px] font-bold text-slate-400">
                                    <i className="fa-solid fa-signal text-green-500"></i> {latency}ms
                                </div>
                            )}
                            <button onClick={fetchHistory} className="w-10 h-10 rounded-xl bg-slate-800/50 border border-white/10 flex items-center justify-center text-slate-300"><i className="fa-solid fa-clock-rotate-left"></i></button>
                            <button onClick={() => setShowHowTo(true)} className="w-10 h-10 rounded-xl bg-slate-800/50 border border-white/10 flex items-center justify-center text-slate-300"><i className="fa-solid fa-circle-info"></i></button>
                        </div>
                    </div>
                    {gameState === 'lobby' && (
                        <div className="mt-6 flex items-center gap-4 animate-[fade-enter_0.3s]">
                            <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30 rotate-3">
                                <i className="fa-solid fa-table-cells text-3xl text-white"></i>
                            </div>
                            <div>
                                <h1 className="text-2xl font-extrabold tracking-tight text-white drop-shadow-md">BINGO</h1>
                                <p className="text-xs text-purple-200 font-medium bg-purple-900/40 px-2 py-0.5 rounded-lg w-fit mt-1 border border-purple-500/20">Classic 1 vs 1</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* LOBBY */}
            {gameState === 'lobby' && (
                <div className="flex-1 p-5 overflow-y-auto animate-[fade-enter_0.3s]">
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

            {/* FINDING OPPONENT */}
            {gameState === 'finding' && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-950 relative overflow-hidden animate-[fade-enter_0.3s]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-900/20 via-slate-950 to-slate-950"></div>
                    
                    <div className="relative z-10 mb-12 flex flex-col items-center">
                        <div className="w-24 h-24 rounded-full border-4 border-slate-800 flex items-center justify-center relative">
                            <div className="absolute inset-0 border-4 border-pink-500 rounded-full border-t-transparent animate-spin"></div>
                            <span className="text-3xl font-black text-white">{searchTimeLeft}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-6 relative z-10 mb-16">
                        <div className="flex flex-col items-center gap-2 animate-[slide-up_0.4s_ease-out]">
                            <div className="relative">
                                <div className="w-28 h-28 rounded-full border-4 border-pink-500 p-1 shadow-[0_0_20px_rgba(236,72,153,0.3)] overflow-hidden bg-slate-800">
                                    <img src={user.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} className="w-full h-full rounded-full object-cover" />
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-10 h-10 bg-pink-600 rounded-xl flex items-center justify-center border-2 border-slate-950 shadow-lg rotate-12">
                                    <i className="fa-solid fa-check text-white text-lg"></i>
                                </div>
                            </div>
                            <span className="text-xs font-bold text-pink-400 uppercase tracking-widest">YOU</span>
                        </div>

                        <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center border border-white/10 backdrop-blur-sm">
                            <span className="text-sm font-black italic text-slate-500">VS</span>
                        </div>

                        <div className="flex flex-col items-center gap-2 animate-[slide-up_0.4s_ease-out_0.1s]">
                            <div className="relative">
                                <div className="w-28 h-28 rounded-full border-4 border-slate-800 p-1 overflow-hidden bg-slate-800">
                                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${RANDOM_NAMES[cyclingIndex]}`} className="w-full h-full rounded-full object-cover transition-opacity duration-150" />
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center border-2 border-slate-950 shadow-lg -rotate-12">
                                    <i className="fa-solid fa-magnifying-glass text-white text-sm animate-pulse"></i>
                                </div>
                            </div>
                            <span className="text-xs font-bold text-slate-500 animate-pulse uppercase tracking-widest">Searching</span>
                        </div>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-8 animate-pulse relative z-10 tracking-widest uppercase">Finding Match...</h3>
                </div>
            )}

            {/* BATTLE START SPLASH */}
            {gameState === 'matched' && (
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 p-8 relative overflow-hidden animate-[fade-enter_0.3s]">
                     <div className="absolute inset-0 bg-pink-600/10 opacity-30 animate-pulse"></div>
                     <div className="text-5xl font-black text-white italic tracking-tighter animate-[bounce_0.5s_infinite] drop-shadow-lg mb-12 text-center uppercase">
                        Bingo Battle Start!
                     </div>
                     <div className="flex items-center gap-12 relative z-10">
                        <div className="flex flex-col items-center gap-3 animate-[slide-down_0.5s_ease-out]">
                            <div className="w-32 h-32 rounded-full border-4 border-pink-500 p-1 bg-slate-900 shadow-[0_0_30px_rgba(236,72,153,0.5)]">
                                <img src={user.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} className="w-full h-full rounded-full object-cover" />
                            </div>
                            <span className="text-sm font-black text-pink-400 uppercase tracking-widest truncate max-w-[120px]">{user.username}</span>
                        </div>
                        <div className="text-4xl font-black text-slate-700 italic">VS</div>
                        <div className="flex flex-col items-center gap-3 animate-[slide-up_0.5s_ease-out]">
                            <div className="w-32 h-32 rounded-full border-4 border-purple-500 p-1 bg-slate-900 shadow-[0_0_30px_rgba(168,85,247,0.5)]">
                                <img src={opponentPic} className="w-full h-full rounded-full object-cover" />
                            </div>
                            <span className="text-sm font-black text-purple-400 uppercase tracking-widest truncate max-w-[120px]">{opponentName}</span>
                        </div>
                     </div>
                </div>
            )}

            {gameState === 'countdown' && (
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 animate-[fade-enter_0.3s]">
                    <div className="text-[120px] font-black text-transparent bg-clip-text bg-gradient-to-b from-pink-400 to-purple-600 animate-bounce">{countdown > 0 ? countdown : "GO!"}</div>
                </div>
            )}

            {gameState === 'playing' && (
                <div className="flex-1 flex flex-col relative overflow-hidden animate-[fade-enter_0.3s]">
                    {/* Game Header Bar */}
                    <div className="bg-slate-900/80 backdrop-blur-md p-4 border-b border-slate-800 flex justify-between items-center z-20">
                        <button onClick={() => setShowGameExitConfirm(true)} className="w-10 h-10 bg-red-600/10 border border-red-500/30 text-red-500 rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-transform">
                            <i className="fa-solid fa-right-from-bracket"></i>
                        </button>

                        <div className="flex items-center gap-6">
                            <div className={`flex flex-col items-center transition-all duration-300 ${isMyTurn ? 'opacity-100 scale-105' : 'opacity-50'}`}>
                                <div className="flex gap-0.5 mb-1">
                                    {[1,2,3].map(i => <i key={i} className={`fa-solid fa-heart text-[8px] ${i <= myHearts ? 'text-red-500' : 'text-slate-700'}`}></i>)}
                                </div>
                                <span className="text-[10px] font-black text-pink-400 uppercase leading-none">YOU: {linesCompleted}/5</span>
                            </div>

                            <div className="w-12 h-12 rounded-full border-2 border-slate-800 flex items-center justify-center relative">
                                <div className="absolute inset-0 border-2 border-yellow-500 rounded-full border-t-transparent animate-spin"></div>
                                <span className={`text-xl font-mono font-black ${turnTimer < 5 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>{turnTimer}</span>
                            </div>

                            <div className={`flex flex-col items-center transition-all duration-300 ${!isMyTurn ? 'opacity-100 scale-105' : 'opacity-50'}`}>
                                <div className="flex gap-0.5 mb-1">
                                    {[1,2,3].map(i => <i key={i} className={`fa-solid fa-heart text-[8px] ${i <= oppHearts ? 'text-red-500' : 'text-slate-700'}`}></i>)}
                                </div>
                                <span className="text-[10px] font-black text-purple-400 uppercase leading-none">{opponentName.split(' ')[0]}: ?/5</span>
                            </div>
                        </div>

                        <div className="w-10"></div> {/* Spacer for symmetry */}
                    </div>

                    {/* Centered Board Container */}
                    <div className="flex-1 flex flex-col items-center justify-center p-4">
                        <div className="w-full max-w-sm flex flex-col gap-4">
                            {/* BINGO LETTERS */}
                            <div className="grid grid-cols-5 gap-2 px-1">
                                {['B', 'I', 'N', 'G', 'O'].map((char, i) => (
                                    <div key={i} className={`h-12 flex items-center justify-center rounded-2xl font-black text-2xl transition-all duration-500 shadow-lg ${i < linesCompleted ? 'bg-gradient-to-b from-yellow-300 to-orange-500 text-black shadow-[0_0_20px_rgba(234,179,8,0.5)] scale-110 rotate-3' : 'bg-slate-800 text-slate-600 border border-slate-700'}`}>
                                        {char}
                                    </div>
                                ))}
                            </div>

                            {/* THE GRID (Fixed Aspect Square) */}
                            <div className="grid grid-cols-5 gap-2 aspect-square bg-slate-900 p-2 rounded-[2rem] border border-slate-800 shadow-2xl relative">
                                {board.map((num, idx) => {
                                    const call = calls.find(c => c.num === num);
                                    const isMarked = !!call;
                                    const isOpponentPick = call && call.uid !== user.uid;
                                    const isLast = lastCalledNumber === num;

                                    return (
                                        <button 
                                            key={idx} 
                                            onClick={() => handleNumberClick(num)} 
                                            disabled={isMarked || !isMyTurn || !!winnerUid} 
                                            className={`rounded-2xl flex flex-col items-center justify-center text-lg font-black transition-all duration-300 relative overflow-hidden ${
                                                isMarked 
                                                ? (isOpponentPick 
                                                    ? 'bg-gradient-to-br from-purple-700 to-indigo-900 text-purple-100 shadow-inner border border-purple-500/50' 
                                                    : 'bg-gradient-to-br from-pink-600 to-purple-700 text-white shadow-inner border border-pink-500/50')
                                                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 active:scale-95 border border-slate-700'
                                            } ${!isMarked && isMyTurn ? 'ring-2 ring-pink-500/20' : ''}`}
                                        >
                                            {isLast && <div className="absolute inset-0 bg-white/20 animate-ping rounded-2xl"></div>}
                                            {num}
                                            {isOpponentPick && (
                                                <span className="absolute top-1 right-1.5 text-[8px] font-black text-purple-300 opacity-80 italic animate-pulse">O</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                            
                            <div className="bg-slate-900/50 backdrop-blur-sm py-3 px-6 rounded-2xl border border-slate-800 text-center shadow-xl">
                                <p className={`text-xs font-black uppercase tracking-[0.2em] ${isMyTurn ? 'text-green-400 animate-pulse' : 'text-slate-500'}`}>
                                    {isMyTurn ? "Your Turn - Pick a number" : `Waiting for ${opponentName}...`}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* RESULTS SCREEN */}
            {gameState === 'result' && (
                <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center p-6 bg-slate-950 animate-[fade-enter_0.3s]">
                    <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 text-center shadow-2xl relative overflow-hidden">
                        <div className={`absolute top-0 left-0 w-full h-2 ${winnerUid === user.uid ? 'bg-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.8)]' : 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]'}`}></div>
                        <div className="relative z-10">
                            <div className="text-7xl mb-6 transform scale-125 animate-bounce">{winnerUid === user.uid ? '🏆' : '💀'}</div>
                            <h2 className={`text-4xl font-black mb-1 uppercase italic tracking-tighter ${winnerUid === user.uid ? 'text-pink-500' : 'text-red-500'}`}>{winnerUid === user.uid ? 'VICTORY' : 'DEFEAT'}</h2>
                            
                            {exitReason === 'LEFT' && (
                                <div className="bg-white/5 py-1 px-4 rounded-full inline-block mb-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        {winnerUid === user.uid ? 'Opponent Left Match' : 'You Left Match'}
                                    </p>
                                </div>
                            )}

                            {winnerUid === user.uid && selectedTier && (
                                <div className="mt-4 bg-pink-500/10 border border-pink-500/20 rounded-2xl p-4 mb-8">
                                    <p className="text-[10px] text-pink-500/70 font-bold uppercase mb-1">Winning Amount</p>
                                    <p className="text-3xl font-black text-pink-400">₹{selectedTier.prize}</p>
                                </div>
                            )}
                            <div className="flex items-center justify-between my-10 px-4">
                                <div className="flex flex-col items-center gap-1">
                                    <img src={user.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} className="w-12 h-12 rounded-full border-2 border-pink-500" />
                                    <span className="text-[10px] font-bold text-pink-400">YOU</span>
                                    <span className="text-xs font-bold text-slate-400">{linesCompleted}/5 Lines</span>
                                </div>
                                <div className="text-slate-700 font-black italic">VS</div>
                                <div className="flex flex-col items-center gap-1">
                                    <img src={opponentPic} className="w-12 h-12 rounded-full border-2 border-purple-500" />
                                    <span className="text-[10px] font-bold text-purple-400 uppercase">{opponentName.split(' ')[0]}</span>
                                    <span className="text-xs font-bold text-slate-400">Match Over</span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3">
                                <button onClick={resetGame} className="w-full py-4 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-black rounded-2xl shadow-lg shadow-pink-900/40 transform active:scale-95 transition-all uppercase tracking-widest text-sm">Play Again</button>
                                <button onClick={onBack} className="w-full py-2 text-slate-500 font-bold text-xs uppercase tracking-widest hover:text-slate-300">Back to Menu</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* CONFIRM MODALS */}
            {showLeaveConfirm && (
                <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/60 backdrop-blur-md p-6 animate-[fade-enter_0.2s]">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-xs p-8 rounded-[2.5rem] text-center shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-red-600"></div>
                        <h3 className="text-xl font-black text-white mb-2 uppercase italic tracking-tight">Stop Search?</h3>
                        <p className="text-slate-400 text-sm mb-8 font-medium leading-relaxed">Matchmaking is currently active. Leaving will cancel your search.</p>
                        <div className="flex flex-col gap-3">
                            <button onClick={() => cancelSearch()} className="w-full py-4 bg-red-600 text-white font-black rounded-2xl text-xs uppercase shadow-xl">Yes, Exit</button>
                            <button onClick={() => setShowLeaveConfirm(false)} className="w-full py-3 bg-slate-800 text-slate-300 font-bold rounded-2xl text-xs uppercase">Wait</button>
                        </div>
                    </div>
                </div>
            )}

            {showGameExitConfirm && (
                <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/80 backdrop-blur-md p-6 animate-[fade-enter_0.2s]">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-xs p-8 rounded-[2.5rem] text-center shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-red-600"></div>
                        <h3 className="text-xl font-black text-white mb-2 uppercase italic tracking-tight">Quit Match?</h3>
                        <p className="text-slate-400 text-sm mb-8 font-medium leading-relaxed">Quitting mid-game results in <span className="text-red-500 font-bold">LOSS</span> and opponent victory.</p>
                        <div className="flex flex-col gap-3">
                            <button onClick={handleLeaveGame} className="w-full py-4 bg-red-600 text-white font-black rounded-2xl text-xs uppercase shadow-xl">Confirm Quit</button>
                            <button onClick={() => setShowGameExitConfirm(false)} className="w-full py-3 bg-slate-800 text-slate-300 font-bold rounded-2xl text-xs uppercase">Keep Playing</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BingoScreen;
