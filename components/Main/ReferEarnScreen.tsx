
import React, { useState, useEffect } from "react";
import { UserProfile, ToastType } from "../../types";
import { PullToRefresh } from "../Shared/PullToRefresh";
import { get, ref, query, orderByChild, equalTo, update, push, increment } from "firebase/database";
import { db } from "../../firebase";
import { updateSystemWallet } from "../../utils";

const ReferEarnScreen = ({ user, showToast }: { user: UserProfile, showToast: (m: string, t: ToastType) => void }) => {
   const [redeemCode, setRedeemCode] = useState("");
   const [redeeming, setRedeeming] = useState(false);
   const [errorMsg, setErrorMsg] = useState<string | null>(null);
   const [localRedeemed, setLocalRedeemed] = useState(user.redeemedCode || "");
   const [topReferrers, setTopReferrers] = useState<{n: string, c: number, r: number}[]>([]);
   const [loadingStats, setLoadingStats] = useState(true);

   useEffect(() => {
       fetchLeaderboard();
   }, []);

   const fetchLeaderboard = async () => {
       setLoadingStats(true);
       try {
           const usersRef = ref(db, 'users');
           const snap = await get(usersRef);
           
           if(snap.exists()) {
               const allUsers = Object.values(snap.val()) as UserProfile[];
               const referralCounts: Record<string, number> = {};
               const userMap: Record<string, string> = {};

               // Map UIDs to usernames and count referrals
               allUsers.forEach(u => {
                   userMap[u.uid] = u.username;
                   if(u.referredBy) {
                       referralCounts[u.referredBy] = (referralCounts[u.referredBy] || 0) + 1;
                   }
               });

               // Create Leaderboard Array
               const leaderboard = Object.keys(referralCounts).map(uid => ({
                   n: userMap[uid] || "Unknown",
                   c: referralCounts[uid],
                   r: 0 // placeholder
               }));

               // Sort and top 20
               leaderboard.sort((a, b) => b.c - a.c);
               
               // Assign ranks
               const ranked = leaderboard.slice(0, 20).map((item, index) => ({
                   ...item,
                   r: index + 1
               }));

               setTopReferrers(ranked);
           }
       } catch(e) {
           console.error(e);
       } finally {
           setLoadingStats(false);
       }
   };

   const copyCode = () => {
      navigator.clipboard.writeText(user.referralCode);
      showToast("Code copied to clipboard!", "success");
   };

   const handleShare = async () => {
       if (navigator.share) {
           try {
               await navigator.share({
                   title: 'Join SM EARN!',
                   text: `Use my referral code ${user.referralCode} to get a bonus on SM EARN!`,
                   url: window.location.href
               });
           } catch (err) {
               console.log("Share failed", err);
           }
       } else {
           copyCode();
       }
   };

   const handleRedeem = async () => {
       setErrorMsg(null);
       const code = redeemCode.trim().toUpperCase();

       if (!code) {
           setErrorMsg("Please enter a code");
           return;
       }
       if (code === user.referralCode) {
           setErrorMsg("You cannot use your own referral code.");
           return;
       }
       
       setRedeeming(true);
       try {
           // 1. Find the owner of the code
           const usersRef = ref(db, 'users');
           const q = query(usersRef, orderByChild('referralCode'), equalTo(code));
           const snap = await get(q);

           if (!snap.exists()) {
               throw new Error("Invalid Referral Code");
           }

           // Get Referrer Info
           const referrerData = Object.values(snap.val())[0] as UserProfile;
           const referrerId = referrerData.uid;

           if (referrerId === user.uid) {
               throw new Error("You cannot use your own referral code.");
           }

           // 2. Process Transactions
           const bonusAmount = 5;

           // Deduct from System
           await updateSystemWallet(-(bonusAmount * 2), "Post-Signup Referral");

           // Update Referrer (The person who owns the code)
           await update(ref(db, `users/${referrerId}/wallet`), { added: increment(bonusAmount) });
           await push(ref(db, `transactions/${referrerId}`), {
               type: 'bonus', amount: bonusAmount, date: Date.now(), details: 'Referral Bonus', category: 'added', closingBalance: (referrerData.wallet.added || 0) + bonusAmount + (referrerData.wallet.winning || 0)
           });

           // Update Current User (The one applying the code)
           await update(ref(db, `users/${user.uid}/wallet`), { added: increment(bonusAmount) });
           await push(ref(db, `transactions/${user.uid}`), {
               type: 'bonus', amount: bonusAmount, date: Date.now(), details: `Referral Applied (${code})`, category: 'added', closingBalance: (user.wallet.added || 0) + bonusAmount + (user.wallet.winning || 0)
           });

           // 3. Link Users
           await update(ref(db, `users/${user.uid}`), { 
               referredBy: referrerId,
               redeemedCode: code
           });

           setLocalRedeemed(code);
           showToast("Referral Code Applied! Bonus Added.", "success");
           setRedeemCode("");
           fetchLeaderboard(); // Refresh stats

       } catch (e: any) {
           setErrorMsg(e.message || "Failed to redeem code");
       } finally {
           setRedeeming(false);
       }
   };

   return (
      <div className="pt-20 px-4 pb-24 h-full flex flex-col">
         <PullToRefresh onRefresh={fetchLeaderboard}>
         <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl mb-6 relative overflow-hidden">
            <div className="absolute top-4 right-4 z-20">
                <button onClick={handleShare} className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition">
                    <i className="fa-solid fa-share-nodes"></i>
                </button>
            </div>
            
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/20 rounded-full blur-2xl"></div>
            <div className="text-center relative z-10">
               <h2 className="text-2xl font-bold mb-2">Refer & Earn ₹5</h2>
               <p className="text-indigo-100 text-sm mb-6">Invite friends to SM EARN and get instant bonus!</p>
               
               <div className="bg-white/20 backdrop-blur-md rounded-xl p-3 flex items-center justify-between border border-white/30">
                  <span className="font-mono font-bold text-lg tracking-widest pl-2">{user.referralCode || "LOADING..."}</span>
                  <button onClick={copyCode} className="bg-white text-indigo-600 px-4 py-2 rounded-lg font-bold text-xs shadow-sm hover:bg-indigo-50">COPY</button>
               </div>
            </div>
         </div>

         <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-6">
             <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><i className="fa-solid fa-user-plus text-orange-500"></i> Enter Referral Code</h3>
             
             {localRedeemed ? (
                 <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center justify-between">
                     <div className="flex items-center gap-2">
                         <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                             <i className="fa-solid fa-check"></i>
                         </div>
                         <div>
                             <p className="text-xs font-bold text-green-800">Code Applied</p>
                             <p className="text-[10px] text-green-600 font-mono tracking-wider">{localRedeemed}</p>
                         </div>
                     </div>
                 </div>
             ) : (
                 <div className="flex flex-col gap-2">
                     <div className="flex gap-2">
                         <input 
                            value={redeemCode}
                            onChange={e => { setRedeemCode(e.target.value.toUpperCase()); setErrorMsg(null); }}
                            placeholder="Enter friend's code"
                            className={`flex-1 bg-slate-50 border ${errorMsg ? 'border-red-300 bg-red-50' : 'border-slate-200'} rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-blue-500 uppercase transition-colors`}
                         />
                         <button onClick={handleRedeem} disabled={redeeming} className="bg-slate-900 text-white px-5 rounded-xl font-bold text-xs shadow-lg hover:bg-slate-800 disabled:opacity-70">
                             {redeeming ? <i className="fa-solid fa-spinner fa-spin"></i> : "APPLY"}
                         </button>
                     </div>
                     {errorMsg && (
                         <div className="bg-red-100 border border-red-200 text-red-600 text-[10px] px-3 py-2 rounded-lg font-bold flex items-center gap-2 animate-[fade-enter_0.2s]">
                             <i className="fa-solid fa-circle-exclamation"></i>
                             {errorMsg}
                         </div>
                     )}
                 </div>
             )}
         </div>

         <div className="flex-1 bg-white rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.05)] p-6">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
               <i className="fa-solid fa-trophy text-yellow-500"></i> Top Referrers
            </h3>
            <div className="space-y-4">
               {loadingStats ? (
                   <p className="text-center text-slate-400 text-xs">Loading leaderboard...</p>
               ) : topReferrers.length === 0 ? (
                   <p className="text-center text-slate-400 text-xs">No referrals yet. Be the first!</p>
               ) : (
                   topReferrers.map((p) => (
                      <div key={p.r} className="flex items-center justify-between">
                         <div className="flex items-center gap-4">
                            <span className={`w-6 text-center font-bold ${p.r===1?'text-yellow-500 text-xl':p.r===2?'text-slate-400 text-lg':p.r===3?'text-orange-700 text-lg':'text-slate-300'}`}>#{p.r}</span>
                            <div className="flex items-center gap-3">
                               <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-500 text-xs">{p.n.substring(0,2).toUpperCase()}</div>
                               <p className="font-bold text-slate-800 text-sm">{p.n}</p>
                            </div>
                         </div>
                         <span className="text-green-600 font-bold text-sm">{p.c} Refs</span>
                      </div>
                   ))
               )}
            </div>
         </div>
         </PullToRefresh>
      </div>
   );
};

export default ReferEarnScreen;
