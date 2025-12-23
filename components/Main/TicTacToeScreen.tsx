
import React, { useState, useEffect, useRef } from "react";
import { UserProfile, ToastType } from "../../types";
import { update, ref, push, onValue, remove, get, set, runTransaction, query, orderByChild, limitToFirst, onDisconnect } from "firebase/database";
import { db } from "../../firebase";
import { updateSystemWallet } from "../../utils";

type GameState = 'lobby' | 'finding' | 'countdown' | 'playing' | 'result';
type PlayerSymbol = 'X' | 'O';

const TIERS = [
    { entry: 2, prize: 3.5 },
    { entry: 5, prize: 9 },
    { entry: 10, prize: 18 },
    { entry: 20, prize: 36 },
    { entry: 50, prize: 90 },
];

const TicTacToeScreen = ({ user, onBack, showToast, onNavigateToWallet }: { user: UserProfile, onBack: () => void, showToast: (m: string, t: ToastType) => void, onNavigateToWallet: () => void }) => {
    const [gameState, setGameState] = useState<GameState>('lobby');
    const [selectedTier, setSelectedTier] = useState<{ entry: number, prize: number } | null>(null);
    const [board, setBoard] = useState<(PlayerSymbol | null)[]>(Array(9).fill(null));
    const [mySymbol, setMySymbol] = useState<PlayerSymbol | null>(null);
    const [currentTurn, setCurrentTurn] = useState<PlayerSymbol>('X');
    const [gameId, setGameId] = useState<string | null>(null);
    const [opponentName, setOpponentName] = useState("Opponent");
    const [winner, setWinner] = useState<PlayerSymbol | 'Draw' | null>(null);
    
    // Timers
    const [countdown, setCountdown] = useState(3);
    const [turnTimer, setTurnTimer] = useState(15);
    const [searchTimeLeft, setSearchTimeLeft] = useState(60);

    const matchRef = useRef<any>(null); // Reference to queue listener

    // Cleanup on unmount or back
    useEffect(() => {
        return () => {
            if (gameState === 'finding' && selectedTier) {
                cancelSearch(true); // Silent cancel
            }
        };
    }, []);

    // --- LOBBY: Join Queue ---
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

        const queueRoot = `ttt_queue/tier_${tier.entry}`;
        
        try {
            // 1. Look for waiting opponents (FIFO)
            // Note: Removed orderByChild('timestamp') to avoid "Index not defined" error on client without server rules deployment.
            // limitToFirst(10) will fetch 10 waiting users by ID order, which is random enough for matchmaking.
            const q = query(ref(db, queueRoot), limitToFirst(10));
            const snapshot = await get(q);
            
            let matched = false;
            
            if (snapshot.exists()) {
                const potentialOpponents = snapshot.val();
                // Iterate through potential opponents
                for (const oppUid of Object.keys(potentialOpponents)) {
                    if (oppUid === user.uid) continue; // Skip self if ghost entry

                    const oppRef = ref(db, `${queueRoot}/${oppUid}`);
                    const newGameId = `${oppUid}_${user.uid}_${Date.now()}`;
                    
                    // Transaction to Atomically Claim the Opponent
                    const result = await runTransaction(oppRef, (currentData) => {
                        if (currentData === null) return null; // Node gone
                        if (currentData.matchId) return; // Already matched
                        return { ...currentData, matchId: newGameId, matchedBy: user.uid };
                    });

                    if (result.committed) {
                        // Match Successful!
                        matched = true;
                        const opponent = result.snapshot.val();
                        
                        const gameData = {
                            players: {
                                X: { uid: oppUid, name: opponent.name },
                                O: { uid: user.uid, name: user.username }
                            },
                            board: Array(9).fill(""),
                            turn: 'X',
                            status: 'starting',
                            tier: tier,
                            createdAt: Date.now()
                        };
                        
                        // Create Game
                        await set(ref(db, `ttt_games/${newGameId}`), gameData);
                        
                        // I am Player O (Joiner)
                        setupGame(newGameId, 'O', opponent.name);
                        break;
                    }
                }
            }

            if (!matched) {
                // 2. No match found, queue myself
                const myQueueRef = ref(db, `${queueRoot}/${user.uid}`);
                await set(myQueueRef, { 
                    uid: user.uid, 
                    name: user.username, 
                    timestamp: Date.now() 
                });
                
                // Auto-remove if I disconnect
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
        setMySymbol('X'); // Waiters are X (Host)
        const myRef = ref(db, `${queueRoot}/${myUid}`);
        
        const listener = onValue(myRef, (snap) => {
            const data = snap.val();
            if (!data) return; // Node deleted

            if (data.matchId) {
                // Matched!
                // Cancel disconnect hook first so we don't accidentally delete if we nav away later (though we delete node anyway)
                onDisconnect(myRef).cancel();
                // Remove my queue node now that I have the game ID
                remove(myRef);
                
                // Fetch opponent info from game or assume Opponent for now
                // Since I am X, I will check game node in setupGame logic
                setupGame(data.matchId, 'X', "Opponent");
            }
        });
        matchRef.current = listener;
    };

    const cancelSearch = async (silent = false) => {
        if (matchRef.current) {
            matchRef.current(); // Unsubscribe
            matchRef.current = null;
        }
        if (selectedTier) {
            const myQueuePath = `ttt_queue/tier_${selectedTier.entry}/${user.uid}`;
            const myRef = ref(db, myQueuePath);
            // Verify it's me before deleting (rare case of overwrite)
            const snap = await get(myRef);
            if (snap.exists() && snap.val().uid === user.uid) {
                await remove(myRef);
                onDisconnect(myRef).cancel();
            }
        }
        setGameState('lobby');
        if (!silent) showToast("Search Cancelled", "info");
    };

    // --- SEARCH TIMER ---
    useEffect(() => {
        let interval: any;
        if (gameState === 'finding') {
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

    // --- SETUP GAME & COUNTDOWN ---
    const setupGame = async (gId: string, symbol: PlayerSymbol, oppNamePlaceholder: string) => {
        setGameId(gId);
        setMySymbol(symbol);
        setGameState('countdown');
        
        // Try to fetch opponent name. Retry a few times if game node propagation is slow.
        let attempts = 0;
        const fetchName = async () => {
            const gSnap = await get(ref(db, `ttt_games/${gId}/players`));
            if (gSnap.exists()) {
                const p = gSnap.val();
                setOpponentName(symbol === 'X' ? p.O.name : p.X.name);
            } else {
                if(attempts < 3) {
                    attempts++;
                    setTimeout(fetchName, 500);
                } else {
                    setOpponentName(oppNamePlaceholder);
                }
            }
        };
        fetchName();
    };

    // --- COUNTDOWN & FEE DEDUCTION ---
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
            // Deduct Fee Locally & Update DB
            const cost = selectedTier.entry;
            let added = user.wallet.added || 0;
            let winning = user.wallet.winning || 0;

            if (added >= cost) {
                added -= cost;
            } else {
                const rem = cost - added;
                added = 0;
                winning -= rem;
            }

            await update(ref(db, `users/${user.uid}/wallet`), { added, winning });
            await push(ref(db, `transactions/${user.uid}`), {
                type: 'game', amount: cost, date: Date.now(), details: 'Tic Tac Toe Entry', category: 'winning', closingBalance: added + winning
            });
            await updateSystemWallet(cost, "TTT Entry"); // System Profit

            setGameState('playing');
            setTurnTimer(15);
        } catch (e) {
            showToast("Fee Deduction Failed", "error");
            setGameState('lobby');
        }
    };

    // --- GAMEPLAY LISTENERS ---
    useEffect(() => {
        if (gameState === 'playing' && gameId) {
            const gameRef = ref(db, `ttt_games/${gameId}`);
            const unsub = onValue(gameRef, (snap) => {
                const data = snap.val();
                if (data) {
                    setBoard(data.board);
                    setCurrentTurn(data.turn);
                    if (data.winner) {
                        handleGameEnd(data.winner);
                    } else if (!data.board.includes("") && !data.board.includes(null)) {
                        handleGameEnd('Draw'); // Fallback if server logic missed it
                    }
                }
            });
            return () => unsub();
        }
    }, [gameState, gameId]);

    // Turn Timer (Visual mostly, can trigger auto-loss in robust backend)
    useEffect(() => {
        let interval: any;
        if (gameState === 'playing' && !winner) {
            setTurnTimer(15);
            interval = setInterval(() => {
                setTurnTimer(prev => Math.max(0, prev - 1));
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [currentTurn, gameState]);

    const handleCellClick = async (idx: number) => {
        if (currentTurn !== mySymbol || board[idx] !== "" || winner || gameState !== 'playing') return;
        
        // Optimistic Update
        const newBoard = [...board];
        newBoard[idx] = mySymbol;
        
        // Check Win Logic
        const win = checkWin(newBoard);
        let updates: any = {
            [`ttt_games/${gameId}/board`]: newBoard,
            [`ttt_games/${gameId}/turn`]: mySymbol === 'X' ? 'O' : 'X'
        };

        if (win) {
            updates[`ttt_games/${gameId}/winner`] = win;
        } else if (!newBoard.includes("") && !newBoard.includes(null)) {
            updates[`ttt_games/${gameId}/winner`] = 'Draw';
        }

        await update(ref(db), updates);
    };

    const checkWin = (b: any[]) => {
        const lines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6]
        ];
        for (let i = 0; i < lines.length; i++) {
            const [x, y, z] = lines[i];
            if (b[x] && b[x] === b[y] && b[x] === b[z]) return b[x];
        }
        return null;
    };

    const handleGameEnd = async (result: string) => {
        setWinner(result as any);
        setGameState('result');
        if (!selectedTier) return;

        if (result === mySymbol) {
            // I Won
            const prize = selectedTier.prize;
            const newWinning = (user.wallet.winning || 0) + prize;
            
            await update(ref(db, `users/${user.uid}/wallet`), { winning: newWinning });
            await push(ref(db, `transactions/${user.uid}`), {
                type: 'game', amount: prize, date: Date.now(), details: 'Tic Tac Toe Win', category: 'winning', closingBalance: newWinning + (user.wallet.added || 0)
            });
            await updateSystemWallet(-prize, "TTT Payout");
            showToast("You Won!", "success");
        } else if (result === 'Draw') {
            // Refund
            const refund = selectedTier.entry;
            const newAdded = (user.wallet.added || 0) + refund;
            
            await update(ref(db, `users/${user.uid}/wallet`), { added: newAdded });
            await push(ref(db, `transactions/${user.uid}`), {
                type: 'bonus', amount: refund, date: Date.now(), details: 'TTT Draw Refund', category: 'added', closingBalance: newAdded + (user.wallet.winning || 0)
            });
            await updateSystemWallet(-refund, "TTT Refund");
            showToast("Draw - Fee Refunded", "info");
        }
        // Loser does nothing (money already gone)
    };

    const resetGame = () => {
        setGameState('lobby');
        setWinner(null);
        setBoard(Array(9).fill(null));
        setGameId(null);
        setSelectedTier(null);
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans">
            {/* BIG HEADER */}
            <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-b border-slate-800 pb-6 pt-4 px-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                <div className="flex items-start justify-between relative z-10">
                    <button onClick={() => { if(gameState==='finding') cancelSearch(); else onBack(); }} className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700 transition">
                        <i className="fa-solid fa-arrow-left text-slate-400"></i>
                    </button>
                    <div className="flex flex-col items-end">
                        <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-700">
                            <i className="fa-solid fa-wallet text-orange-500 text-xs"></i>
                            <span className="text-xs font-bold">₹{(user.wallet.added + user.wallet.winning).toFixed(0)}</span>
                        </div>
                    </div>
                </div>
                
                <div className="mt-6 flex items-center gap-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 rotate-3">
                        <i className="fa-solid fa-xmarks-lines text-3xl text-white"></i>
                    </div>
                    <div>
                        <h1 className="text-2xl font-extrabold tracking-tight text-white">Tic Tac Toe</h1>
                        <p className="text-xs text-blue-300 font-medium bg-blue-900/30 px-2 py-0.5 rounded-lg w-fit mt-1">Real-Time Multiplayer</p>
                    </div>
                </div>
            </div>

            {/* CONTENT */}
            {gameState === 'lobby' && (
                <div className="flex-1 p-5 overflow-y-auto">
                    <div className="flex items-center gap-2 mb-4">
                        <i className="fa-solid fa-trophy text-yellow-500"></i>
                        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Choose a Battle</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4">
                        {TIERS.map((tier, idx) => (
                            <div key={idx} className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-blue-500/50 transition-all duration-300">
                                <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-slate-800 via-transparent to-transparent opacity-50"></div>
                                
                                <div className="flex items-center justify-between relative z-10">
                                    <div className="flex flex-col gap-3">
                                        <div>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">Entry</p>
                                            <p className="text-2xl font-black text-white leading-none">₹{tier.entry}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">You Win</p>
                                            <p className="text-2xl font-black text-green-400 leading-none">₹{tier.prize}</p>
                                        </div>
                                    </div>

                                    <button 
                                        onClick={() => handleJoinQueue(tier)}
                                        className="h-12 px-8 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl text-sm font-bold shadow-xl shadow-blue-900/30 active:scale-95 transition-transform flex items-center gap-2"
                                    >
                                        PLAY <i className="fa-solid fa-play"></i>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {gameState === 'finding' && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-950 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950"></div>
                    <div className="relative z-10 text-center">
                        <div className="w-40 h-40 mx-auto mb-8 relative">
                            <div className="absolute inset-0 border-4 border-slate-800 rounded-full"></div>
                            <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-4xl font-black text-white">{searchTimeLeft}</span>
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2 animate-pulse">Finding Opponent...</h3>
                        <p className="text-slate-400 text-sm font-medium">Please wait while we match you</p>
                    </div>
                    
                    <button onClick={() => cancelSearch()} className="mt-12 px-8 py-3 rounded-xl border border-red-500/30 text-red-400 font-bold text-sm hover:bg-red-500/10 transition z-10">
                        Cancel Search
                    </button>
                </div>
            )}

            {gameState === 'countdown' && (
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 relative">
                    <div className="text-[150px] font-black text-transparent bg-clip-text bg-gradient-to-b from-blue-400 to-blue-600 animate-[bounce_1s_infinite]">
                        {countdown > 0 ? countdown : "GO!"}
                    </div>
                    <p className="text-slate-400 font-bold mt-4 uppercase tracking-widest">Match Found</p>
                </div>
            )}

            {(gameState === 'playing' || gameState === 'result') && (
                <div className="flex-1 flex flex-col p-4 relative">
                    <div className="flex justify-between items-center bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl mb-8 border border-slate-800 shadow-xl">
                        <div className={`flex flex-col items-center transition-all duration-300 ${currentTurn === mySymbol ? 'opacity-100 scale-110' : 'opacity-50'}`}>
                            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-400 font-black text-2xl mb-1 shadow-inner border border-blue-500/30">
                                {mySymbol}
                            </div>
                            <span className="text-[10px] font-bold text-slate-300">YOU</span>
                        </div>
                        
                        <div className="flex flex-col items-center">
                            <span className={`text-3xl font-mono font-black ${turnTimer < 5 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>
                                {turnTimer}
                            </span>
                            <span className="text-[8px] text-slate-500 uppercase font-bold tracking-wider">Sec</span>
                        </div>

                        <div className={`flex flex-col items-center transition-all duration-300 ${currentTurn !== mySymbol ? 'opacity-100 scale-110' : 'opacity-50'}`}>
                            <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center text-red-400 font-black text-2xl mb-1 shadow-inner border border-red-500/30">
                                {mySymbol === 'X' ? 'O' : 'X'}
                            </div>
                            <span className="text-[10px] font-bold text-slate-300 truncate w-16 text-center">{opponentName.split(' ')[0]}</span>
                        </div>
                    </div>

                    {/* BOARD */}
                    <div className="grid grid-cols-3 gap-3 aspect-square w-full max-w-sm mx-auto">
                        {board.map((cell, idx) => (
                            <button 
                                key={idx} 
                                onClick={() => handleCellClick(idx)}
                                disabled={!!cell || currentTurn !== mySymbol || !!winner}
                                className={`rounded-2xl flex items-center justify-center text-6xl font-black shadow-lg transition-all active:scale-95 ${
                                    cell 
                                    ? 'bg-slate-800 border-2 border-slate-700' 
                                    : 'bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800'
                                }`}
                            >
                                {cell === 'X' && <span className="text-blue-500 drop-shadow-[0_0_10px_rgba(59,130,246,0.5)] animate-[fade-enter_0.2s]">X</span>}
                                {cell === 'O' && <span className="text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)] animate-[fade-enter_0.2s]">O</span>}
                            </button>
                        ))}
                    </div>

                    <div className="mt-8 text-center">
                        <p className="text-xs text-slate-500 font-medium">
                            {currentTurn === mySymbol ? "Your Turn" : "Opponent's Turn"}
                        </p>
                    </div>

                    {/* RESULT MODAL */}
                    {winner && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-6 animate-[fade-enter_0.3s]">
                            <div className="bg-slate-900 border border-slate-700 w-full max-w-xs p-8 rounded-[2rem] text-center shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-red-500"></div>
                                
                                <div className="text-7xl mb-6">
                                    {winner === mySymbol ? '🏆' : winner === 'Draw' ? '🤝' : '💀'}
                                </div>
                                
                                <h2 className={`text-4xl font-black mb-2 uppercase italic tracking-tighter ${
                                    winner === mySymbol ? 'text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500' : 
                                    winner === 'Draw' ? 'text-slate-200' : 'text-red-500'
                                }`}>
                                    {winner === mySymbol ? 'VICTORY' : winner === 'Draw' ? 'DRAW' : 'DEFEAT'}
                                </h2>
                                
                                <p className="text-slate-400 font-medium mb-8 text-sm">
                                    {winner === mySymbol 
                                        ? `You won ₹${selectedTier?.prize}!` 
                                        : winner === 'Draw' 
                                            ? 'Entry Fee Refunded' 
                                            : 'Better luck next time!'}
                                </p>
                                
                                <button onClick={resetGame} className="w-full py-4 bg-white text-slate-900 font-black rounded-xl hover:bg-slate-200 transition shadow-lg text-sm uppercase tracking-wider">
                                    Play Again
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TicTacToeScreen;
