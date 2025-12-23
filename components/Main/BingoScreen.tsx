
import React, { useState, useEffect, useRef } from "react";
import { UserProfile, ToastType } from "../../types";
import { update, ref, push, onValue, remove, get, set, runTransaction, query, limitToFirst, onDisconnect } from "firebase/database";
import { db } from "../../firebase";
import { updateSystemWallet } from "../../utils";

type GameState = 'lobby' | 'finding' | 'countdown' | 'playing' | 'result';

// Bingo Config
const TIERS = [
    { entry: 5, prize: 9 },
    { entry: 10, prize: 18 },
    { entry: 20, prize: 36 },
    { entry: 50, prize: 90 },
    { entry: 100, prize: 180 },
];

const BingoScreen = ({ user, onBack, showToast, onNavigateToWallet }: { user: UserProfile, onBack: () => void, showToast: (m: string, t: ToastType) => void, onNavigateToWallet: () => void }) => {
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

    // Timers
    const [countdown, setCountdown] = useState(3);
    const [searchTimeLeft, setSearchTimeLeft] = useState(60);
    const [turnTimer, setTurnTimer] = useState(15);

    const matchRef = useRef<any>(null);

    // Generate random board (1-25)
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
    }, []);

    // --- QUEUE LOGIC (Same as TicTacToe for consistency) ---
    const handleJoinQueue = async (tier: { entry: number, prize: number }) => {
        const balance = (user.wallet.added || 0) + (user.wallet.winning || 0);
        if (balance < tier.entry) {
            showToast(`Insufficient balance. Need ₹${tier.entry}`, 'error');
            onNavigateToWallet();
            return;
        }

        setSelectedTier(tier);
        setGameState('finding');
        setSearchTimeLeft(60);

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
                            calls: [], // List of numbers called
                            turn: oppUid, // Host starts
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
            console.error(e);
            showToast("Matchmaking Error", "error");
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
                setupGame(data.matchId, "Opponent"); // Opponent name fetched later
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

    // --- GAME SETUP ---
    const setupGame = (gId: string, placeholderName: string) => {
        setGameId(gId);
        setBoard(generateBoard());
        setMarkedNumbers([]);
        setLinesCompleted(0);
        setWinnerUid(null);
        setGameState('countdown');
        
        // Fetch Opponent Name & Determine Turn
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
            } else {
                setOpponentName(placeholderName);
            }
        };
        fetchDetails();
    };

    // Countdown & Fee
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
            else {
                const rem = cost - added;
                added = 0;
                winning -= rem;
            }

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

    // --- GAME LOGIC ---
    useEffect(() => {
        if (gameState === 'playing' && gameId) {
            const gameRef = ref(db, `bingo_games/${gameId}`);
            const unsub = onValue(gameRef, (snap) => {
                const data = snap.val();
                if (data) {
                    if (data.calls) {
                        // Sync calls
                        const callsArray = Object.values(data.calls) as number[];
                        setMarkedNumbers(callsArray);
                        
                        // Last called logic for UI highlight
                        const last = callsArray[callsArray.length - 1];
                        setLastCalledNumber(last);
                    }
                    
                    setIsMyTurn(data.turn === user.uid);
                    
                    if (data.winner) {
                        handleGameEnd(data.winner);
                    }
                }
            });
            return () => unsub();
        }
    }, [gameState, gameId]);

    // Check Lines Effect
    useEffect(() => {
        if (gameState === 'playing' && markedNumbers.length >= 5) {
            const lines = checkLines(board, markedNumbers);
            setLinesCompleted(lines);
            
            if (lines >= 5 && !winnerUid) {
                // I Won!
                setWinnerUid(user.uid);
                update(ref(db, `bingo_games/${gameId}`), { winner: user.uid });
            }
        }
    }, [markedNumbers, board, gameState]);

    // Turn Timer
    useEffect(() => {
        let interval: any;
        if (gameState === 'playing' && !winnerUid) {
            setTurnTimer(15);
            interval = setInterval(() => {
                setTurnTimer(prev => Math.max(0, prev - 1));
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isMyTurn, gameState, winnerUid]);

    const handleNumberClick = async (num: number) => {
        if (!isMyTurn || markedNumbers.includes(num) || winnerUid) return;
        
        // Find opponent UID for next turn
        // We know gameId, we can just fetch once or infer. 
        // Simplification: In a 2 player game, if it's my turn, next is NOT me.
        const snap = await get(ref(db, `bingo_games/${gameId}/players`));
        if(!snap.exists()) return;
        const p = snap.val();
        const nextTurn = p.host.uid === user.uid ? p.joiner.uid : p.host.uid;

        await push(ref(db, `bingo_games/${gameId}/calls`), num);
        await update(ref(db, `bingo_games/${gameId}`), { turn: nextTurn });
    };

    const checkLines = (grid: number[], marked: number[]) => {
        let count = 0;
        // Rows
        for(let i=0; i<5; i++) {
            let rowFull = true;
            for(let j=0; j<5; j++) {
                if(!marked.includes(grid[i*5 + j])) rowFull = false;
            }
            if(rowFull) count++;
        }
        // Cols
        for(let i=0; i<5; i++) {
            let colFull = true;
            for(let j=0; j<5; j++) {
                if(!marked.includes(grid[j*5 + i])) colFull = false;
            }
            if(colFull) count++;
        }
        // Diagonals
        let d1 = true;
        for(let i=0; i<5; i++) if(!marked.includes(grid[i*5+i])) d1 = false;
        if(d1) count++;

        let d2 = true;
        for(let i=0; i<5; i++) if(!marked.includes(grid[i*5 + (4-i)])) d2 = false;
        if(d2) count++;

        return count;
    };

    const handleGameEnd = async (wUid: string) => {
        setWinnerUid(wUid);
        setGameState('result');
        if (!selectedTier) return;

        if (wUid === user.uid) {
            const prize = selectedTier.prize;
            const newWinning = (user.wallet.winning || 0) + prize;
            
            await update(ref(db, `users/${user.uid}/wallet`), { winning: newWinning });
            await push(ref(db, `transactions/${user.uid}`), {
                type: 'game', amount: prize, date: Date.now(), details: 'Bingo Win', category: 'winning', closingBalance: newWinning + (user.wallet.added || 0)
            });
            await updateSystemWallet(-prize, "Bingo Payout");
            showToast("You Won!", "success");
        } else {
            showToast("You Lost", "error");
        }
    };

    const resetGame = () => {
        setGameState('lobby');
        setWinnerUid(null);
        setGameId(null);
        setSelectedTier(null);
    };

    // --- RENDER ---
    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans">
            {/* Header */}
            <div className="bg-gradient-to-b from-purple-900 to-slate-950 border-b border-purple-900/50 pb-6 pt-4 px-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-pink-600/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                <div className="flex items-start justify-between relative z-10">
                    <button onClick={() => { if(gameState==='finding') cancelSearch(); else onBack(); }} className="w-10 h-10 rounded-xl bg-slate-800/50 border border-white/10 flex items-center justify-center hover:bg-slate-700 transition">
                        <i className="fa-solid fa-arrow-left text-slate-300"></i>
                    </button>
                    <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1 rounded-full border border-purple-500/30">
                        <i className="fa-solid fa-wallet text-pink-500 text-xs"></i>
                        <span className="text-xs font-bold">₹{(user.wallet.added + user.wallet.winning).toFixed(0)}</span>
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
                                    <button onClick={() => handleJoinQueue(tier)} className="h-12 px-8 bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-2xl text-sm font-bold shadow-xl shadow-purple-900/30 active:scale-95 transition-transform flex items-center gap-2">
                                        PLAY <i className="fa-solid fa-play"></i>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* FINDING */}
            {gameState === 'finding' && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
                    <div className="w-32 h-32 relative mb-8">
                        <div className="absolute inset-0 border-4 border-slate-800 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-pink-500 rounded-full border-t-transparent animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center font-black text-3xl">{searchTimeLeft}</div>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Finding Opponent...</h3>
                    <p className="text-slate-400 text-sm">Matching you with a player</p>
                    <button onClick={() => cancelSearch()} className="mt-8 px-6 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold">Cancel</button>
                </div>
            )}

            {/* COUNTDOWN */}
            {gameState === 'countdown' && (
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-900">
                    <div className="text-[120px] font-black text-transparent bg-clip-text bg-gradient-to-b from-pink-400 to-purple-600 animate-bounce">
                        {countdown > 0 ? countdown : "GO!"}
                    </div>
                </div>
            )}

            {/* GAME BOARD */}
            {(gameState === 'playing' || gameState === 'result') && (
                <div className="flex-1 flex flex-col p-4 max-w-md mx-auto w-full">
                    {/* Header Info */}
                    <div className="flex justify-between items-center mb-6 bg-slate-900/50 p-3 rounded-2xl border border-slate-800">
                        <div className={`flex flex-col items-center px-4 transition-opacity ${isMyTurn ? 'opacity-100' : 'opacity-50'}`}>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">You</span>
                            <span className="text-xs font-bold text-white">Line: {linesCompleted}/5</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className={`text-2xl font-mono font-black ${turnTimer < 5 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>{turnTimer}</span>
                            <span className="text-[8px] text-slate-500 uppercase font-bold">Sec</span>
                        </div>
                        <div className={`flex flex-col items-center px-4 transition-opacity ${!isMyTurn ? 'opacity-100' : 'opacity-50'}`}>
                            <span className="text-[10px] font-bold text-slate-400 uppercase truncate max-w-[60px]">{opponentName}</span>
                            <span className="text-xs font-bold text-white">{!isMyTurn ? 'Thinking...' : 'Waiting'}</span>
                        </div>
                    </div>

                    {/* BINGO Letters */}
                    <div className="grid grid-cols-5 gap-2 mb-2 px-1">
                        {['B', 'I', 'N', 'G', 'O'].map((char, i) => (
                            <div key={i} className={`h-10 flex items-center justify-center rounded-lg font-black text-xl transition-all duration-500 ${i < linesCompleted ? 'bg-gradient-to-b from-yellow-300 to-orange-500 text-black shadow-[0_0_15px_rgba(234,179,8,0.6)] scale-110' : 'bg-slate-800 text-slate-600'}`}>
                                {char}
                            </div>
                        ))}
                    </div>

                    {/* Grid */}
                    <div className="grid grid-cols-5 gap-2 aspect-square bg-slate-900 p-2 rounded-2xl border border-slate-800 shadow-2xl relative">
                        {/* Winner Overlay */}
                        {winnerUid && !winnerUid.includes(user.uid) && (
                            <div className="absolute inset-0 bg-black/60 z-10 rounded-2xl backdrop-blur-[1px] flex items-center justify-center">
                                <div className="bg-red-600 text-white font-black px-6 py-2 rounded-xl transform -rotate-12 shadow-xl border-4 border-white">DEFEAT</div>
                            </div>
                        )}

                        {board.map((num, idx) => {
                            const isMarked = markedNumbers.includes(num);
                            const isLast = lastCalledNumber === num;
                            return (
                                <button 
                                    key={idx}
                                    onClick={() => handleNumberClick(num)}
                                    disabled={isMarked || !isMyTurn || !!winnerUid}
                                    className={`rounded-xl flex items-center justify-center text-lg font-bold transition-all duration-200 relative overflow-hidden ${
                                        isMarked 
                                        ? 'bg-gradient-to-br from-pink-600 to-purple-700 text-white shadow-inner border border-purple-500/50' 
                                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 active:scale-95'
                                    } ${!isMarked && isMyTurn ? 'ring-2 ring-purple-500/20' : ''}`}
                                >
                                    {isLast && <div className="absolute inset-0 bg-white/30 animate-ping rounded-xl"></div>}
                                    {num}
                                </button>
                            );
                        })}
                    </div>
                    
                    <p className="text-center text-xs text-slate-500 mt-6 font-medium">
                        {isMyTurn ? "Your Turn - Pick a number" : `Waiting for ${opponentName}...`}
                    </p>
                </div>
            )}

            {/* RESULT MODAL */}
            {gameState === 'result' && winnerUid && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-6 animate-[fade-enter_0.3s]">
                    <div className="bg-slate-900 border border-slate-700 w-full max-w-xs p-8 rounded-[2rem] text-center shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500"></div>
                        
                        <div className="text-7xl mb-6 animate-bounce">
                            {winnerUid === user.uid ? '🏆' : '💀'}
                        </div>
                        
                        <h2 className={`text-4xl font-black mb-2 uppercase italic tracking-tighter ${
                            winnerUid === user.uid ? 'text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500' : 'text-red-500'
                        }`}>
                            {winnerUid === user.uid ? 'VICTORY' : 'DEFEAT'}
                        </h2>
                        
                        <p className="text-slate-400 font-medium mb-8 text-sm">
                            {winnerUid === user.uid 
                                ? `You won ₹${selectedTier?.prize}!` 
                                : 'Better luck next time!'}
                        </p>
                        
                        <button onClick={resetGame} className="w-full py-4 bg-white text-slate-900 font-black rounded-xl hover:bg-slate-200 transition shadow-lg text-sm uppercase tracking-wider">
                            Play Again
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BingoScreen;
