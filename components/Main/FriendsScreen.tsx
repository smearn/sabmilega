
import React, { useEffect, useState, useRef } from "react";
import { get, ref, push, update, onValue, set } from "firebase/database";
import { db } from "../../firebase";
import { UserProfile } from "../../types";
import { PullToRefresh } from "../Shared/PullToRefresh";

interface ChatMessage {
    id: string;
    text?: string;
    senderId: string;
    time: number;
    type: 'text' | 'payment';
    amount?: number;
    paymentStatus?: 'sent' | 'refund';
}

interface MessageItemProps {
    msg: ChatMessage;
    user: UserProfile;
    onLongPress: (m: ChatMessage) => void;
}

const MessageItem: React.FC<MessageItemProps> = ({ msg, user, onLongPress }) => {
    const isMe = msg.senderId === user.uid;
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const startPress = () => {
        timerRef.current = setTimeout(() => {
            onLongPress(msg);
        }, 600); // 600ms for long press
    };

    const endPress = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    };

    return (
        <div 
             className={`flex mb-3 ${isMe ? 'justify-end' : 'justify-start'} animate-[fade-enter_0.2s]`}
             onTouchStart={startPress}
             onTouchEnd={endPress}
             onMouseDown={startPress}
             onMouseUp={endPress}
             onMouseLeave={endPress}
             onContextMenu={(e) => { e.preventDefault(); onLongPress(msg); }}
        >
            {msg.type === 'payment' ? (
                <div className={`relative p-0.5 rounded-2xl shadow-md ${isMe ? 'bg-gradient-to-br from-yellow-400 to-orange-500' : 'bg-white border border-slate-200'}`}>
                    <div className="bg-white rounded-xl p-3 min-w-[200px] flex flex-col items-center relative overflow-hidden">
                        {/* Decorative BG */}
                        <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-yellow-100 to-transparent rounded-bl-full opacity-50"></div>
                        
                        <div className="flex items-center gap-2 mb-2 w-full z-10">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs shadow-sm ${msg.paymentStatus === 'refund' ? 'bg-purple-500' : 'bg-green-500'}`}>
                                <i className={`fa-solid ${msg.paymentStatus === 'refund' ? 'fa-rotate-left' : 'fa-check'}`}></i>
                            </div>
                            <div className="flex-1">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                    {msg.paymentStatus === 'refund' ? 'Refund Issued' : (isMe ? 'Payment Sent' : 'Payment Received')}
                                </p>
                                <p className="text-xs font-bold text-slate-800">SM Pay</p>
                            </div>
                        </div>
                        
                        <div className="text-3xl font-bold text-slate-800 mb-1 z-10">
                            <span className="text-lg align-top">₹</span>{msg.amount}
                        </div>
                        
                        <div className="w-full h-[1px] bg-slate-100 my-2"></div>
                        
                        <div className="flex justify-between w-full text-[9px] text-slate-400 font-medium">
                            <span>{new Date(msg.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            <span className="text-green-600 flex items-center gap-1"><i className="fa-solid fa-circle-check"></i> Completed</span>
                        </div>
                    </div>
                </div>
            ) : (
                <div className={`${isMe ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-l-2xl rounded-tr-2xl' : 'bg-white text-slate-800 rounded-r-2xl rounded-tl-2xl border border-slate-100 shadow-sm'} px-4 py-2.5 max-w-[80%] text-sm shadow-md relative group`}>
                    {msg.text}
                    <span className={`text-[9px] block text-right mt-1 font-medium ${isMe ? 'text-blue-200' : 'text-slate-400'}`}>
                        {new Date(msg.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        {isMe && <i className="fa-solid fa-check-double ml-1"></i>}
                    </span>
                </div>
            )}
        </div>
    );
};

const FriendsScreen = ({ user }: { user: UserProfile }) => {
   const [friends, setFriends] = useState<UserProfile[]>([]);
   const [loading, setLoading] = useState(true);
   
   // Chat State
   const [selectedFriend, setSelectedFriend] = useState<UserProfile | null>(null);
   const [messageText, setMessageText] = useState("");
   const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
   const [showPayModal, setShowPayModal] = useState(false);
   const [payAmount, setPayAmount] = useState("");
   const [paymentProcessing, setPaymentProcessing] = useState(false);
   const messagesEndRef = useRef<HTMLDivElement>(null);

   // Add Friend State
   const [showAddFriend, setShowAddFriend] = useState(false);
   const [searchQuery, setSearchQuery] = useState("");
   const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
   const [suggestions, setSuggestions] = useState<UserProfile[]>([]);
   
   // Long Press State
   const [longPressMsg, setLongPressMsg] = useState<ChatMessage | null>(null);

   useEffect(() => {
       fetchFriends();
   }, [user.uid]);

   // Real-time Chat Listener
   useEffect(() => {
       if (selectedFriend) {
           const chatId = [user.uid, selectedFriend.uid].sort().join('_');
           const chatRef = ref(db, `chats/${chatId}/messages`);
           const unsub = onValue(chatRef, (snap) => {
               if (snap.exists()) {
                   const data = snap.val();
                   const list = Object.keys(data).map(k => ({...data[k], id: k})).sort((a,b) => a.time - b.time);
                   setChatMessages(list as ChatMessage[]);
               } else {
                   setChatMessages([]);
               }
               scrollToBottom();
           });
           return () => unsub();
       }
   }, [selectedFriend]);

   const scrollToBottom = () => {
       setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
   };

   const fetchFriends = async () => {
      setLoading(true);
      try {
         // Get friend IDs
         const friendsRef = ref(db, `users/${user.uid}/friends`);
         const fSnap = await get(friendsRef);
         
         if(fSnap.exists()) {
             const fIds = Object.keys(fSnap.val());
             const userRef = ref(db, 'users');
             const uSnap = await get(userRef);
             if(uSnap.exists()) {
                 const allUsers = uSnap.val();
                 const friendList = fIds.map(fid => allUsers[fid]).filter(Boolean);
                 setFriends(friendList);
             }
         } else {
             setFriends([]);
         }
      } catch (e) {
         console.error(e);
      } finally {
         setLoading(false);
      }
   };

   const openAddFriendModal = async () => {
       setShowAddFriend(true);
       setSearchQuery("");
       setSearchResults([]);
       // Fetch random suggestions (first 10 non-friends/non-superadmin)
       try {
           const snap = await get(ref(db, 'users'));
           if (snap.exists()) {
               const all = Object.values(snap.val()) as UserProfile[];
               const friendIds = new Set(friends.map(f => f.uid));
               const candidates = all.filter(u => 
                   u.uid !== user.uid && 
                   !friendIds.has(u.uid) && 
                   u.username !== 'superadmin' && 
                   u.username !== '@superadmin'
               );
               // Shuffle and pick 3
               const shuffled = candidates.sort(() => 0.5 - Math.random()).slice(0, 3);
               setSuggestions(shuffled);
           }
       } catch (e) { console.error(e); }
   };

   const handleSearchUser = async (val: string) => {
       const cleanVal = val.trim();
       setSearchQuery(val); // Update input with raw value for typing
       if(cleanVal.length < 2) {
           setSearchResults([]);
           return;
       }
       const snap = await get(ref(db, 'users'));
       if(snap.exists()) {
           const data = snap.val();
           const matches = Object.values(data).filter((u: any) => 
               u.uid !== user.uid && 
               u.username !== 'superadmin' && u.username !== '@superadmin' && // Exclude superadmin
               (u.username.toLowerCase().includes(cleanVal.toLowerCase()) || u.name.toLowerCase().includes(cleanVal.toLowerCase()))
           ) as UserProfile[];
           setSearchResults(matches);
       }
   };

   const handleAddFriend = async (friend: UserProfile) => {
       await update(ref(db, `users/${user.uid}/friends`), { [friend.uid]: true });
       await update(ref(db, `users/${friend.uid}/friends`), { [user.uid]: true });
       setFriends(prev => [...prev, friend]);
       setShowAddFriend(false);
       setSearchQuery("");
       setSelectedFriend(friend); // Open chat immediately
   };

   const handleSendMessage = async () => {
       const cleanMsg = messageText.trim();
       if (!cleanMsg || !selectedFriend) return;
       const chatId = [user.uid, selectedFriend.uid].sort().join('_');
       
       await push(ref(db, `chats/${chatId}/messages`), {
           text: cleanMsg,
           senderId: user.uid,
           time: Date.now(),
           type: 'text'
       });
       setMessageText("");
   };

   const handleTransfer = async () => {
       if(!payAmount || !selectedFriend) return;
       const amt = parseFloat(payAmount);
       if(isNaN(amt) || amt <= 0) {
           alert("Invalid Amount");
           return;
       }
       
       const isRefund = user.username === 'superadmin' || user.username === '@superadmin'; // Check if admin sending
       
       if(!isRefund && amt > user.wallet.winning) {
           alert("Insufficient Winning Balance for Transfer");
           return;
       }

       setPaymentProcessing(true);
       try {
           const chatId = [user.uid, selectedFriend.uid].sort().join('_');
           const timestamp = Date.now();

           // 1. Sender Debit (Winning Balance)
           let senderNewBalance = user.wallet.winning;
           if (!isRefund) {
               senderNewBalance = user.wallet.winning - amt;
               await update(ref(db, `users/${user.uid}/wallet`), { winning: senderNewBalance });
               
               // Calculate Sender Closing Balance (Total)
               const senderTotal = senderNewBalance + user.wallet.added;
               
               await push(ref(db, `transactions/${user.uid}`), { 
                   type: 'transfer_sent', 
                   amount: amt, 
                   date: timestamp, 
                   details: `Sent to ${selectedFriend.username}`, 
                   category: 'winning',
                   closingBalance: senderTotal
               });
           }

           // 2. Recipient Credit (ADDED BALANCE - Not Winning)
           // Prevents circular money laundering for withdrawal
           const recRef = ref(db, `users/${selectedFriend.uid}/wallet`);
           const recSnap = await get(recRef);
           const currentRecAdded = recSnap.exists() ? (recSnap.val().added || 0) : 0;
           const currentRecWinning = recSnap.exists() ? (recSnap.val().winning || 0) : 0;
           const recNewAdded = currentRecAdded + amt;
           
           await update(recRef, { added: recNewAdded });
           
           // Calculate Recipient Closing Balance (Total)
           const recTotal = recNewAdded + currentRecWinning;

           await push(ref(db, `transactions/${selectedFriend.uid}`), { 
               type: 'transfer_received', 
               amount: amt, 
               date: timestamp, 
               details: isRefund ? `Refund from ${user.username}` : `From ${user.username}`, 
               category: 'added', // Goes to Added
               closingBalance: recTotal
           });

           // 3. Chat Message
           await push(ref(db, `chats/${chatId}/messages`), {
               senderId: user.uid,
               time: timestamp,
               type: 'payment',
               amount: amt,
               paymentStatus: isRefund ? 'refund' : 'sent'
           });

           setPaymentProcessing(false);
           setShowPayModal(false);
           setPayAmount("");
       } catch(e) {
           console.error(e);
           setPaymentProcessing(false);
           alert("Transfer Failed");
       }
   };

   // Chat View
   if (selectedFriend) {
       return (
           <div className="fixed inset-0 z-[120] bg-[#efeae2] dark:bg-slate-950 flex flex-col animate-[slide-up_0.2s_ease-out]">
               {/* Header */}
               <div className="bg-white dark:bg-slate-900 px-4 py-2 flex items-center justify-between shadow-sm border-b border-slate-100 dark:border-slate-800 z-10">
                   <div className="flex items-center gap-3">
                       <button onClick={() => setSelectedFriend(null)} className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                           <i className="fa-solid fa-arrow-left"></i>
                       </button>
                       <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border border-slate-100">
                               <img src={selectedFriend.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedFriend.username}`} className="w-full h-full object-cover" />
                           </div>
                           <div>
                               <h3 className="font-bold text-slate-800 dark:text-white text-sm leading-tight flex items-center gap-1">
                                   {selectedFriend.name} 
                                   {(selectedFriend.username === 'admin' || selectedFriend.username === 'superadmin' || selectedFriend.username === '@admin' || selectedFriend.username === '@superadmin') && <i className="fa-solid fa-certificate text-blue-500 text-xs"></i>}
                               </h3>
                               <p className="text-[10px] text-slate-500 dark:text-slate-400">{selectedFriend.username}</p>
                           </div>
                       </div>
                   </div>
                   <button className="text-slate-400 hover:text-slate-600"><i className="fa-solid fa-ellipsis-vertical"></i></button>
               </div>

               {/* Chat Area */}
               <div className="flex-1 overflow-y-auto p-4 bg-[url('https://i.pinimg.com/originals/85/ec/df/85ecdf1c3611ecc9b7fa85282d9526e0.jpg')] bg-opacity-10 bg-repeat">
                   <div className="flex justify-center mb-4"><span className="bg-yellow-100 text-yellow-800 text-[10px] px-3 py-1 rounded-lg shadow-sm font-medium border border-yellow-200 flex items-center gap-1"><i className="fa-solid fa-lock"></i> End-to-end encrypted</span></div>
                   {chatMessages.map((msg) => (
                       <MessageItem 
                           key={msg.id} 
                           msg={msg} 
                           user={user} 
                           onLongPress={(m) => setLongPressMsg(m)} 
                       />
                   ))}
                   <div ref={messagesEndRef} />
               </div>

               {/* Input Area */}
               <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 pb-safe mb-0">
                   <button 
                       onClick={() => setShowPayModal(true)}
                       className="bg-slate-800 text-white w-10 h-10 rounded-full flex items-center justify-center hover:scale-105 transition shadow-lg shrink-0"
                   >
                       <i className="fa-solid fa-indian-rupee-sign text-sm"></i>
                   </button>
                   <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full px-4 py-2.5 flex items-center border border-transparent focus-within:border-blue-500 transition-colors">
                       <input 
                           value={messageText}
                           onChange={e => setMessageText(e.target.value)}
                           onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                           className="bg-transparent w-full outline-none text-sm text-slate-800 dark:text-white placeholder-slate-400 font-medium" 
                           placeholder="Message..." 
                       />
                   </div>
                   <button onClick={handleSendMessage} className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md transition shrink-0 ${messageText.trim() ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-200 text-slate-400'}`}>
                       <i className="fa-solid fa-paper-plane text-sm"></i>
                   </button>
               </div>

               {/* Payment Modal */}
               {showPayModal && (
                   <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowPayModal(false)}>
                       <div className="bg-white w-full sm:w-96 rounded-t-3xl sm:rounded-3xl p-6 animate-[slide-up_0.3s_ease-out] shadow-2xl" onClick={e => e.stopPropagation()}>
                           <div className="flex flex-col items-center mb-6">
                               <div className="w-16 h-16 rounded-full bg-slate-100 overflow-hidden mb-3 border-2 border-white shadow-lg">
                                   <img src={selectedFriend.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedFriend.username}`} className="w-full h-full object-cover" />
                               </div>
                               <h3 className="text-lg font-bold text-slate-800">Paying {selectedFriend.name}</h3>
                               <p className="text-xs text-slate-500 font-medium">{selectedFriend.username}</p>
                           </div>

                           <div className="flex justify-center items-center mb-8 relative">
                               <span className="text-3xl text-slate-400 mr-1 absolute left-[25%] font-light">₹</span>
                               <input 
                                   type="number" 
                                   autoFocus
                                   value={payAmount}
                                   onChange={e => setPayAmount(e.target.value)}
                                   placeholder="0"
                                   className="text-5xl font-bold text-slate-800 text-center w-full outline-none bg-transparent placeholder-slate-200"
                               />
                           </div>

                           <div className="bg-slate-50 p-3 rounded-xl mb-6 text-center border border-slate-100">
                               <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Paying From</p>
                               <div className="flex items-center justify-center gap-2">
                                   <i className="fa-solid fa-wallet text-orange-500"></i>
                                   <span className="text-sm font-bold text-slate-700">Winning Balance (₹{user.wallet.winning})</span>
                               </div>
                           </div>

                           <button 
                               onClick={handleTransfer}
                               disabled={paymentProcessing}
                               className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all"
                           >
                               {paymentProcessing ? <i className="fa-solid fa-spinner fa-spin"></i> : "Pay Securely"}
                           </button>
                       </div>
                   </div>
               )}

               {/* Info Box on Long Press */}
               {longPressMsg && (
                   <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setLongPressMsg(null)}>
                       <div className="bg-white rounded-xl p-4 w-64 shadow-2xl animate-[fade-enter_0.1s] transform scale-100" onClick={e => e.stopPropagation()}>
                           <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 border-b pb-2">Message Info</h4>
                           <div className="space-y-2">
                               <div className="flex justify-between text-sm">
                                   <span className="text-slate-600">Time</span>
                                   <span className="font-medium text-slate-900">{new Date(longPressMsg.time).toLocaleString()}</span>
                               </div>
                               <div className="flex justify-between text-sm">
                                   <span className="text-slate-600">Type</span>
                                   <span className="font-medium text-slate-900 capitalize">{longPressMsg.type}</span>
                               </div>
                               {longPressMsg.type === 'payment' && (
                                   <div className="flex justify-between text-sm">
                                       <span className="text-slate-600">Amount</span>
                                       <span className="font-bold text-green-600">₹{longPressMsg.amount}</span>
                                   </div>
                               )}
                           </div>
                           <button onClick={() => { navigator.clipboard.writeText(longPressMsg.text || (longPressMsg.amount?.toString() || '')); setLongPressMsg(null); }} className="w-full mt-4 bg-slate-100 text-slate-700 py-2 rounded-lg text-xs font-bold hover:bg-slate-200">
                               Copy Content
                           </button>
                       </div>
                   </div>
               )}
           </div>
       );
   }

   // Friends List View
   return (
      <div className="pt-20 px-0 h-full flex flex-col bg-white">
         <div className="px-4 pb-3 border-b border-slate-50 flex items-center justify-between">
             <h2 className="text-xl font-bold text-slate-800">Messages</h2>
             <button onClick={openAddFriendModal} className="w-8 h-8 bg-slate-900 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition"><i className="fa-solid fa-user-plus text-xs"></i></button>
         </div>

         <div className="flex-1 overflow-y-auto px-4 pt-2 pb-24">
             <PullToRefresh onRefresh={fetchFriends}>
                 {loading ? (
                     <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>
                 ) : friends.length === 0 ? (
                     <div className="text-center py-20 text-slate-400">
                         <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                             <i className="fa-regular fa-comments text-3xl opacity-50"></i>
                         </div>
                         <p className="font-bold text-slate-600">No chats yet</p>
                         <p className="text-xs text-slate-400 mt-1">Add friends to start chatting!</p>
                         <button onClick={openAddFriendModal} className="mt-4 px-6 py-2 bg-blue-600 text-white text-xs font-bold rounded-full shadow-lg">Find People</button>
                     </div>
                 ) : (
                     <div className="space-y-1">
                         {friends.map(f => (
                             <div key={f.uid} onClick={() => setSelectedFriend(f)} className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition-all border border-transparent hover:border-slate-100 active:scale-[0.98]">
                                 <div className="relative">
                                     <img src={f.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.username}`} className="w-12 h-12 rounded-full bg-slate-200 object-cover" />
                                     <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                                 </div>
                                 <div className="flex-1 min-w-0">
                                     <h4 className="font-bold text-slate-800 text-sm truncate flex items-center gap-1">
                                         {f.name}
                                         {(f.username === 'admin' || f.username === '@admin') && <i className="fa-solid fa-certificate text-blue-500 text-[10px]"></i>}
                                     </h4>
                                     <p className="text-xs text-slate-500 truncate">Tap to chat</p>
                                 </div>
                                 <i className="fa-solid fa-chevron-right text-slate-300 text-xs"></i>
                             </div>
                         ))}
                     </div>
                 )}
             </PullToRefresh>
         </div>

         {/* Add Friend Modal */}
         {showAddFriend && (
             <div className="fixed inset-0 z-[60] bg-slate-50 flex flex-col animate-[slide-up_0.2s]">
                 <div className="bg-white p-4 shadow-sm flex items-center gap-3">
                     <button onClick={() => setShowAddFriend(false)}><i className="fa-solid fa-arrow-left text-slate-600"></i></button>
                     <div className="flex-1 bg-slate-100 rounded-full px-4 py-2 flex items-center">
                         <i className="fa-solid fa-magnifying-glass text-slate-400 mr-2"></i>
                         <input autoFocus placeholder="Search username..." className="bg-transparent w-full outline-none text-sm font-medium" value={searchQuery} onChange={e => handleSearchUser(e.target.value)} />
                     </div>
                 </div>
                 <div className="flex-1 overflow-y-auto p-4">
                     {/* Search Results */}
                     {searchResults.length > 0 && searchResults.map(u => (
                         <div key={u.uid} className="flex items-center justify-between p-3 bg-white rounded-xl shadow-sm mb-2 border border-slate-100">
                             <div className="flex items-center gap-3">
                                 <img src={u.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`} className="w-10 h-10 rounded-full bg-slate-200" />
                                 <div>
                                     <p className="font-bold text-sm text-slate-800 flex items-center gap-1">
                                         {u.username}
                                         {(u.username === 'admin' || u.username === '@admin') && <i className="fa-solid fa-certificate text-blue-500 text-[10px]"></i>}
                                     </p>
                                     <p className="text-[10px] text-slate-500">{u.name}</p>
                                 </div>
                             </div>
                             <button onClick={() => handleAddFriend(u)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:bg-blue-700">Add</button>
                         </div>
                     ))}

                     {/* Suggestions (Only if no search results) */}
                     {searchQuery === "" && suggestions.length > 0 && (
                         <div>
                             <p className="text-xs font-bold text-slate-400 uppercase mb-3 ml-1">Suggested People</p>
                             {suggestions.map(u => (
                                 <div key={u.uid} className="flex items-center justify-between p-3 bg-white rounded-xl shadow-sm mb-2 border border-slate-100">
                                     <div className="flex items-center gap-3">
                                         <img src={u.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`} className="w-10 h-10 rounded-full bg-slate-200" />
                                         <div>
                                             <p className="font-bold text-sm text-slate-800 flex items-center gap-1">
                                                 {u.username}
                                                 {(u.username === 'admin' || u.username === '@admin') && <i className="fa-solid fa-certificate text-blue-500 text-[10px]"></i>}
                                             </p>
                                             <p className="text-[10px] text-slate-500">{u.name}</p>
                                         </div>
                                     </div>
                                     <button onClick={() => handleAddFriend(u)} className="bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-200">Add</button>
                                 </div>
                             ))}
                         </div>
                     )}

                     {searchQuery && searchResults.length === 0 && <p className="text-center text-slate-400 text-xs mt-10">No users found</p>}
                 </div>
             </div>
         )}
      </div>
   );
};

export default FriendsScreen;
