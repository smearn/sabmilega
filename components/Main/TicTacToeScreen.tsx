
import React, { useState, useEffect, useRef } from "react";
import { UserProfile, ToastType } from "../../types";
import { update, ref, push, onValue, remove, get, set, runTransaction, query, limitToFirst, onDisconnect } from "firebase/database";
import { db } from "../../firebase";
import { updateSystemWallet } from "../../utils";
import { ConfirmModal } from "../Shared/ConfirmModal";

type GameState = 'lobby' | 'finding' | 'search_timeout' | 'matched' | 'countdown' | 'playing' | 'result';
type PlayerSymbol = 'X' | 'O';

const TIERS = [
    { entry: 2, prize: 3.5 },
    { entry: 5, prize: 9 },
    { entry: 10, prize: 18 },
    { entry: 20, prize: 36 },
    { entry: 50, prize: 90 },
];

const RANDOM_NAMES = ["Rohan", "Suresh", "Priya", "Ankit", "Deepak", "Vikram", "Neha", "Rahul", "Aman", "Karan"];

const TicTacToeScreen = ({ user, onBack, showToast, onNavigateToWallet, latency }: { user: UserProfile, onBack: () => void, showToast: (m: string, t: ToastType) => void, onNavigateToWallet: () => void, latency: number | null }) => {
    const [gameState, setGameState] = useState<GameState>('lobby');
    const [rounds, setRounds] = useState<1 | 3 | 5>(1);
    const [selectedTier, setSelectedTier] = useState<{ entry: number, prize: number } | null>(null);
    const [board, setBoard] = useState<(PlayerSymbol | null)[]>(Array(9).fill(null));
    const [mySymbol, setMySymbol] = useState<PlayerSymbol | null>(null);
    const [currentTurn, setCurrentTurn] = useState<PlayerSymbol>('X');
    const [gameId, setGameId] = useState<string | null>(null);
    const [opponentName, setOpponentName] = useState("Searching...");
    const [opponentPic, setOpponentPic] = useState("");
    const [winner, setWinner] = useState<PlayerSymbol | 'Draw' | null>(null);
    const [roundWinner, setRoundWinner] = useState<PlayerSymbol | 'Draw' | null>(null);
    const [scores, setScores] = useState({ X: 0, O: 0 });
    const [hearts, setHearts] = useState({ X: 3, O: 3 });
    const [exitReason, setExitReason] = useState<string | null>(null);
    
    // UI Helpers
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
    const [battleStartCountdown, setBattleStartCountdown] = useState(3);

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

    // Finding Page Animations
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
        setOpponentName("Searching...");

        const queueRoot = `ttt_queue/tier_${tier.entry}_r${rounds}`;
        
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
                                X: { uid: oppUid, name: opponent.name },
                                O: { uid: user.uid, name: user.username }
                            },
                            board: Array(9).fill(""),
                            turn: 'X',
                            scores: { X: 0, O: 0 },
                            hearts: { X: 3, O: 3 },
                            status: 'starting',
                            config: { totalRounds: rounds },
                            tier: tier,
                            createdAt: Date.now()
                        };
                        await set(ref(db, `ttt_games/${newGameId}`), gameData);
                        setupGame(newGameId, 'O', opponent.name);
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
        setMySymbol('X');
        const myRef = ref(db, `${queueRoot}/${myUid}`);
        const listener = onValue(myRef, (snap) => {
            const data = snap.val();
            if (!data) return;
            if (data.matchId) {
                onDisconnect(myRef).cancel();
                remove(myRef);
                setupGame(data.matchId, 'X', "Opponent");
            }
        });
        matchRef.current = listener;
    };

    const cancelSearch = async (silent = false) => {
        if (matchRef.current) { matchRef.current(); matchRef.current = null; }
        if (selectedTier) {
            const myQueuePath = `ttt_queue/tier_${selectedTier.entry}_r${rounds}/${user.uid}`;
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

    const setupGame = async (gId: string, symbol: PlayerSymbol, oppNamePlaceholder: string) => {
        setGameId(gId);
        setMySymbol(symbol);
        setScores({ X: 0, O: 0 });
        setHearts({ X: 3, O: 3 });
        setWinner(null);
        setRoundWinner(null);
        setGameState('matched');
        setBattleStartCountdown(3);
        
        let attempts = 0;
        const fetchName = async () => {
            const gSnap = await get(ref(db, `ttt_games/${gId}/players`));
            if (gSnap.exists()) {
                const p = gSnap.val();
                const opName = symbol === 'X' ? p.O.name : p.X.name;
                setOpponentName(opName);
                setOpponentPic(`https://api.dicebear.com/7.x/avataaars/svg?seed=${opName}`);
            } else if(attempts < 3) {
                attempts++;
                setTimeout(fetchName, 500);
            } else {
                setOpponentName(oppNamePlaceholder);
                setOpponentPic(`https://api.dicebear.com/7.x/avataaars/svg?seed=${oppNamePlaceholder}`);
            }
        };
        fetchName();
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
                type: 'game', amount: cost, date: Date.now(), details: 'Tic Tac Toe Entry', category: 'winning', closingBalance: added + winning
            });
            await updateSystemWallet(cost, "TTT Entry");
            setGameState('playing');
            setTurnTimer(15);
        } catch (e) {
            setGameState('lobby');
        }
    };

    useEffect(() => {
        if (gameState === 'playing' && gameId) {
            const gameRef = ref(db, `ttt_games/${gameId}`);
            const unsub = onValue(gameRef, (snap) => {
                const data = snap.val();
                if (data) {
                    setBoard(data.board);
                    setCurrentTurn(data.turn);
                    if (data.scores) setScores(data.scores);
                    if (data.hearts) setHearts(data.hearts);
                    if (data.winner) {
                        if (data.exitReason) setExitReason(data.exitReason);
                        handleMatchEnd(data.winner);
                    }
                    else if (data.roundWinner) setRoundWinner(data.roundWinner);
                    else setRoundWinner(null);
                }
            });
            return () => unsub();
        }
    }, [gameState, gameId]);

    useEffect(() => {
        let interval: any;
        if (gameState === 'playing' && !winner && !roundWinner) {
            interval = setInterval(() => {
                setTurnTimer(prev => {
                    if (prev <= 1) {
                        if (currentTurn === mySymbol) handleTimeout();
                        return 15;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [currentTurn, gameState, roundWinner, winner]);

    useEffect(() => { setTurnTimer(15); }, [currentTurn]);

    const handleTimeout = async () => {
        if (currentTurn !== mySymbol || !gameId || winner || roundWinner) return;
        const currentHearts = hearts[mySymbol!];
        const nextHearts = Math.max(0, currentHearts - 1);
        const updates: any = {
            [`ttt_games/${gameId}/hearts/${mySymbol}`]: nextHearts,
            [`ttt_games/${gameId}/turn`]: mySymbol === 'X' ? 'O' : 'X'
        };
        if (nextHearts <= 0) {
            updates[`ttt_games/${gameId}/winner`] = mySymbol === 'X' ? 'O' : 'X';
            updates[`ttt_games/${gameId}/exitReason`] = "TIMEOUT";
        }
        await update(ref(db), updates);
        showToast("Time Out! Heart Lost.", "error");
    };

    const handleCellClick = async (idx: number) => {
        if (currentTurn !== mySymbol || board[idx] !== "" || winner || gameState !== 'playing' || roundWinner) return;
        const newBoard = [...board];
        newBoard[idx] = mySymbol;
        const roundWin = checkWin(newBoard);
        const isDraw = !newBoard.includes("") && !newBoard.includes(null);
        let updates: any = {
            [`ttt_games/${gameId}/board`]: newBoard,
            [`ttt_games/${gameId}/turn`]: mySymbol === 'X' ? 'O' : 'X'
        };
        if (roundWin || isDraw) {
            const rWinner = roundWin ? mySymbol : 'Draw';
            updates[`ttt_games/${gameId}/roundWinner`] = rWinner;
            let newScores = { ...scores };
            if (roundWin && mySymbol) {
                newScores[mySymbol] = (newScores[mySymbol] || 0) + 1;
                updates[`ttt_games/${gameId}/scores`] = newScores;
            }
            const targetWins = Math.ceil(rounds / 2);
            if (newScores.X >= targetWins) updates[`ttt_games/${gameId}/winner`] = 'X';
            else if (newScores.O >= targetWins) updates[`ttt_games/${gameId}/winner`] = 'O';
            else {
                setTimeout(() => {
                    update(ref(db, `ttt_games/${gameId}`), {
                        board: Array(9).fill(""), roundWinner: null,
                        turn: rWinner === 'Draw' ? (mySymbol === 'X' ? 'O' : 'X') : (mySymbol === 'X' ? 'O' : 'X')
                    });
                }, 2000);
            }
        }
        await update(ref(db), updates);
    };

    const handleLeaveGame = async () => {
        if (!gameId || !mySymbol || winner) return;
        const oppSymbol = mySymbol === 'X' ? 'O' : 'X';
        await update(ref(db, `ttt_games/${gameId}`), {
            winner: oppSymbol,
            exitReason: "LEFT"
        });
        setShowGameExitConfirm(false);
    };

    const checkWin = (b: any[]) => {
        const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
        for (let i=0; i<lines.length; i++) {
            const [x,y,z] = lines[i];
            if (b[x] && b[x] === b[y] && b[x] === b[z]) return b[x];
        }
        return null;
    };

    const handleMatchEnd = async (result: string) => {
        if (payoutProcessed.current) return;
        setWinner(result as any);
        setGameState('result');
        if (!selectedTier || result === 'Draw') return;

        if (result === mySymbol) {
            payoutProcessed.current = true;
            const prize = selectedTier.prize;
            const newWinning = (user.wallet.winning || 0) + prize;
            await update(ref(db, `users/${user.uid}/wallet`), { winning: newWinning });
            await push(ref(db, `transactions/${user.uid}`), {
                type: 'game', amount: prize, date: Date.now(), details: 'Tic Tac Toe Win', category: 'winning', closingBalance: newWinning + (user.wallet.added || 0)
            });
            await updateSystemWallet(-prize, "TTT Payout");
            showToast("Victory!", "success");
        }
    };

    const resetGame = () => {
        const tier = selectedTier;
        setGameState('lobby');
        setWinner(null);
        setRoundWinner(null);
        setScores({X:0, O:0});
        setHearts({X:3, O:3});
        setBoard(Array(9).fill(null));
        setGameId(null);
        setSelectedTier(null);
        payoutProcessed.current = false;
        setShowLeaveConfirm(false);
        setShowGameExitConfirm(false);
        setExitReason(null);
        if (tier) handleJoinQueue(tier);
    };

    const fetchHistory = async () => {
        setShowHistory(true);
        const snap = await get(ref(db, `transactions/${user.uid}`));
        if (snap.exists()) {
            const data = snap.val();
            const list = Object.keys(data)
                .map(k => ({...data[k], id: k}))
                .filter(t => t.details?.includes("Tic Tac Toe"))
                .reverse()
                .slice(0, 10);
            setLocalHistory(list);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950 text-white flex flex-col font-sans z-[150]">
            {(gameState === 'lobby' || gameState === 'finding' || gameState === 'matched' || gameState === 'search_timeout') && (
                <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-b border-slate-800 pb-6 pt-4 px-6 shadow-xl relative overflow-hidden shrink-0">
                    <div className="flex items-start justify-between relative z-10">
                        {gameState === 'lobby' ? (
                            <button onClick={onBack} className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700 transition">
                                <i className="fa-solid fa-arrow-left text-slate-400"></i>
                            </button>
                        ) : (
                            <button onClick={() => setShowLeaveConfirm(true)} className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 hover:bg-red-500/20 transition active:scale-95">
                                <i className="fa-solid fa-right-from-bracket"></i>
                            </button>
                        )}
                        <div className="flex items-center gap-2 bg-slate-900/40 px-3 py-1 rounded-full border border-slate-800">
                            <i className={`fa-solid fa-signal text-[8px] ${(latency && latency > 500) ? 'text-red-500' : 'text-green-500'}`}></i>
                            <span className="text-[10px] font-bold text-slate-400">{latency || 0}ms</span>
                        </div>
                    </div>
                    {gameState === 'lobby' && (
                        <div className="mt-6 flex items-center gap-4 animate-[fade-enter_0.3s]">
                            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 rotate-3">
                                <i className="fa-solid fa-xmarks-lines text-3xl text-white"></i>
                            </div>
                            <div>
                                <h1 className="text-2xl font-extrabold tracking-tight text-white">Tic Tac Toe</h1>
                                <p className="text-xs text-blue-300 font-medium bg-blue-900/30 px-2 py-0.5 rounded-lg w-fit mt-1">Real-Time Multiplayer</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {gameState === 'lobby' && (
                <div className="flex-1 p-5 overflow-y-auto animate-[fade-enter_0.3s]">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <i className="fa-solid fa-trophy text-yellow-500"></i>
                            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Choose Battle</h3>
                        </div>
                        <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1">
                            {[1, 3, 5].map((r) => (
                                <button key={r} onClick={() => setRounds(r as any)} className={`px-3 py-1 rounded text-[10px] font-bold transition ${rounds === r ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>{r} Rd</button>
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                        {TIERS.map((tier, idx) => (
                            <div key={idx} className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-blue-500/50 transition-all duration-300">
                                <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-slate-800 via-transparent to-transparent opacity-50"></div>
                                <div className="flex items-center justify-between relative z-10">
                                    <div className="flex flex-col gap-3">
                                        <div><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">Entry</p><p className="text-2xl font-black text-white leading-none">₹{tier.entry}</p></div>
                                        <div><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">You Win</p><p className="text-2xl font-black text-green-400 leading-none">₹{tier.prize}</p></div>
                                    </div>
                                    <button onClick={() => handleJoinQueue(tier)} className="h-12 px-8 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl text-sm font-bold shadow-xl shadow-blue-900/30 active:scale-95 transition-transform flex items-center gap-2">PLAY <i className="fa-solid fa-play"></i></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {(gameState === 'finding' || gameState === 'matched') && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-950 relative overflow-hidden animate-[fade-enter_0.3s]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950"></div>
                    <div className="relative z-10 mb-12">
                        <div className={`w-24 h-24 rounded-full border-4 border-slate-800 flex items-center justify-center relative transition-all ${gameState === 'matched' ? 'scale-110 border-green-500' : ''}`}>
                            <div className={`absolute inset-0 border-4 ${gameState === 'matched' ? 'border-green-500' : 'border-blue-500'} rounded-full border-t-transparent animate-spin`}></div>
                            <span className="text-3xl font-black text-white">{gameState === 'matched' ? battleStartCountdown : searchTimeLeft}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-6 relative z-10 mb-16">
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-28 h-28 rounded-full border-4 border-blue-500 p-1 bg-slate-800 shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                                <img src={user.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} className="w-full h-full rounded-full object-cover" />
                            </div>
                            <span className="text-xs font-bold text-blue-400">YOU</span>
                        </div>
                        <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center border border-white/10 backdrop-blur-sm">
                            <span className="text-sm font-black italic text-slate-500">VS</span>
                        </div>
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-28 h-28 rounded-full border-4 border-slate-800 p-1 bg-slate-800 shadow-inner">
                                <img src={gameState === 'matched' ? opponentPic : `https://api.dicebear.com/7.x/avataaars/svg?seed=${RANDOM_NAMES[cyclingIndex]}`} className="w-full h-full rounded-full object-cover" />
                            </div>
                            <span className={`text-xs font-bold ${gameState === 'matched' ? 'text-red-400' : 'text-slate-500'} uppercase`}>{gameState === 'matched' ? opponentName : "Searching"}</span>
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

            {gameState === 'search_timeout' && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-950 relative overflow-hidden">
                    <div className="absolute inset-0 bg-red-600/5 animate-pulse"></div>
                    <div className="relative z-10 text-center">
                        <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500 border border-red-500/30">
                            <i className="fa-solid fa-user-slash text-4xl"></i>
                        </div>
                        <h2 className="text-2xl font-black text-white uppercase italic mb-2 tracking-tight">No Player Found</h2>
                        <div className="flex flex-col items-center">
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-4">Returning to Table</p>
                            <div className="text-6xl font-black text-white tabular-nums animate-bounce">
                                {timeoutCountdown}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {gameState === 'playing' && (
                <div className="flex-1 flex flex-col p-4 relative overflow-y-auto animate-[fade-enter_0.3s]">
                    <div className="flex justify-between items-center bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl mb-4 border border-slate-800 shadow-xl relative">
                        <button onClick={() => setShowGameExitConfirm(true)} className="absolute -top-2 -right-2 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-transform z-30">
                            <i className="fa-solid fa-right-from-bracket text-xs"></i>
                        </button>
                        <div className={`flex flex-col items-center transition-all duration-300 ${currentTurn === mySymbol ? 'opacity-100 scale-110' : 'opacity-50'}`}>
                            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-400 font-black text-2xl mb-1 shadow-inner border border-blue-500/30 relative">
                                {mySymbol}
                                <span className="absolute -top-2 -right-2 w-6 h-6 bg-white text-slate-900 rounded-full flex items-center justify-center text-xs font-bold border-2 border-slate-900">{scores[mySymbol || 'X']}</span>
                            </div>
                            <div className="flex gap-1">
                                {[1,2,3].map(i => (
                                    <i key={i} className={`fa-solid fa-heart text-[8px] ${i <= (hearts[mySymbol!] || 0) ? 'text-red-500' : 'text-slate-700'}`}></i>
                                ))}
                            </div>
                            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">YOU</span>
                        </div>
                        <div className="flex flex-col items-center">
                            {currentTurn === mySymbol && (
                                <>
                                <span className={`text-3xl font-mono font-black ${turnTimer < 5 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>{turnTimer}</span>
                                <span className="text-[8px] text-slate-500 uppercase font-bold tracking-wider">SEC</span>
                                </>
                            )}
                            <div className="flex items-center gap-1 mt-1">
                                <span className={`w-2 h-2 rounded-full ${latency && latency > 500 ? 'bg-red-500' : 'bg-green-500'} animate-pulse`}></span>
                                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{currentTurn === mySymbol ? 'Your Turn' : 'Opponent'}</p>
                            </div>
                        </div>
                        <div className={`flex flex-col items-center transition-all duration-300 ${currentTurn !== mySymbol ? 'opacity-100 scale-110' : 'opacity-50'}`}>
                            <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center text-red-400 font-black text-2xl mb-1 shadow-inner border border-red-500/30 relative">
                                {mySymbol === 'X' ? 'O' : 'X'}
                                <span className="absolute -top-2 -right-2 w-6 h-6 bg-white text-slate-900 rounded-full flex items-center justify-center text-xs font-bold border-2 border-slate-900">{scores[mySymbol === 'X' ? 'O' : 'X']}</span>
                            </div>
                            <div className="flex gap-1">
                                {[1,2,3].map(i => (
                                    <i key={i} className={`fa-solid fa-heart text-[8px] ${i <= (hearts[mySymbol === 'X' ? 'O' : 'X'] || 0) ? 'text-red-500' : 'text-slate-700'}`}></i>
                                ))}
                            </div>
                            <span className="text-[10px] font-bold text-slate-300 truncate w-16 text-center uppercase tracking-tighter">{opponentName.split(' ')[0]}</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 aspect-square w-full max-w-sm mx-auto relative mb-4">
                        {roundWinner && !winner && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl animate-[fade-enter_0.2s]">
                                <div className="text-center">
                                    <div className="text-6xl mb-2">{roundWinner === 'Draw' ? '🤝' : '🏅'}</div>
                                    <h3 className="text-2xl font-black text-white uppercase italic">{roundWinner === 'Draw' ? 'Round Draw' : `${roundWinner === mySymbol ? 'You Won' : 'Opponent Won'}`}</h3>
                                    <p className="text-slate-300 text-xs font-bold">Next round starting...</p>
                                </div>
                            </div>
                        )}
                        {board.map((cell, idx) => (
                            <button key={idx} onClick={() => handleCellClick(idx)} disabled={!!cell || currentTurn !== mySymbol || !!winner || !!roundWinner} className={`rounded-2xl flex items-center justify-center text-6xl font-black shadow-lg transition-all active:scale-95 ${cell ? 'bg-slate-800 border-2 border-slate-700' : 'bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800'}`}>
                                {cell === 'X' && <span className="text-blue-500 drop-shadow-[0_0_10px_rgba(59,130,246,0.5)] animate-[fade-enter_0.2s]">X</span>}
                                {cell === 'O' && <span className="text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)] animate-[fade-enter_0.2s]">O</span>}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {gameState === 'result' && (
                <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col items-center justify-center p-6 animate-[fade-enter_0.3s]">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-sm p-8 rounded-[2.5rem] text-center shadow-2xl relative overflow-hidden">
                        <div className={`absolute top-0 left-0 w-full h-2 bg-gradient-to-r ${winner === mySymbol ? 'from-green-400 to-emerald-500' : winner === 'Draw' ? 'from-slate-400 to-slate-500' : 'from-red-400 to-red-600'}`}></div>
                        <div className="text-7xl mb-6 transform scale-125 animate-bounce">{winner === mySymbol ? '🏆' : winner === 'Draw' ? '🤝' : '💀'}</div>
                        <h2 className={`text-4xl font-black mb-1 uppercase italic tracking-tighter ${winner === mySymbol ? 'text-green-500' : winner === 'Draw' ? 'text-slate-200' : 'text-red-500'}`}>{winner === mySymbol ? 'VICTORY' : winner === 'Draw' ? 'DRAW' : 'DEFEAT'}</h2>
                        {exitReason === 'LEFT' && (
                            <div className="bg-white/5 py-1 px-4 rounded-full inline-block mb-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    {winner === mySymbol ? 'Opponent Left Match' : 'You Left Match'}
                                </p>
                            </div>
                        )}
                        {winner === mySymbol && selectedTier && (
                             <div className="mt-2 bg-green-500/10 border border-green-500/20 rounded-xl p-3 inline-block">
                                 <p className="text-[10px] text-green-400 font-bold uppercase tracking-widest mb-1">Prize Won</p>
                                 <p className="text-2xl font-black text-green-400">₹{selectedTier.prize}</p>
                             </div>
                        )}
                        <div className="flex justify-center gap-8 my-8 border-y border-slate-800 py-4">
                            <div className="text-center">
                                <p className="text-[10px] text-slate-500 uppercase font-bold">You</p>
                                <p className="text-2xl font-black text-white">{scores[mySymbol!]}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] text-slate-500 uppercase font-bold">Opp</p>
                                <p className="text-2xl font-black text-white">{scores[mySymbol === 'X' ? 'O' : 'X']}</p>
                            </div>
                        </div>
                        <div className="flex flex-col gap-3">
                            <button onClick={resetGame} className="w-full py-4 bg-white text-slate-900 font-black rounded-2xl hover:bg-slate-200 transition shadow-lg text-sm uppercase tracking-wider">Play Again</button>
                            <button onClick={onBack} className="w-full py-2 text-slate-500 font-bold text-xs uppercase tracking-widest hover:text-slate-300">Exit to Menu</button>
                        </div>
                    </div>
                </div>
            )}

            {showLeaveConfirm && (
                <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6 animate-[fade-enter_0.2s]">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-xs p-8 rounded-[2.5rem] text-center shadow-2xl overflow-hidden relative">
                        <div className="absolute top-0 left-0 w-full h-1 bg-red-600"></div>
                        <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-500 rotate-12">
                            <i className="fa-solid fa-triangle-exclamation text-3xl"></i>
                        </div>
                        <h3 className="text-xl font-black text-white mb-2 uppercase italic tracking-tight">Stop Search?</h3>
                        <p className="text-slate-400 text-sm mb-8 font-medium leading-relaxed">Finding the best opponent takes time. Leaving now will cancel your queue.</p>
                        <div className="flex flex-col gap-3">
                            <button onClick={() => cancelSearch()} className="w-full py-4 bg-red-600 text-white font-black rounded-2xl text-xs uppercase shadow-xl shadow-red-600/30">Yes, Cancel</button>
                            <button onClick={() => setShowLeaveConfirm(false)} className="w-full py-3 bg-slate-800 text-slate-300 font-bold rounded-2xl text-xs uppercase">No, Continue</button>
                        </div>
                    </div>
                </div>
            )}

            {showGameExitConfirm && (
                <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/80 backdrop-blur-md p-6 animate-[fade-enter_0.2s]">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-xs p-8 rounded-[2.5rem] text-center shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-red-600"></div>
                        <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-500 animate-pulse">
                            <i className="fa-solid fa-door-open text-3xl"></i>
                        </div>
                        <h3 className="text-xl font-black text-white mb-2 uppercase italic tracking-tight">Leave Game?</h3>
                        <p className="text-slate-400 text-sm mb-8 font-medium leading-relaxed">Exiting will result in an <span className="text-red-500 font-bold">INSTANT DEFEAT</span> and loss of entry fee.</p>
                        <div className="flex flex-col gap-3">
                            <button onClick={handleLeaveGame} className="w-full py-4 bg-red-600 text-white font-black rounded-2xl text-xs uppercase shadow-xl shadow-red-600/30">Leave & Forfeit</button>
                            <button onClick={() => setShowGameExitConfirm(false)} className="w-full py-3 bg-slate-800 text-slate-300 font-bold rounded-2xl text-xs uppercase">Return to Game</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TicTacToeScreen;
