
import React, { useState } from "react";
import { update, ref, push, get } from "firebase/database";
import { db } from "../../firebase";
import { UserProfile, ToastType } from "../../types";

const WithdrawScreen = ({ user, onClose, showToast, initialTab = 'withdraw' }: { user: UserProfile, onClose: () => void, showToast: (m: string, t: ToastType) => void, initialTab?: 'withdraw' | 'redeem' | 'p2p' }) => {
    const [activeTab, setActiveTab] = useState<'withdraw' | 'redeem'>(initialTab === 'p2p' ? 'withdraw' : initialTab);
    
    // Withdraw State
    const [withdrawAmount, setWithdrawAmount] = useState("");
    const [withdrawMethod, setWithdrawMethod] = useState<'upi' | 'bank'>('upi');
    const [upiId, setUpiId] = useState("");
    const [bankDetails, setBankDetails] = useState({ accNo: "", ifsc: "", name: "" });
    const [processing, setProcessing] = useState(false);

    // Redeem Store State
    const [buyingCode, setBuyingCode] = useState(false);

    const handleWithdraw = async () => {
        const amt = parseFloat(withdrawAmount);
        const cleanUpi = upiId.trim();
        const cleanAcc = bankDetails.accNo.trim();
        const cleanIfsc = bankDetails.ifsc.trim();
        const cleanName = bankDetails.name.trim();

        if (isNaN(amt) || amt <= 0) return showToast("Invalid Amount", "error");
        if (amt > user.wallet.winning) return showToast("Insufficient Winning Balance", "error");
        if (amt < 50) return showToast("Minimum withdrawal is ₹50", "error");

        if (withdrawMethod === 'upi' && !cleanUpi.includes('@')) return showToast("Invalid UPI ID", "error");
        if (withdrawMethod === 'bank' && (!cleanAcc || !cleanIfsc)) return showToast("Incomplete Bank Details", "error");

        setProcessing(true);
        try {
            const finalAmount = amt;
            const details = withdrawMethod === 'upi' 
                ? `UPI: ${cleanUpi}` 
                : `Bank: ${cleanAcc} | ${cleanIfsc} | ${cleanName}`;

            const newWinning = user.wallet.winning - amt;
            const closingBal = newWinning + user.wallet.added;

            await update(ref(db, `users/${user.uid}/wallet`), { winning: newWinning });
            
            await push(ref(db, `transactions/${user.uid}`), {
                type: 'withdraw',
                amount: amt,
                date: Date.now(),
                details: `Withdrawal Request`,
                category: 'winning',
                closingBalance: closingBal
            });

            await push(ref(db, `withdrawals`), {
                uid: user.uid,
                username: user.username,
                amount: finalAmount, 
                method: withdrawMethod,
                details: details,
                status: 'pending',
                date: Date.now()
            });

            showToast("Withdrawal Request Submitted!", "success");
            onClose();
        } catch (e) {
            showToast("Transaction Failed", "error");
        } finally {
            setProcessing(false);
        }
    };

    const handleBuyRedeemCode = async (amount: number) => {
        if (amount > user.wallet.winning) {
            showToast("Insufficient Winning Balance", "error");
            return;
        }

        if(!window.confirm(`Purchase ₹${amount} Google Play Code using your winnings?`)) return;

        setBuyingCode(true);
        try {
            const newWinning = user.wallet.winning - amount;
            const closingBal = newWinning + user.wallet.added;

            // Update Wallet
            await update(ref(db, `users/${user.uid}/wallet`), { winning: newWinning });

            // User Transaction
            await push(ref(db, `transactions/${user.uid}`), {
                type: 'game', // Using game type for now or could be 'withdraw' conceptually
                amount: amount,
                date: Date.now(),
                details: `Purchased Google Play Code`,
                category: 'winning',
                closingBalance: closingBal
            });

            // Create Withdraw Request (Admin will see this and send code)
            await push(ref(db, `withdrawals`), {
                uid: user.uid,
                username: user.username,
                amount: amount, 
                method: 'upi', // Storing as UPI type but details clarify it's a code
                details: 'Google Play Redeem Code Request',
                status: 'pending',
                date: Date.now()
            });

            showToast("Purchase Successful! Code will be sent shortly.", "success");
        } catch (e) {
            showToast("Purchase Failed", "error");
        } finally {
            setBuyingCode(false);
        }
    };

    const PlayStoreCard = ({ value }: { value: number }) => (
        <div 
            onClick={() => !buyingCode && handleBuyRedeemCode(value)}
            className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm cursor-pointer transition transform active:scale-95 group"
        >
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition">
                <i className="fa-brands fa-google-play text-6xl text-slate-900 dark:text-white"></i>
            </div>
            <div className="p-4 flex flex-col justify-between h-full relative z-10">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white shadow-md">
                        <i className="fa-brands fa-google-play text-sm"></i>
                    </div>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Google Play</span>
                </div>
                <div>
                    <p className="text-[10px] text-slate-400 uppercase font-medium">Value</p>
                    <p className="text-2xl font-black text-slate-800 dark:text-white">₹{value}</p>
                </div>
                <button className="mt-3 w-full py-2 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold shadow hover:bg-slate-800 dark:hover:bg-slate-600 transition">
                    Buy with Winnings
                </button>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[70] bg-slate-50 dark:bg-slate-950 flex flex-col animate-[slide-up_0.2s_ease-out]">
            <div className="bg-slate-900 dark:bg-slate-800 text-white p-3 flex items-center justify-between shadow-lg">
                <button onClick={onClose}><i className="fa-solid fa-arrow-left"></i></button>
                <h3 className="font-bold text-base">Payments</h3>
                <div className="w-6"></div>
            </div>

            <div className="flex bg-white dark:bg-slate-900 shadow-sm border-b border-slate-100 dark:border-slate-800">
                <button onClick={() => setActiveTab('withdraw')} className={`flex-1 py-3 text-xs font-bold uppercase border-b-2 transition ${activeTab === 'withdraw' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-slate-400'}`}>Withdraw Cash</button>
                <button onClick={() => setActiveTab('redeem')} className={`flex-1 py-3 text-xs font-bold uppercase border-b-2 transition ${activeTab === 'redeem' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-400'}`}>Redeem Code</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pb-24">
                {activeTab === 'withdraw' && (
                    <div className="space-y-4">
                        <div className="bg-gradient-to-r from-orange-500 to-red-600 rounded-xl p-4 text-white shadow-lg shadow-orange-500/30">
                            <p className="text-orange-100 text-[10px] font-bold uppercase mb-1">Available Winning Balance</p>
                            <h2 className="text-3xl font-bold">₹{user.wallet.winning}</h2>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase ml-1 mb-1 block">Method</label>
                            <div className="flex gap-2">
                                <button onClick={() => setWithdrawMethod('upi')} className={`flex-1 py-3 rounded-lg border-2 font-bold text-xs flex items-center justify-center gap-2 transition ${withdrawMethod === 'upi' ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500'}`}>
                                    <i className="fa-solid fa-mobile-screen-button"></i> UPI
                                </button>
                                <button onClick={() => setWithdrawMethod('bank')} className={`flex-1 py-3 rounded-lg border-2 font-bold text-xs flex items-center justify-center gap-2 transition ${withdrawMethod === 'bank' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500'}`}>
                                    <i className="fa-solid fa-building-columns"></i> Bank
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase ml-1 mb-1 block">Amount</label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-slate-400 font-bold">₹</span>
                                <input 
                                    type="number" 
                                    value={withdrawAmount} 
                                    onChange={e => setWithdrawAmount(e.target.value)} 
                                    placeholder="0" 
                                    className="w-full pl-6 pr-3 py-2 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg font-bold text-base outline-none focus:border-orange-500 dark:text-white transition"
                                />
                            </div>
                            <p className="text-[9px] text-green-500 mt-1 ml-1 font-bold">No Service Charge (0%)</p>
                        </div>

                        {withdrawMethod === 'upi' ? (
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase ml-1 mb-1 block">UPI ID</label>
                                <input 
                                    value={upiId} 
                                    onChange={e => setUpiId(e.target.value)} 
                                    placeholder="e.g. mobile@upl" 
                                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg font-medium text-sm outline-none focus:border-green-500 dark:text-white transition"
                                />
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                <input value={bankDetails.accNo} onChange={e => setBankDetails({...bankDetails, accNo: e.target.value})} placeholder="Account No" className="col-span-2 w-full px-3 py-2 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg font-medium text-sm outline-none focus:border-blue-500 dark:text-white" />
                                <input value={bankDetails.ifsc} onChange={e => setBankDetails({...bankDetails, ifsc: e.target.value})} placeholder="IFSC" className="w-full px-3 py-2 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg font-medium text-sm outline-none focus:border-blue-500 dark:text-white" />
                                <input value={bankDetails.name} onChange={e => setBankDetails({...bankDetails, name: e.target.value})} placeholder="Holder Name" className="w-full px-3 py-2 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg font-medium text-sm outline-none focus:border-blue-500 dark:text-white" />
                            </div>
                        )}

                        <button onClick={handleWithdraw} disabled={processing} className="w-full bg-slate-900 dark:bg-slate-700 text-white font-bold py-3.5 rounded-xl shadow-xl shadow-slate-900/20 flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-70 mt-2">
                            {processing ? <i className="fa-solid fa-spinner fa-spin"></i> : "SUBMIT REQUEST"}
                        </button>
                    </div>
                )}

                {activeTab === 'redeem' && (
                    <div>
                        <div className="flex items-center justify-between mb-4 px-1">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Redeem Code Store</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Buy Play Store codes instantly.</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-slate-400 uppercase font-bold">Balance</p>
                                <p className="text-green-600 dark:text-green-400 font-bold">₹{user.wallet.winning}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <PlayStoreCard value={10} />
                            <PlayStoreCard value={50} />
                            <PlayStoreCard value={80} />
                            <PlayStoreCard value={100} />
                            <PlayStoreCard value={160} />
                            <PlayStoreCard value={500} />
                        </div>
                        
                        <p className="text-center text-[10px] text-slate-400 mt-6 max-w-xs mx-auto">
                            Codes are sent to your registered email or notification box within 24 hours.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WithdrawScreen;
