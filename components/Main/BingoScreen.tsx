
import React, { useState, useEffect, useRef } from "react";
import { UserProfile, ToastType } from "../../types";
import { update, ref, push, onValue, remove, get, set, runTransaction, query, limitToFirst, onDisconnect } from "firebase/database";
import { db } from "../../firebase";
import { updateSystemWallet } from "../../utils";

type GameState = 'lobby' | 'finding' | 'matched' | 'playing' | 'result';

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
    const [opponentName, setOpponentName] = useState("Searching...");
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

    // UI States
    const [showHowTo, setShowHowTo] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [localHistory, setLocalHistory] = useState<any[]>([]);
    const [cyclingIndex, setCyclingIndex] = useState(0);
    const [showGameExitConfirm, setShowGameExitConfirm] = useState(false);

    // Timers
    const [searchTimeLeft, setSearchTimeLeft] = useState(60);
    const [turnTimer, setTurnTimer] = useState(15);
    const [battleStartCountdown, setBattleStartCountdown] = useState(3);

    const matchRef = useRef<any>(null);
    const payoutProcessed = useRef(false);
    const stateRef = useRef<GameState>('lobby');

    useEffect(() => { stateRef.current = gameState; }, [gameState]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (stateRef.current === 'finding' || stateRef.current === 'matched') {
                cancelSearch(true);
            }
        };
    }, []);

    const generateBoard = () => {
        const nums = Array.from({ length: 25 }, (_, i) => i + 1);
        return nums.sort(() => Math.random() - 0.5);
    };

    // Cycling Avatar Animation
    useEffect(() => {
        let interval: any;
        if (gameState === 'finding') {
            interval = setInterval(() => {
                setCyclingIndex(prev => (prev + 1) % RANDOM_NAMES.length);
            }, 150);
        }
        return () => clearInterval(interval);
    }, [gameState]);

    // Search Timeout
    useEffect(() => {
        let interval: any;
        if (gameState === 'finding') {
            setSearchTimeLeft(60);
            interval = setInterval(() => {
                setSearchTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(interval);
                        cancelSearch();
                        showToast("No opponent found. Try again.", "info");
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
        setSelectedTier(tier);
        setGameState('finding');
        setOpponentName("Searching..."); 

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
                            createdAt: Date.now(),
                            lines: { [oppUid]: 0, [user.uid]: 0 }
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
            console.error(e);
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
            await remove(ref(db, myQueuePath));
        }
        setGameState('lobby');
        if(!silent) showToast("Cancelled", "info");
    };

    const setupGame = (gId: string, placeholderName: string, initialOppId: string) => {
        setGameId(gId);
        setBoard(generateBoard());
        setMarkedNumbers([]);
        setCalls([]);
        setLinesCompleted(0);
        setOppLinesCompleted(0);
        setWinnerUid(null);
        setGameState('matched'); 
        setBattleStartCountdown(3);
        
        const fetchDetails = async () => {
            const snap = await get(ref(db, `bingo_games/${gId}`));
            if(snap.exists()) {
                const val = snap.val();
                const isHost = val.players.host.uid === user.uid;
                const opName = isHost ? val.players.joiner.name : val.players.host.name;
                const opId = isHost ? val.players.joiner.uid : val.players.host.uid;
                setOpponentName(opName);
                setOpponentUid(opId);
                setOpponentPic(`https://api.dicebear.com/7.x/avataaars/svg?seed=${opName}`);
                setIsMyTurn(val.turn === user.uid);
            }
        };
        fetchDetails();
    };

    useEffect(() => {
        let interval: any;
        if (gameState === 'matched') {
            interval = setInterval(() => {
                setBattleStartCountdown(prev => {
                    if (prev <= 1) {
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

    // Game Loop Listener
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
                    }
                    if (data.hearts) setHearts(data.hearts);
                    if (data.lines && opponentUid) {
                        setOppLinesCompleted(data.lines[opponentUid] || 0);
                    }
                    setIsMyTurn(data.turn === user.uid);
                    if (data.winner) handleGameEnd(data.winner);
                }
            });
            return () => unsub();
        }
    }, [gameState, gameId, opponentUid]);

    // Check Win Condition & Sync Lines
    useEffect(() => {
        if (gameState === 'playing' && gameId) {
            const lines = checkLines(board, markedNumbers);
            setLinesCompleted(lines);
            // Always sync line count to DB so opponent sees it
            update(ref(db, `bingo_games/${gameId}/lines/${user.uid}`), lines);
        }
    }, [markedNumbers, board, gameState, gameId]);

    // Turn Timer
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
        if (nextHearts <= 0) updates[`bingo_games/${gameId}/winner`] = nextTurn;
        await update(ref(db), updates);
        showToast("Time Out! Heart Lost.", "error");
    };

    const handleNumberClick = async (num: number) => {
        if (!isMyTurn || markedNumbers.includes(num) || winnerUid) return;
        
        const snap = await get(ref(db, `bingo_games/${gameId}/players`));
        if(!snap.exists()) return;
        const p = snap.val();
        const nextTurn = p.host.uid === user.uid ? p.joiner.uid : p.host.uid;

        // Check if *I* win with this move
        const newMarked = [...markedNumbers, num];
        const callerLines = checkLines(board, newMarked);
        
        const updates: any = {};
        const callRef = push(ref(db, `bingo_games/${gameId}/calls`));
        updates[`bingo_games/${gameId}/calls/${callRef.key}`] = { num, uid: user.uid };
        updates[`bingo_games/${gameId}/turn`] = nextTurn;

        if (callerLines >= 5) {
            updates[`bingo_games/${gameId}/winner`] = user.uid;
            // Force line sync to 5 for UI consistency
            updates[`bingo_games/${gameId}/lines/${user.uid}`] = 5;
        }

        await update(ref(db), updates);
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
        return Math.min(count, 5);
    };

    const handleGameEnd = async (wUid: string) => {
        if (payoutProcessed.current) return;
        setWinnerUid(wUid);
        setGameState('result');
        
        if (wUid === user.uid) setLinesCompleted(5);
        else setOppLinesCompleted(5);

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

    const handlePlayAgain = () => {
        if (!selectedTier) {
            setGameState('lobby');
            return;
        }
        setGameState('lobby'); 
        setWinnerUid(null);
        setGameId(null);
        setMarkedNumbers([]);
        setCalls([]);
        payoutProcessed.current = false;
        setTimeout(() => handleJoinQueue(selectedTier), 100);
    };

    const handleLeaveGame = async () => {
        if (gameId && !winnerUid) {
            const oppWinUpdates: any = {};
            oppWinUpdates[`bingo_games/${gameId}/winner`] = opponentUid;
            oppWinUpdates[`bingo_games/${gameId}/exitReason`] = "LEFT";
            await update(ref(db), oppWinUpdates);
        }
        setShowGameExitConfirm(false);
    };

    const myHearts = gameId && hearts ? (hearts as any)[user.uid === gameId.split('_')[0] ? 'host' : 'joiner'] : 3;
    const oppHearts = gameId && hearts ? (hearts as any)[user.uid === gameId.split('_')[0] ? 'joiner' : 'host'] : 3;

    return (
        <div className="fixed inset-0 bg-slate-950 text-white flex flex-col font-sans z-[150]">
            {(gameState === 'lobby' || gameState === 'finding' || gameState === 'matched') && (
                <div className="bg-gradient-to-b from-purple-900 to-slate-950 border-b border-purple-900/50 pb-6 pt-4 px-6 relative overflow-hidden shrink-0">
                    <div className="flex items-start justify-between relative z-10">
                        <button onClick={() => gameState === 'lobby' ? onBack() : cancelSearch()} className="w-10 h-10 rounded-xl bg-slate-800/50 border border-white/10 flex items-center justify-center hover:bg-slate-700">
                            <i className={`fa-solid ${gameState === 'lobby' ? 'fa-arrow-left' : 'fa-xmark'} text-slate-300`}></i>
                        </button>
                        <div className="flex items-center gap-2 bg-slate-900/40 px-3 py-1 rounded-full border border-purple-500/20">
                            <i className={`fa-solid fa-signal text-[8px] ${(latency && latency > 500) ? 'text-red-500' : 'text-green-500'}`}></i>
                            <span className="text-[10px] font-bold text-slate-400">{latency || 0}ms</span>
                        </div>
                    </div>
                    {gameState === 'lobby' && (
                        <div className="mt-6 flex items-center gap-4 animate-[fade-enter_0.3s]">
                            <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30 rotate-3">
                                <i className="fa-solid fa-table-cells text-3xl text-white"></i>
                            </div>
                            <div>
                                <h1 className="text-2xl font-black tracking-tight text-white italic">BINGO</h1>
                                <p className="text-[10px] text-purple-200 font-bold uppercase tracking-widest opacity-60">Classic 1 vs 1</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {gameState === 'lobby' && (
                <div className="flex-1 p-5 overflow-y-auto animate-[fade-enter_0.3s]">
                    <div className="grid gap-4">
                        {TIERS.map((tier, idx) => (
                            <div key={idx} className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-pink-500/50 transition-all">
                                <div className="flex items-center justify-between relative z-10">
                                    <div className="flex flex-col gap-1">
                                        <p className="text-[10px] text-slate-500 font-bold uppercase">Entry Fee</p>
                                        <p className="text-2xl font-black text-white leading-none">₹{tier.entry}</p>
                                        <p className="text-xs font-bold text-green-400 mt-2">Win ₹{tier.prize}</p>
                                    </div>
                                    <button onClick={() => handleJoinQueue(tier)} className="h-12 px-8 bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-2xl text-sm font-black shadow-xl active:scale-95 transition-transform uppercase italic tracking-wider">PLAY</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {(gameState === 'finding' || gameState === 'matched') && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-950 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-900/20 via-slate-950 to-slate-950"></div>
                    <div className="relative z-10 mb-10 flex flex-col items-center">
                        <div className={`w-24 h-24 rounded-full border-4 border-slate-800 flex items-center justify-center relative transition-all ${gameState === 'matched' ? 'scale-110 border-green-500' : ''}`}>
                            <div className={`absolute inset-0 border-4 ${gameState === 'matched' ? 'border-green-500' : 'border-pink-500'} rounded-full border-t-transparent animate-spin`}></div>
                            <span className="text-3xl font-black text-white">{gameState === 'matched' ? battleStartCountdown : searchTimeLeft}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-6 relative z-10 mb-12">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-32 h-32 rounded-full border-4 border-pink-500 p-1 bg-slate-800 shadow-[0_0_30px_rgba(236,72,153,0.3)]">
                                <img src={user.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} className="w-full h-full rounded-full object-cover" />
                            </div>
                            <span className="text-[10px] font-black text-pink-400 uppercase tracking-widest">{user.username}</span>
                        </div>
                        <div className="text-2xl font-black text-slate-700 italic">VS</div>
                        <div className="flex flex-col items-center gap-3">
                            <div className={`w-32 h-32 rounded-full border-4 ${gameState === 'matched' ? 'border-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.5)]' : 'border-slate-800'} p-1 bg-slate-800 transition-all duration-500`}>
                                <img 
                                    src={gameState === 'matched' ? opponentPic : `https://api.dicebear.com/7.x/avataaars/svg?seed=${RANDOM_NAMES[cyclingIndex]}`} 
                                    className={`w-full h-full rounded-full object-cover transition-opacity duration-150 ${gameState === 'finding' ? 'opacity-50' : 'opacity-100'}`} 
                                />
                            </div>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${gameState === 'matched' ? 'text-purple-400' : 'text-slate-600'}`}>
                                {gameState === 'matched' ? opponentName : 'Searching...'}
                            </span>
                        </div>
                    </div>
                    <div className="relative z-10 text-center px-6">
                        {gameState === 'matched' ? (
                            <div className="animate-bounce">
                                <h3 className="text-4xl font-black text-white italic tracking-tighter uppercase mb-2">BATTLE START!</h3>
                                <p className="text-yellow-400 font-black text-lg">Prize: ₹{selectedTier?.prize}</p>
                            </div>
                        ) : (
                            <h3 className="text-lg font-black text-white/50 uppercase tracking-[0.3em] animate-pulse">Finding Opponent</h3>
                        )}
                    </div>
                </div>
            )}

            {gameState === 'playing' && (
                <div className="flex-1 flex flex-col items-center justify-center p-4 relative overflow-hidden animate-[fade-enter_0.4s]">
                    <div className="absolute top-0 left-0 right-0 bg-slate-900/80 backdrop-blur-md p-4 border-b border-slate-800 flex justify-between items-center z-20">
                        <button onClick={() => setShowGameExitConfirm(true)} className="absolute top-4 left-4 w-8 h-8 flex items-center justify-center text-red-500 bg-red-500/10 rounded-lg">
                            <i className="fa-solid fa-right-from-bracket"></i>
                        </button>
                        <div className={`flex flex-col items-center ml-12 transition-all ${isMyTurn ? 'opacity-100 scale-105' : 'opacity-40'}`}>
                            <div className="flex gap-0.5 mb-1">
                                {[1,2,3].map(i => <i key={i} className={`fa-solid fa-heart text-[8px] ${i <= myHearts ? 'text-red-500' : 'text-slate-700'}`}></i>)}
                            </div>
                            <span className="text-[10px] font-black text-pink-400 uppercase">You: {linesCompleted}/5</span>
                        </div>
                        <div className="flex flex-col items-center">
                            {isMyTurn && (
                                <div className={`w-10 h-10 rounded-full border-2 border-slate-700 flex items-center justify-center relative border-yellow-500`}>
                                    <div className="absolute inset-0 border-2 border-yellow-500 rounded-full border-t-transparent animate-spin"></div>
                                    <span className={`text-lg font-mono font-black ${turnTimer < 5 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>{turnTimer}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-1 mt-1">
                                <span className={`w-2 h-2 rounded-full ${latency && latency > 500 ? 'bg-red-500' : 'bg-green-500'} animate-pulse`}></span>
                                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{isMyTurn ? 'Your Turn' : 'Opponent'}</p>
                            </div>
                        </div>
                        <div className={`flex flex-col items-center mr-2 transition-all ${!isMyTurn ? 'opacity-100 scale-105' : 'opacity-40'}`}>
                            <div className="flex gap-0.5 mb-1">
                                {[1,2,3].map(i => <i key={i} className={`fa-solid fa-heart text-[8px] ${i <= oppHearts ? 'text-red-500' : 'text-slate-700'}`}></i>)}
                            </div>
                            <span className="text-[10px] font-black text-purple-400 uppercase">{opponentName.split(' ')[0]}: {oppLinesCompleted}/5</span>
                        </div>
                    </div>
                    <div className="w-full max-w-xs flex flex-col gap-5 mt-10">
                        <div className="grid grid-cols-5 gap-2 px-1">
                            {['B', 'I', 'N', 'G', 'O'].map((char, i) => (
                                <div key={i} className={`h-12 flex items-center justify-center rounded-xl font-black text-2xl transition-all duration-500 shadow-lg ${i < linesCompleted ? 'bg-gradient-to-b from-yellow-300 to-orange-500 text-black scale-110 rotate-3' : 'bg-slate-800 text-slate-600 border border-slate-700'}`}>
                                    {char}
                                </div>
                            ))}
                        </div>
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
                                        className={`rounded-xl flex flex-col items-center justify-center text-lg font-black transition-all duration-300 relative overflow-hidden ${
                                            isMarked 
                                            ? (isOpponentPick 
                                                ? 'bg-gradient-to-br from-purple-700 to-indigo-900 text-purple-100 border border-purple-500/50' 
                                                : 'bg-gradient-to-br from-pink-600 to-purple-700 text-white border border-pink-500/50')
                                            : 'bg-slate-800/80 text-slate-300 border border-slate-700 hover:bg-slate-700'
                                        } ${!isMarked && isMyTurn ? 'ring-2 ring-pink-500/20' : ''}`}
                                    >
                                        {isLast && <div className="absolute inset-0 bg-white/20 animate-ping"></div>}
                                        {num}
                                        {isOpponentPick && (
                                            <span className="absolute top-1 right-1.5 text-[8px] font-black text-purple-300 opacity-60 italic">O</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-center text-[10px] text-slate-500 font-medium">
                            {isMyTurn ? "Tap a number to mark" : `Waiting for ${opponentName}...`}
                        </p>
                    </div>
                </div>
            )}

            {gameState === 'result' && (
                <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-slate-950 p-6 animate-[fade-enter_0.4s]">
                    <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-[3rem] p-10 text-center shadow-2xl relative overflow-hidden">
                        <div className={`absolute top-0 left-0 w-full h-2 ${winnerUid === user.uid ? 'bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></div>
                        <div className="text-8xl mb-8 transform scale-125 animate-bounce">{winnerUid === user.uid ? '🏆' : '💀'}</div>
                        <h2 className={`text-5xl font-black mb-2 uppercase italic tracking-tighter ${winnerUid === user.uid ? 'text-green-500' : 'text-red-500'}`}>
                            {winnerUid === user.uid ? 'Victory!' : 'Defeat'}
                        </h2>
                        {winnerUid === user.uid && selectedTier && (
                            <div className="my-6 py-4 bg-green-500/10 border border-green-500/20 rounded-2xl">
                                <p className="text-[10px] text-green-400 font-black uppercase tracking-[0.3em] mb-1">Prize Cash Added</p>
                                <p className="text-4xl font-black text-white">₹{selectedTier.prize}</p>
                            </div>
                        )}
                        <div className="flex items-center justify-around my-10 border-y border-slate-800 py-6">
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-14 h-14 rounded-full border-2 border-pink-500 p-1">
                                    <img src={user.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} className="w-full h-full rounded-full" />
                                </div>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">You</span>
                                <span className="text-xl font-black text-white">{linesCompleted}/5</span>
                            </div>
                            <div className="text-slate-700 font-black italic text-xl">VS</div>
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-14 h-14 rounded-full border-2 border-purple-500 p-1">
                                    <img src={opponentPic} className="w-full h-full rounded-full" />
                                </div>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{opponentName.split(' ')[0]}</span>
                                <span className="text-xl font-black text-white">{oppLinesCompleted}/5</span>
                            </div>
                        </div>
                        <div className="flex flex-col gap-4">
                            <button onClick={handlePlayAgain} className="w-full py-5 bg-white text-slate-950 font-black rounded-2xl shadow-xl active:scale-95 transition-all uppercase italic tracking-widest text-sm">
                                Play Again
                            </button>
                            <button onClick={() => setGameState('lobby')} className="w-full py-2 text-slate-600 font-black text-xs uppercase hover:text-slate-400">
                                Back to Lobby
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showGameExitConfirm && (
                <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/80 backdrop-blur-md p-6 animate-[fade-enter_0.2s]">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-xs p-8 rounded-[2.5rem] text-center shadow-2xl relative overflow-hidden">
                        <h3 className="text-xl font-black text-white mb-2 uppercase italic tracking-tight">Quit Match?</h3>
                        <p className="text-slate-400 text-sm mb-8 font-medium">You will lose your entry fee.</p>
                        <div className="flex flex-col gap-3">
                            <button onClick={handleLeaveGame} className="w-full py-4 bg-red-600 text-white font-black rounded-2xl text-xs uppercase">Confirm Quit</button>
                            <button onClick={() => setShowGameExitConfirm(false)} className="w-full py-3 bg-slate-800 text-slate-300 font-bold rounded-2xl text-xs uppercase">Keep Playing</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BingoScreen;
