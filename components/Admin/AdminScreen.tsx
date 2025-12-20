
import React, { useState, useEffect } from "react";
import { ref, get, remove, update, push } from "firebase/database";
import { db } from "../../firebase";
import { UserProfile, Transaction, ToastType, WithdrawRequest } from "../../types";
import { formatDate } from "../../utils";
import { ConfirmModal } from "../Shared/ConfirmModal";

type TimeFilter = 'today' | 'month' | 'year' | 'all';
type ViewMode = 'users' | 'transactions' | 'withdrawals';

interface ExtendedTransaction extends Transaction {
   uid: string;
   username: string;
}

const AdminScreen = ({ onClose, isSuperAdminView = false, currentUser, showToast }: { onClose: () => void, isSuperAdminView?: boolean, currentUser: UserProfile, showToast: (m: string, t: ToastType) => void }) => {
   const [users, setUsers] = useState<UserProfile[]>([]);
   const [allTransactions, setAllTransactions] = useState<ExtendedTransaction[]>([]);
   const [withdrawals, setWithdrawals] = useState<WithdrawRequest[]>([]);
   
   // UI State
   const [searchQuery, setSearchQuery] = useState("");
   const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
   const [viewMode, setViewMode] = useState<ViewMode>('users');
   const [loading, setLoading] = useState(true);
   const [actionLoading, setActionLoading] = useState(false);
   
   // Action State
   const [userToDelete, setUserToDelete] = useState<string | null>(null);
   const [userToBan, setUserToBan] = useState<{uid: string, currentStatus: boolean} | null>(null);
   
   // Wallet Management State (Super Admin Only)
   const [walletModalOpen, setWalletModalOpen] = useState(false);
   const [selectedUserForWallet, setSelectedUserForWallet] = useState<UserProfile | null>(null);
   const [walletAmount, setWalletAmount] = useState("");
   const [walletAction, setWalletAction] = useState<'add' | 'deduct'>('add');

   // Super Admin Reset State
   const [showResetConfirm, setShowResetConfirm] = useState(false);

   const isSuperAdmin = currentUser.username === 'superadmin' || currentUser.username === '@superadmin';

   useEffect(() => {
      fetchData();
   }, []);

   const fetchData = async () => {
      setLoading(true);
      try {
         // 1. Fetch Users
         const usersSnap = await get(ref(db, 'users'));
         let userList: UserProfile[] = [];
         let userMap: Record<string, string> = {}; 

         if(usersSnap.exists()) {
            const data = usersSnap.val();
            userList = Object.values(data);
            userList = userList.map(u => ({
               ...u,
               wallet: u.wallet || { added: 0, winning: 0 },
               referralCode: u.referralCode || "N/A"
            }));
            
            userList.forEach(u => userMap[u.uid] = u.username);
            setUsers(userList);
         }

         // 2. Fetch Transactions
         const txSnap = await get(ref(db, 'transactions'));
         let txList: ExtendedTransaction[] = [];
         if(txSnap.exists()) {
            const data = txSnap.val();
            Object.keys(data).forEach(uid => {
               const userTx = data[uid];
               Object.keys(userTx).forEach(txId => {
                  txList.push({
                     ...userTx[txId],
                     id: txId,
                     uid: uid,
                     username: userMap[uid] || 'Unknown'
                  });
               });
            });
            txList.sort((a, b) => b.date - a.date);
            setAllTransactions(txList);
         }

         // 3. Fetch Withdrawals
         const wSnap = await get(ref(db, 'withdrawals'));
         if(wSnap.exists()) {
             const data = wSnap.val();
             const list = Object.keys(data).map(k => ({...data[k], id: k})).sort((a:any,b:any) => b.date - a.date);
             setWithdrawals(list);
         } else {
             setWithdrawals([]);
         }

      } catch (e) {
         console.error(e);
      } finally {
         setLoading(false);
      }
   };

   // ... (Keep existing export/delete/ban/wallet functions same logic, focusing on UI update) ...
   const handleExportUsers = () => { /* Same logic */ };
   const handleDeleteUser = async () => {
      if(!userToDelete || actionLoading) return;
      setActionLoading(true);
      try {
         await remove(ref(db, `users/${userToDelete}`));
         await remove(ref(db, `transactions/${userToDelete}`));
         setUsers(users.filter(u => u.uid !== userToDelete));
         setAllTransactions(allTransactions.filter(t => t.uid !== userToDelete));
      } catch(e) {
         alert("Failed to delete user data");
      } finally {
         setActionLoading(false);
         setUserToDelete(null);
      }
   };

   const handleBanToggle = async () => {
       if(!userToBan || actionLoading) return;
       setActionLoading(true);
       try {
           const newStatus = !userToBan.currentStatus;
           await update(ref(db, `users/${userToBan.uid}`), { isBanned: newStatus });
           setUsers(users.map(u => u.uid === userToBan.uid ? {...u, isBanned: newStatus} : u));
       } catch(e) {
           alert("Failed to update ban status");
       } finally {
           setActionLoading(false);
           setUserToBan(null);
       }
   };

   const openWalletModal = (user: UserProfile) => {
       setSelectedUserForWallet(user);
       setWalletAmount("");
       setWalletAction('add');
       setWalletModalOpen(true);
   };

   const handleWalletUpdate = async () => {
       if (!selectedUserForWallet || !walletAmount || actionLoading) return;
       const amt = parseFloat(walletAmount);
       if (isNaN(amt) || amt <= 0) {
           alert("Invalid Amount");
           return;
       }

       setActionLoading(true);
       try {
           const currentAdded = selectedUserForWallet.wallet.added;
           let newAdded = currentAdded;

           if (walletAction === 'add') {
               newAdded += amt;
           } else {
               if (currentAdded < amt) {
                   alert("User has insufficient 'Added' balance. Deducting max available.");
                   newAdded = 0;
               } else {
                   newAdded -= amt;
               }
           }

           await update(ref(db, `users/${selectedUserForWallet.uid}/wallet`), { added: newAdded });
           await push(ref(db, `transactions/${selectedUserForWallet.uid}`), {
               type: walletAction === 'add' ? 'bonus' : 'withdraw',
               amount: amt,
               date: Date.now(),
               details: `SuperAdmin ${walletAction === 'add' ? 'Credit' : 'Debit'}`,
               category: 'added'
           });

           setUsers(users.map(u => u.uid === selectedUserForWallet.uid ? {
               ...u, 
               wallet: { ...u.wallet, added: newAdded }
           } : u));

           setWalletModalOpen(false);
           alert("Wallet Updated Successfully");

       } catch (e) {
           alert("Error updating wallet");
       } finally {
           setActionLoading(false);
       }
   };

   const handleFactoryReset = async () => {
       setActionLoading(true);
       try {
           await remove(ref(db)); 
           alert("Database Wiped Successfully. App will reload.");
           window.location.reload();
       } catch (e) {
           alert("Failed to wipe database");
           setActionLoading(false);
       }
   };

   const handleWithdrawAction = async (w: WithdrawRequest, action: 'approve' | 'reject') => {
       if(actionLoading) return;
       setActionLoading(true);
       try {
           if (action === 'approve') {
               await update(ref(db, `withdrawals/${w.id}`), { status: 'completed' });
               showToast("Marked as Paid", "success");
           } else {
               // Reject: Refund
               const userRef = ref(db, `users/${w.uid}/wallet`);
               const snap = await get(userRef);
               if(snap.exists()) {
                   const wallet = snap.val();
                   const newWinning = (wallet.winning || 0) + w.amount;
                   await update(userRef, { winning: newWinning });
                   
                   await push(ref(db, `transactions/${w.uid}`), {
                       type: 'bonus', amount: w.amount, date: Date.now(),
                       details: 'Refund: Withdrawal Rejected', category: 'winning', closingBalance: newWinning + wallet.added
                   });
               }
               await update(ref(db, `withdrawals/${w.id}`), { status: 'rejected' });
               showToast("Rejected & Refunded", "info");
           }
           setWithdrawals(withdrawals.map(item => item.id === w.id ? {...item, status: action === 'approve' ? 'completed' : 'rejected'} : item));
       } catch(e) {
           alert("Action failed");
       } finally {
           setActionLoading(false);
       }
   };

   const getFilteredTransactions = (filter: TimeFilter) => {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();

      return allTransactions.filter(t => {
         if (filter === 'today') return t.date >= startOfToday;
         if (filter === 'month') return t.date >= startOfMonth;
         if (filter === 'year') return t.date >= startOfYear;
         return true;
      });
   };

   const calculateMargin = (filter: TimeFilter) => {
       const txs = getFilteredTransactions(filter);
       const stats = txs.reduce((acc, t) => {
          if(t.type === 'add') acc.revenue += t.amount;
          if(t.type === 'bonus') acc.loss += t.amount;
          return acc;
       }, { revenue: 0, loss: 0 });
       return stats.revenue - stats.loss;
   };

   const currentTx = getFilteredTransactions(timeFilter);
   const currentStats = currentTx.reduce((acc, t) => {
      if(t.type === 'add') acc.revenue += t.amount;
      if(t.type === 'bonus') acc.loss += t.amount;
      if(t.type === 'withdraw') acc.withdraw += t.amount;
      return acc;
   }, { revenue: 0, loss: 0, withdraw: 0 });
   
   const monthlyMargin = calculateMargin('month');
   const yearlyMargin = calculateMargin('year');

   const filteredUsers = users.filter(u => 
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) || 
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.name.toLowerCase().includes(searchQuery.toLowerCase())
   );

   return (
      <div className={`fixed inset-0 bg-slate-100 dark:bg-slate-950 z-[160] overflow-y-auto animate-[fade-enter_0.3s] text-slate-900 dark:text-white`}>
         {/* Glassmorphism Header matching App */}
         <div className="fixed top-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 dark:border-slate-800 backdrop-blur-md z-30 px-4 py-3 shadow-sm flex items-center justify-between h-16 transition-all border-b">
            <h2 className="font-semibold text-lg text-blue-700 dark:text-blue-400 flex items-center gap-2">
                <i className={`fa-solid ${isSuperAdmin ? 'fa-user-secret' : 'fa-shield-halved'} text-orange-500`}></i>
                {isSuperAdmin ? 'System Admin' : 'Admin Panel'}
            </h2>
            <div className="flex gap-2">
                <button onClick={handleExportUsers} className="w-9 h-9 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition shadow-sm" title="Export Users">
                    <i className="fa-solid fa-file-csv"></i>
                </button>
                {isSuperAdmin && (
                    <button onClick={() => setShowResetConfirm(true)} className="w-9 h-9 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition shadow-sm" title="Factory Reset">
                        <i className="fa-solid fa-triangle-exclamation"></i>
                    </button>
                )}
                <button onClick={onClose} className="w-9 h-9 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition shadow-sm">
                    {isSuperAdminView ? <i className="fa-solid fa-right-from-bracket"></i> : <i className="fa-solid fa-xmark"></i>}
                </button>
            </div>
         </div>
         
         <div className="pt-20 px-4 pb-10">
         {loading ? (
             <div className="flex items-center justify-center h-64">
                 <i className="fa-solid fa-spinner fa-spin text-4xl text-blue-600"></i>
             </div>
         ) : (
            <>
               {/* Margin Breakdown */}
               <div className="mb-4">
                   <div className="grid grid-cols-3 gap-2 text-center">
                       <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-blue-100 dark:border-slate-800 shadow-sm">
                           <p className="text-[10px] uppercase font-bold text-slate-400">Today</p>
                           <p className={`text-sm font-bold ${calculateMargin('today') >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>₹{calculateMargin('today')}</p>
                       </div>
                       <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-purple-100 dark:border-slate-800 shadow-sm">
                           <p className="text-[10px] uppercase font-bold text-slate-400">Month</p>
                           <p className={`text-sm font-bold ${monthlyMargin >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>₹{monthlyMargin}</p>
                       </div>
                       <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-orange-100 dark:border-slate-800 shadow-sm">
                           <p className="text-[10px] uppercase font-bold text-slate-400">Year</p>
                           <p className={`text-sm font-bold ${yearlyMargin >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>₹{yearlyMargin}</p>
                       </div>
                   </div>
               </div>

               {/* Time Filters Compact */}
               {viewMode === 'transactions' && (
                   <div className="flex justify-center mb-4">
                       <div className="inline-flex bg-slate-200 dark:bg-slate-800 rounded-lg p-1">
                           {(['today', 'month', 'year', 'all'] as TimeFilter[]).map(f => (
                               <button key={f} onClick={() => setTimeFilter(f)} className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition ${timeFilter === f ? 'bg-white dark:bg-slate-700 shadow text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{f}</button>
                           ))}
                       </div>
                   </div>
               )}

               {/* Stats Overview for selected filter */}
               {viewMode === 'transactions' && (
               <div className="grid grid-cols-3 gap-2 mb-6">
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-xl shadow-sm border-l-4 border-green-500">
                     <p className="text-slate-500 text-[9px] uppercase font-bold">Rev</p>
                     <h3 className="text-lg font-bold text-slate-800 dark:text-white">₹{currentStats.revenue}</h3>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-xl shadow-sm border-l-4 border-red-500">
                     <p className="text-slate-500 text-[9px] uppercase font-bold">Loss</p>
                     <h3 className="text-lg font-bold text-red-600">₹{currentStats.loss}</h3>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-xl shadow-sm border-l-4 border-orange-500">
                     <p className="text-slate-500 text-[9px] uppercase font-bold">W/D</p>
                     <h3 className="text-lg font-bold text-slate-800 dark:text-white">₹{currentStats.withdraw}</h3>
                  </div>
               </div>
               )}

               {/* Tabs */}
               <div className="flex border-b border-slate-200 dark:border-slate-800 mb-4 overflow-x-auto no-scrollbar">
                  <button onClick={() => setViewMode('users')} className={`pb-2 px-4 font-bold text-xs whitespace-nowrap uppercase ${viewMode === 'users' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600' : 'text-slate-400'}`}>Users</button>
                  <button onClick={() => setViewMode('transactions')} className={`pb-2 px-4 font-bold text-xs whitespace-nowrap uppercase ${viewMode === 'transactions' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600' : 'text-slate-400'}`}>Transactions</button>
                  <button onClick={() => setViewMode('withdrawals')} className={`pb-2 px-4 font-bold text-xs whitespace-nowrap uppercase ${viewMode === 'withdrawals' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600' : 'text-slate-400'}`}>Withdrawals ({withdrawals.filter(w => w.status === 'pending').length})</button>
               </div>

               {/* View Content */}
               {viewMode === 'users' && (
                  <>
                    <div className="bg-white dark:bg-slate-900 p-3 rounded-xl shadow-sm mb-4 flex items-center gap-2 border border-slate-200 dark:border-slate-800">
                        <i className="fa-solid fa-magnifying-glass text-slate-400"></i>
                        <input placeholder="Search User..." className="flex-1 outline-none text-slate-700 dark:text-slate-300 font-medium text-sm bg-transparent" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                    <div className="space-y-3">
                        {filteredUsers.map((u, i) => (
                            <div key={i} className={`bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 flex items-center justify-between ${u.isBanned ? 'border-2 border-red-500 bg-red-50 dark:bg-red-900/10' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center font-medium text-slate-500 dark:text-slate-400 text-xs relative">
                                        {u.name[0]}
                                        {u.isBanned && <div className="absolute inset-0 bg-red-500/50 rounded-full flex items-center justify-center text-white"><i className="fa-solid fa-ban"></i></div>}
                                    </div>
                                    <div>
                                        <p className="font-medium text-slate-800 dark:text-white text-sm flex items-center gap-1">
                                            {u.username}
                                            {u.username === 'superadmin' && <i className="fa-solid fa-crown text-yellow-500 text-xs"></i>}
                                            {u.username === 'admin' && <i className="fa-solid fa-shield text-blue-500 text-xs"></i>}
                                        </p>
                                        <p className="text-[10px] text-slate-400">{u.email}</p>
                                    </div>
                                </div>
                                <div className="text-right flex flex-col items-end gap-1">
                                    <p className="font-bold text-blue-600 dark:text-blue-400 text-sm">₹{(u.wallet?.winning || 0) + (u.wallet?.added || 0)}</p>
                                    {isSuperAdmin && u.username !== 'superadmin' && (
                                        <div className="flex gap-2">
                                            <button onClick={() => openWalletModal(u)} className="w-6 h-6 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center hover:bg-blue-200 dark:hover:bg-blue-900/50" title="Manage Wallet"><i className="fa-solid fa-wallet text-[10px]"></i></button>
                                            <button onClick={() => setUserToBan({uid: u.uid, currentStatus: !!u.isBanned})} className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${u.isBanned ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'}`}>{u.isBanned ? 'Unban' : 'Ban'}</button>
                                            <button onClick={() => setUserToDelete(u.uid)} className="w-6 h-6 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center hover:bg-red-200 dark:hover:bg-red-900/50" title="Delete"><i className="fa-solid fa-trash text-[10px]"></i></button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                  </>
               )}

               {viewMode === 'transactions' && (
                   <div className="space-y-3">
                       {currentTx.map((tx, i) => {
                           let label = tx.type as string;
                           let colorClass = "";
                           let sign = "";

                           if (isSuperAdmin) {
                               if (tx.type === 'bonus') { label = "Distribution"; colorClass = "text-red-600"; sign = "-"; } 
                               else if (tx.type === 'game' && tx.category === 'winning') { label = "Deducted"; colorClass = "text-red-600"; sign = "-"; } 
                               else if (tx.type === 'add') { label = "Credited"; colorClass = "text-green-600"; sign = "+"; } 
                               else if (tx.type === 'withdraw') { label = "Payout"; colorClass = "text-red-600"; sign = "-"; } 
                               else { colorClass = "text-slate-500"; }
                           } else {
                               colorClass = (tx.type === 'add' || tx.type === 'bonus') ? 'text-green-600' : 'text-red-600';
                               sign = (tx.type === 'add' || tx.type === 'bonus') ? '+' : '-';
                           }

                           return (
                           <div key={i} className="bg-white dark:bg-slate-900 p-3 rounded-xl shadow-sm flex items-center justify-between border-l-4 border-slate-200 dark:border-slate-800" style={{borderColor: colorClass.includes('red') ? '#ef4444' : colorClass.includes('green') ? '#22c55e' : '#cbd5e1'}}>
                               <div>
                                   <p className="text-xs text-slate-400 font-mono mb-0.5">{formatDate(tx.date)}</p>
                                   <p className="font-medium text-slate-800 dark:text-white text-sm">{tx.username} <span className="text-slate-400 font-normal text-xs uppercase">({label})</span></p>
                                   <p className="text-[10px] text-slate-400 italic">{tx.details}</p>
                               </div>
                               <p className={`font-bold ${colorClass}`}>{sign}₹{tx.amount}</p>
                           </div>
                       )})}
                   </div>
               )}

               {viewMode === 'withdrawals' && (
                   <div className="space-y-3">
                       {withdrawals.length === 0 ? <p className="text-center text-slate-400 mt-10">No withdrawal requests.</p> :
                           withdrawals.map(w => (
                               <div key={w.id} className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800">
                                   <div className="flex justify-between items-start mb-2">
                                       <div>
                                           <p className="font-bold text-slate-800 dark:text-white">{w.username}</p>
                                           <p className="text-[10px] text-slate-400">{formatDate(w.date)}</p>
                                       </div>
                                       <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${w.status === 'pending' ? 'bg-orange-100 text-orange-600' : w.status === 'completed' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>{w.status}</span>
                                   </div>
                                   <div className="bg-slate-50 dark:bg-slate-800 p-2 rounded-lg mb-3 border border-slate-200 dark:border-slate-700">
                                       <div className="flex justify-between mb-1">
                                           <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Amount</span>
                                           <span className="text-sm font-bold text-slate-800 dark:text-white">₹{w.amount}</span>
                                       </div>
                                       <div className="text-xs text-slate-600 dark:text-slate-300 font-medium break-all">{w.details}</div>
                                   </div>
                                   {w.status === 'pending' && (
                                       <div className="flex gap-3">
                                           <button onClick={() => handleWithdrawAction(w, 'reject')} disabled={actionLoading} className="flex-1 py-2 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-900/30">Reject</button>
                                           <button onClick={() => handleWithdrawAction(w, 'approve')} disabled={actionLoading} className="flex-1 py-2 rounded-lg bg-green-600 text-white text-xs font-bold shadow-md hover:bg-green-700">Mark Paid</button>
                                       </div>
                                   )}
                               </div>
                           ))
                       }
                   </div>
               )}
            </>
         )}
         </div>

         {/* ... Modals (Wallet, Confirm) with dark mode updates ... */}
         {walletModalOpen && selectedUserForWallet && (
             <div className="fixed inset-0 z-[170] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                 <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-xs shadow-2xl border border-slate-200 dark:border-slate-700">
                     <h3 className="font-semibold text-slate-800 dark:text-white mb-4">Manage Wallet: {selectedUserForWallet.username}</h3>
                     <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg mb-4">
                         <button onClick={() => setWalletAction('add')} className={`flex-1 py-2 rounded-md text-xs font-medium transition ${walletAction === 'add' ? 'bg-white dark:bg-slate-700 text-green-600 dark:text-green-400 shadow' : 'text-slate-400'}`}>ADD</button>
                         <button onClick={() => setWalletAction('deduct')} className={`flex-1 py-2 rounded-md text-xs font-medium transition ${walletAction === 'deduct' ? 'bg-white dark:bg-slate-700 text-red-600 dark:text-red-400 shadow' : 'text-slate-400'}`}>DEDUCT</button>
                     </div>
                     <div className="mb-4">
                         <label className="text-[10px] font-medium text-slate-500 uppercase">Amount</label>
                         <input type="number" value={walletAmount} onChange={e => setWalletAmount(e.target.value)} className="w-full border-b-2 border-slate-200 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white py-2 font-medium text-lg outline-none focus:border-blue-500" placeholder="0" />
                     </div>
                     <div className="flex gap-2">
                         <button onClick={() => setWalletModalOpen(false)} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 font-medium text-slate-500 rounded-xl">Cancel</button>
                         <button onClick={handleWalletUpdate} disabled={actionLoading} className={`flex-1 py-3 font-medium text-white rounded-xl ${walletAction === 'add' ? 'bg-green-600' : 'bg-red-600'}`}>
                             {actionLoading ? 'Processing...' : (walletAction === 'add' ? 'Credit' : 'Debit')}
                         </button>
                     </div>
                 </div>
             </div>
         )}

         {userToDelete && (
            <ConfirmModal title="Delete User?" message="Permanent action." onConfirm={handleDeleteUser} onCancel={() => { if(!actionLoading) setUserToDelete(null); }} confirmText={actionLoading ? "Deleting..." : "Delete User"} isDangerous={true} />
         )}
         {userToBan && (
             <ConfirmModal title={userToBan.currentStatus ? "Unban User?" : "Ban User?"} message={userToBan.currentStatus ? "User will regain access." : "User will be logged out."} onConfirm={handleBanToggle} onCancel={() => { if(!actionLoading) setUserToBan(null); }} confirmText={actionLoading ? "Processing..." : (userToBan.currentStatus ? "Unban" : "Ban")} isDangerous={!userToBan.currentStatus} />
         )}
         {showResetConfirm && (
             <ConfirmModal title="FACTORY RESET?" message="This will delete ALL data. Cannot be undone." onConfirm={handleFactoryReset} onCancel={() => { if(!actionLoading) setShowResetConfirm(false); }} confirmText={actionLoading ? "Wiping..." : "YES, DELETE"} cancelText="Cancel" isDangerous={true} />
         )}
      </div>
   );
};

export default AdminScreen;
