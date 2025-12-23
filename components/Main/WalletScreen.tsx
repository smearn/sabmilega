
import React, { useState, useEffect } from "react";
import { ref, onValue, get, update, push } from "firebase/database";
import { db } from "../../firebase";
import { ToastType, Transaction, UserProfile } from "../../types";
import { formatDate, updateSystemWallet } from "../../utils";
import { PullToRefresh } from "../Shared/PullToRefresh";
import WithdrawScreen from "./WithdrawScreen";

const WalletScreen = ({ user, showToast }: { user: UserProfile, showToast: (m: string, t: ToastType) => void }) => {
  const [activeTab, setActiveTab] = useState<'all'|'game'|'withdraw'>('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  
  // Date Filter State
  const [dateFilter, setDateFilter] = useState<'today'|'yesterday'|'custom'|'all'>('all');
  const [customDate, setCustomDate] = useState(new Date().toISOString().split('T')[0]);

  // Transfer States
  const [transferUser, setTransferUser] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferStatus, setTransferStatus] = useState("");

  const isSuperAdmin = user.username === 'superadmin' || user.username === '@superadmin';

  useEffect(() => {
     const txRef = ref(db, `transactions/${user.uid}`);
     const unsub = onValue(txRef, (snap) => {
        if (snap.exists()) {
           const data = snap.val();
           const arr = Object.keys(data).map(k => ({...data[k], id: k})).reverse();
           setTransactions(arr);
        } else {
           setTransactions([]);
        }
     });
     return () => unsub();
  }, [user.uid]);

  const handleAddClick = () => setShowAdd(true);
  const handleTransferClick = () => setShowTransfer(true);

  // Simulating Add Cash (Real app would use Payment Gateway)
  const handleAddCash = async (amt: number) => {
      try {
          const currentAdded = user.wallet.added || 0;
          const newAdded = currentAdded + amt;
          const closingBal = newAdded + user.wallet.winning;

          // 1. Add to User
          await update(ref(db, `users/${user.uid}/wallet`), { added: newAdded });
          await push(ref(db, `transactions/${user.uid}`), { 
              type: 'add', 
              amount: amt, 
              date: Date.now(), 
              details: 'Deposited Cash', 
              category: 'added',
              closingBalance: closingBal // Track Total Balance
          });

          // 2. System Logic
          await updateSystemWallet(amt, "User Deposit");

          showToast(`₹${amt} Added Successfully`, "success");
          setShowAdd(false);
      } catch (e) {
          showToast("Failed to add cash", "error");
      }
  };

  const handleTransfer = async () => {
     if(!transferUser || !transferAmount) return;
     const amt = parseFloat(transferAmount);
     if(amt > user.wallet.winning) {
        setTransferStatus("Insufficient Winning Balance");
        return;
     }
     
     setTransferStatus("Processing...");
     try {
        const usersRef = ref(db, 'users');
        const snap = await get(usersRef);
        let recipientId = null;
        let recipientData: UserProfile | null = null;
        
        if (snap.exists()) {
           const users = snap.val();
           Object.values(users).forEach((u: any) => {
              if(u.username === transferUser || u.username === '@'+transferUser.replace('@','')) {
                 recipientId = u.uid;
                 recipientData = u;
              }
           });
        }

        if(!recipientId) throw new Error("User not found");

        const myNewWinning = (user.wallet.winning || 0) - amt;
        const myTotal = myNewWinning + user.wallet.added;
        
        // Update Sender
        await update(ref(db, `users/${user.uid}/wallet`), { winning: myNewWinning });
        await push(ref(db, `transactions/${user.uid}`), { 
            type: 'transfer_sent', 
            amount: amt, 
            date: Date.now(), 
            details: `To ${recipientData?.username || transferUser}`, 
            category: 'winning',
            closingBalance: myTotal
        });

        // Update Recipient (Goes to Added, Fixed in FriendsScreen too)
        const recRef = ref(db, `users/${recipientId}/wallet`);
        const recSnap = await get(recRef);
        const currentRecAdded = recSnap.exists() ? (recSnap.val().added || 0) : 0;
        const currentRecWinning = recSnap.exists() ? (recSnap.val().winning || 0) : 0;
        const recNewAdded = currentRecAdded + amt;
        const recTotal = recNewAdded + currentRecWinning;
        
        await update(recRef, { added: recNewAdded });
        await push(ref(db, `transactions/${recipientId}`), { 
            type: 'transfer_received', 
            amount: amt, 
            date: Date.now(), 
            details: `From ${user.username}`, 
            category: 'added', 
            closingBalance: recTotal
        });

        showToast("Transfer Successful!", "success");
        setTransferStatus("Transfer Successful!");
        setTimeout(() => { setShowTransfer(false); setTransferStatus(""); setTransferAmount(""); setTransferUser(""); }, 1500);

     } catch(e: any) {
        setTransferStatus("Error: " + e.message);
     }
  };

  // Filter Logic with Date Grouping
  const getFilteredTransactions = () => {
      // 1. Tab Filter
      let filtered = transactions.filter(t => {
         if(activeTab === 'all') return true;
         if(activeTab === 'game') return t.type === 'game';
         if(activeTab === 'withdraw') return t.type === 'withdraw';
         return true;
      });

      // 2. Date Filter Logic
      const startOfToday = new Date();
      startOfToday.setHours(0,0,0,0);
      const endOfToday = new Date();
      endOfToday.setHours(23,59,59,999);

      const startOfYesterday = new Date(startOfToday);
      startOfYesterday.setDate(startOfYesterday.getDate() - 1);
      const endOfYesterday = new Date(endOfToday);
      endOfYesterday.setDate(endOfToday.getDate() - 1);

      let customStart = 0;
      let customEnd = 0;
      if(customDate) {
          const cd = new Date(customDate);
          customStart = cd.getTime();
          customEnd = customStart + 86400000 - 1;
      }

      return filtered.filter(t => {
          if (dateFilter === 'today') {
              return t.date >= startOfToday.getTime() && t.date <= endOfToday.getTime();
          } else if (dateFilter === 'yesterday') {
              return t.date >= startOfYesterday.getTime() && t.date <= endOfYesterday.getTime();
          } else if (dateFilter === 'custom') {
              return t.date >= customStart && t.date <= customEnd;
          }
          return true; // 'all'
      });
  };

  const filteredTx = getFilteredTransactions();

  // Summary Logic for filtered view
  const summary = filteredTx.reduce((acc, t) => {
      const isEntry = t.details?.toLowerCase().includes('entry') || t.details?.toLowerCase().includes('joined');
      const isCredit = t.type === 'add' || t.type === 'bonus' || t.type === 'transfer_received' || (t.type === 'game' && t.category === 'winning' && !isEntry) || t.type === 'p2p_buy';
      if (isCredit) acc.credit += t.amount;
      else acc.debit += t.amount;
      return acc;
  }, { credit: 0, debit: 0 });

  const renderGroupedTransactions = () => {
      if (filteredTx.length === 0) return <div className="text-center py-8 text-slate-400">No transactions found</div>;

      const grouped: Record<string, Transaction[]> = {};
      const todayStr = new Date().toDateString();
      const yesterdayStr = new Date(Date.now() - 86400000).toDateString();

      filteredTx.forEach(t => {
          const d = new Date(t.date).toDateString();
          let key = d;
          if (d === todayStr) key = "Today";
          else if (d === yesterdayStr) key = "Yesterday";
          
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(t);
      });

      return Object.keys(grouped).map(dateKey => (
          <div key={dateKey} className="mb-4">
              <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-2 ml-2 bg-slate-100 dark:bg-slate-800 inline-block px-2 py-0.5 rounded">{dateKey}</div>
              <div className="space-y-3">
                  {grouped[dateKey].map(tx => {
                      const isEntry = tx.details?.toLowerCase().includes('entry') || tx.details?.toLowerCase().includes('joined');
                      
                      const isPositive = 
                          tx.type === 'add' || 
                          tx.type === 'bonus' || 
                          tx.type === 'transfer_received' ||
                          tx.type === 'p2p_buy' ||
                          (tx.type === 'game' && tx.category === 'winning' && !isEntry); // Ensure entries are treated as expenses

                      const isNegative = !isPositive;
                      const amountColor = isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400';
                      const amountSign = isPositive ? '+' : '-';
                      const categoryColor = isNegative ? 'text-red-500' : 'text-slate-400';

                      return (
                      <div key={tx.id} className="flex justify-between items-center pb-3 border-b border-slate-50 dark:border-slate-800 last:border-0 last:pb-0">
                         <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${isPositive ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400'}`}>
                               <i className={`fa-solid ${
                                  tx.type === 'add' || tx.type === 'p2p_buy' || tx.type === 'coin_sell' ? 'fa-arrow-down' : 
                                  tx.type === 'withdraw' || tx.type === 'p2p_sell' || tx.type === 'coin_buy' ? 'fa-arrow-up' :
                                  tx.type.includes('transfer') ? 'fa-money-bill-transfer' : 'fa-gamepad'
                               } text-sm`}></i>
                            </div>
                            <div>
                               <p className="font-bold text-slate-800 dark:text-white text-xs capitalize leading-tight max-w-[150px] truncate">{tx.details || tx.type}</p>
                               <p className="text-[10px] text-slate-400 mt-0.5">{formatDate(tx.date)}</p>
                            </div>
                         </div>
                         <div className="text-right">
                            <p className={`font-bold text-sm ${amountColor}`}>
                               {amountSign}₹{tx.amount}
                            </p>
                            <div className="flex flex-col items-end">
                                <p className={`text-[9px] font-medium uppercase ${categoryColor}`}>{tx.category}</p>
                                {tx.closingBalance !== undefined && (
                                    <p className="text-[9px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 rounded mt-0.5">Bal: ₹{tx.closingBalance}</p>
                                )}
                            </div>
                         </div>
                      </div>
                   )})}
              </div>
          </div>
      ));
  };

  return (
    <div className="pb-24 pt-20 px-4 h-full flex flex-col bg-slate-50 dark:bg-slate-950">
      <PullToRefresh onRefresh={async () => {}}>
      
      <div className="grid grid-cols-2 gap-4 mb-6">
         {/* Added Cash */}
         <div className="bg-blue-600 dark:bg-blue-700 rounded-2xl p-4 text-white shadow-lg shadow-blue-500/20 flex flex-col justify-between">
            <div>
                <p className="text-blue-100 text-xs font-medium uppercase tracking-wider mb-1">Added Cash</p>
                <h2 className="text-3xl font-semibold">₹{user.wallet.added}</h2>
            </div>
            {!isSuperAdmin && (
                <button onClick={handleAddClick} className="mt-3 w-full bg-white/20 hover:bg-white/30 py-2 rounded-lg text-xs font-medium transition flex items-center justify-center gap-2">
                   <i className="fa-solid fa-plus"></i> ADD CASH
                </button>
            )}
         </div>
         {/* Winning Cash */}
         <div className="bg-orange-500 dark:bg-orange-600 rounded-2xl p-4 text-white shadow-lg shadow-orange-500/20 flex flex-col justify-between relative">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-orange-100 text-xs font-medium uppercase tracking-wider mb-1">Winnings</p>
                    <h2 className="text-3xl font-semibold">₹{user.wallet.winning}</h2>
                </div>
                {!isSuperAdmin && (
                    <button onClick={handleTransferClick} className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition active:scale-95">
                       <i className="fa-solid fa-paper-plane text-xs"></i>
                    </button>
                )}
            </div>
            {!isSuperAdmin && (
                <button onClick={() => setShowWithdraw(true)} className="mt-3 w-full bg-white text-orange-600 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center shadow-sm gap-2">
                   WITHDRAW
                </button>
            )}
         </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col flex-1 min-h-0">
         <div className="flex border-b border-slate-100 dark:border-slate-800">
            {['all', 'game', 'withdraw'].map((t) => (
               <button 
                  key={t}
                  onClick={() => setActiveTab(t as any)}
                  className={`flex-1 py-3 text-sm font-medium capitalize transition ${activeTab === t ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-slate-400'}`}
               >
                  {t}
               </button>
            ))}
         </div>
         
         <div className="p-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 overflow-x-auto no-scrollbar">
             <button onClick={() => setDateFilter('all')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition whitespace-nowrap ${dateFilter === 'all' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500'}`}>All</button>
             <button onClick={() => setDateFilter('today')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition whitespace-nowrap ${dateFilter === 'today' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500'}`}>Today</button>
             <button onClick={() => setDateFilter('yesterday')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition whitespace-nowrap ${dateFilter === 'yesterday' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500'}`}>Yesterday</button>
             <input type="date" value={customDate} min="2025-01-01" onChange={(e) => { setCustomDate(e.target.value); setDateFilter('custom'); }} className="text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 rounded-lg px-2 py-1 outline-none border border-slate-200 dark:border-slate-700" />
         </div>

         <div className="flex-1 p-4 overflow-y-auto">
            {renderGroupedTransactions()}
         </div>

         <div className="bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 p-3 flex justify-between items-center text-xs">
             <span className="font-bold text-slate-500">Total</span>
             <div className="flex gap-3">
                 <span className="text-green-600 dark:text-green-400 font-bold">+₹{summary.credit}</span>
                 <span className="text-red-500 dark:text-red-400 font-bold">-₹{summary.debit}</span>
             </div>
         </div>
      </div>
      </PullToRefresh>

      {showAdd && (
         <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm animate-[fade-enter_0.3s]">
               <h3 className="text-xl font-semibold text-slate-800 dark:text-white mb-4">Add Cash</h3>
               <p className="text-slate-500 text-sm mb-4">Add money to join premium tournaments.</p>
               <div className="grid grid-cols-3 gap-2 mb-4">
                  {[50, 100, 200, 500].map(amt => (
                     <button key={amt} onClick={() => handleAddCash(amt)} className="border border-blue-200 dark:border-blue-800 rounded-lg py-2 text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-50 dark:hover:bg-blue-900/30">₹{amt}</button>
                  ))}
               </div>
               <button onClick={() => setShowAdd(false)} className="w-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium py-3 rounded-xl mt-2">Close</button>
            </div>
         </div>
      )}

      {showTransfer && (
         <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm animate-[fade-enter_0.3s]">
               <h3 className="text-xl font-semibold text-slate-800 dark:text-white mb-2">Transfer Winnings</h3>
               {transferStatus && <p className={`text-sm mb-4 font-medium ${transferStatus.includes('Error') || transferStatus.includes('Insufficient') ? 'text-red-500' : 'text-blue-500'}`}>{transferStatus}</p>}
               <div className="space-y-4">
                  <div>
                     <label className="text-xs font-medium text-slate-500 uppercase">Username</label>
                     <input className="w-full border-b-2 border-slate-200 dark:border-slate-700 py-2 focus:border-orange-500 outline-none font-medium text-slate-800 dark:text-white bg-transparent" placeholder="@friend" value={transferUser} onChange={e => setTransferUser(e.target.value)} />
                  </div>
                  <div>
                     <label className="text-xs font-medium text-slate-500 uppercase">Amount</label>
                     <input className="w-full border-b-2 border-slate-200 dark:border-slate-700 py-2 focus:border-orange-500 outline-none font-medium text-slate-800 dark:text-white bg-transparent" type="number" placeholder="₹0" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} />
                     <p className="text-[10px] text-orange-500 mt-1">Available Winnings: ₹{user.wallet.winning}</p>
                  </div>
                  <button onClick={handleTransfer} className="w-full bg-orange-500 text-white font-medium py-3 rounded-xl shadow-lg shadow-orange-500/30">Transfer Now</button>
                  <button onClick={() => setShowTransfer(false)} className="w-full text-slate-400 font-medium py-2 text-sm">Cancel</button>
               </div>
            </div>
         </div>
      )}

      {showWithdraw && <WithdrawScreen user={user} onClose={() => setShowWithdraw(false)} showToast={showToast} initialTab="withdraw" />}
    </div>
  );
};

export default WalletScreen;
