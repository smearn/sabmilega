import React, { useState, useEffect, useRef } from "react";
import { update, ref, push, get } from "firebase/database";
import { db } from "../../firebase";
import { UserProfile, ToastType } from "../../types";
import { PullToRefresh } from "../Shared/PullToRefresh";

const TradeScreen = ({ user, showToast }: { user: UserProfile, showToast: (m: string, t: ToastType) => void }) => {
    const [action, setAction] = useState<'buy' | 'sell'>('buy');
    const [amount, setAmount] = useState("");
    const [loading, setLoading] = useState(false);
    
    // Simulation State for "Crypto" Feel
    const [price, setPrice] = useState(1.00);
    const [change, setChange] = useState(0.00);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [history, setHistory] = useState<number[]>([]);

    const coinBalance = user.wallet.smCoins || 0;
    const walletBalance = user.wallet.added + user.wallet.winning; // Can buy with total
    const winningBalance = user.wallet.winning; // Sell goes to Winning usually

    // Simulated Chart & Order Book
    useEffect(() => {
        // Initial history
        const initialData = Array(50).fill(1).map(() => 1 + (Math.random() * 0.02 - 0.01));
        setHistory(initialData);

        const interval = setInterval(() => {
            // Fluctuate slightly visually, but price stays effectively 1.00 for logic
            const fluctuation = (Math.random() * 0.02 - 0.01);
            const newPrice = 1.00 + fluctuation;
            setPrice(newPrice);
            setChange(fluctuation * 100);
            
            setHistory(prev => {
                const next = [...prev.slice(1), newPrice];
                return next;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    // Draw Chart
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        ctx.beginPath();
        const maxVal = Math.max(...history, 1.02);
        const minVal = Math.min(...history, 0.98);
        const range = maxVal - minVal || 0.04;

        history.forEach((val, i) => {
            const x = (i / (history.length - 1)) * w;
            const y = h - ((val - minVal) / range) * h;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });

        // Gradient Fill
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, action === 'buy' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.fill();

        // Line
        ctx.beginPath();
        history.forEach((val, i) => {
            const x = (i / (history.length - 1)) * w;
            const y = h - ((val - minVal) / range) * h;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = action === 'buy' ? '#22c55e' : '#ef4444';
        ctx.lineWidth = 2;
        ctx.stroke();

    }, [history, action]);

    const handleTrade = async () => {
        const val = parseFloat(amount);
        if (isNaN(val) || val <= 0) return showToast("Invalid Amount", "error");
        
        setLoading(true);
        try {
            const updates: any = {};
            const timestamp = Date.now();

            if (action === 'buy') {
                if (val > walletBalance) throw new Error("Insufficient Balance in Wallet");
                
                // Logic: Deduct from Added first, then Winning
                let remainingCost = val;
                let newAdded = user.wallet.added;
                let newWinning = user.wallet.winning;

                if (newAdded >= remainingCost) {
                    newAdded -= remainingCost;
                    remainingCost = 0;
                } else {
                    remainingCost -= newAdded;
                    newAdded = 0;
                    newWinning -= remainingCost;
                }

                updates[`users/${user.uid}/wallet/added`] = newAdded;
                updates[`users/${user.uid}/wallet/winning`] = newWinning;
                updates[`users/${user.uid}/wallet/smCoins`] = coinBalance + val; // 1:1 Ratio

                await push(ref(db, `transactions/${user.uid}`), {
                    type: 'coin_buy',
                    amount: val,
                    date: timestamp,
                    details: `Bought ${val} SM Coins`,
                    category: 'coins',
                    closingBalance: coinBalance + val
                });

                // Since funds moved to "Coins" (internal asset), it's still technically system Liability but held differently.
            } else {
                // Sell
                if (val > coinBalance) throw new Error("Insufficient SM Coins");
                
                updates[`users/${user.uid}/wallet/smCoins`] = coinBalance - val;
                // Proceeds go to Winning Wallet
                updates[`users/${user.uid}/wallet/winning`] = user.wallet.winning + val;

                await push(ref(db, `transactions/${user.uid}`), {
                    type: 'coin_sell',
                    amount: val,
                    date: timestamp,
                    details: `Sold ${val} SM Coins`,
                    category: 'winning',
                    closingBalance: (user.wallet.winning + val) + user.wallet.added
                });
            }

            await update(ref(db), updates);
            showToast(action === 'buy' ? "Coins Purchased!" : "Coins Sold!", "success");
            setAmount("");
        } catch (e: any) {
            showToast(e.message, "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-slate-950 min-h-screen text-white pb-24 pt-20 flex flex-col">
            <PullToRefresh onRefresh={async ()=>{}}>
            {/* Ticker */}
            <div className="px-6 mb-2">
                <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-yellow-500 flex items-center justify-center text-black font-bold shadow-lg shadow-yellow-500/20">
                        <i className="fa-solid fa-coins"></i>
                    </div>
                    <div>
                        <h2 className="text-lg font-bold leading-none">SM COIN <span className="text-slate-400 text-xs font-normal">/ INR</span></h2>
                        <div className="flex items-center gap-2">
                            <span className="text-2xl font-mono font-bold">₹{price.toFixed(2)}</span>
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${change >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Chart */}
            <div className="w-full h-48 bg-slate-900/50 mb-6 relative border-y border-slate-800">
                <canvas ref={canvasRef} width={window.innerWidth} height={192} className="w-full h-full" />
                <div className="absolute top-2 right-4 text-[10px] text-slate-500 font-mono">LIVE MARKET</div>
            </div>

            <div className="px-4 flex-1">
                {/* Balance Cards */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800">
                        <p className="text-[10px] text-slate-400 uppercase mb-1">Coin Holdings</p>
                        <p className="text-xl font-bold text-yellow-400 font-mono">{coinBalance.toFixed(2)} SM</p>
                        <p className="text-[10px] text-slate-500">≈ ₹{coinBalance.toFixed(2)}</p>
                    </div>
                    <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800">
                        <p className="text-[10px] text-slate-400 uppercase mb-1">Wallet INR</p>
                        <p className="text-xl font-bold text-white font-mono">₹{walletBalance.toFixed(2)}</p>
                        <p className="text-[10px] text-slate-500">Available to Buy</p>
                    </div>
                </div>

                {/* Trade Panel */}
                <div className="bg-slate-900 rounded-3xl p-1 border border-slate-800 mb-6">
                    <div className="flex mb-4">
                        <button onClick={() => setAction('buy')} className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-all ${action === 'buy' ? 'bg-green-600 text-white shadow-lg shadow-green-600/20' : 'text-slate-400 hover:text-white'}`}>BUY</button>
                        <button onClick={() => setAction('sell')} className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-all ${action === 'sell' ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'text-slate-400 hover:text-white'}`}>SELL</button>
                    </div>

                    <div className="px-4 pb-4">
                        <div className="mb-4">
                            <label className="text-[10px] text-slate-400 uppercase font-bold ml-1 mb-1 block">Amount ({action === 'buy' ? 'INR' : 'Coins'})</label>
                            <div className="relative">
                                <input 
                                    type="number" 
                                    value={amount} 
                                    onChange={e => setAmount(e.target.value)} 
                                    placeholder="0.00" 
                                    className={`w-full bg-slate-950 border-2 rounded-xl py-3 pl-4 pr-12 font-mono text-lg font-bold outline-none transition-colors ${action === 'buy' ? 'border-green-900 focus:border-green-600 text-green-400' : 'border-red-900 focus:border-red-600 text-red-400'}`}
                                />
                                <span className="absolute right-4 top-4 text-xs font-bold text-slate-600">{action === 'buy' ? 'INR' : 'SM'}</span>
                            </div>
                            <div className="flex justify-between mt-2 px-1">
                                <span className="text-[10px] text-slate-500">Rate: 1 SM = ₹1.00</span>
                                <span className="text-[10px] text-slate-500">Est: {amount || 0} {action === 'buy' ? 'SM' : 'INR'}</span>
                            </div>
                        </div>

                        <button 
                            onClick={handleTrade} 
                            disabled={loading}
                            className={`w-full py-4 rounded-xl font-bold text-white shadow-xl transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${action === 'buy' ? 'bg-green-600 shadow-green-600/30 hover:bg-green-500' : 'bg-red-600 shadow-red-600/30 hover:bg-red-500'}`}
                        >
                            {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : (action === 'buy' ? "BUY SM COINS" : "SELL SM COINS")}
                        </button>
                    </div>
                </div>

                {/* Simulated Order Book Visual */}
                <div className="mb-6">
                    <h4 className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest">Market Depth</h4>
                    <div className="flex gap-2 text-[10px] font-mono">
                        <div className="flex-1">
                            <div className="flex justify-between text-slate-600 mb-1 px-1"><span>Bid</span><span>Vol</span></div>
                            {[1,2,3,4].map(i => (
                                <div key={i} className="flex justify-between px-1 py-0.5 rounded bg-green-500/5 mb-0.5">
                                    <span className="text-green-500">1.00</span>
                                    <span className="text-slate-400">{(Math.random() * 500).toFixed(0)}</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between text-slate-600 mb-1 px-1"><span>Ask</span><span>Vol</span></div>
                            {[1,2,3,4].map(i => (
                                <div key={i} className="flex justify-between px-1 py-0.5 rounded bg-red-500/5 mb-0.5">
                                    <span className="text-red-500">1.00</span>
                                    <span className="text-slate-400">{(Math.random() * 500).toFixed(0)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            </PullToRefresh>
        </div>
    );
};

export default TradeScreen;
