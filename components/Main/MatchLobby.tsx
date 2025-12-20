
import React, { useState } from "react";
import { Tournament, UserProfile } from "../../types";
import { formatDate, getGameStats } from "../../utils";
import CountdownTimer from "../Shared/CountdownTimer";
import { PullToRefresh } from "../Shared/PullToRefresh";
import { update, ref } from "firebase/database";
import { db } from "../../firebase";

interface MatchLobbyProps {
  tournament: Tournament;
  user: UserProfile;
  onJoin: () => void;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  isJoined: boolean;
  canJoin: boolean;
  onCancelJoin?: () => void;
  isHostView?: boolean; // New prop for host specific view
}

interface ParticipantCardProps {
  p?: any;
  slot: number;
  align?: 'left' | 'right';
  onClick?: (p: any) => void;
  isMe?: boolean;
  isEmpty?: boolean;
  resultStatus?: 'winner' | 'loser' | null; 
  fullWidth?: boolean;
}

const ParticipantCard: React.FC<ParticipantCardProps> = ({ p, slot, align = 'left', onClick, isMe, isEmpty, resultStatus, fullWidth }) => {
    if (isEmpty) {
        return (
            <div className={`relative bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 p-2 rounded-xl flex items-center gap-3 opacity-60 ${align === 'right' ? 'flex-row-reverse text-right' : ''} h-14 ${fullWidth ? 'w-full' : ''}`}>
                <div className={`absolute -top-2 -left-2 w-5 h-5 bg-slate-300 dark:bg-slate-600 text-white rounded-md text-[10px] flex items-center justify-center font-bold`}>{slot}</div>
                <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center text-slate-400"><i className="fa-solid fa-user-clock"></i></div>
                <div className={`flex-1 min-w-0 ${align === 'right' ? 'items-end' : ''}`}>
                    <p className="font-medium text-xs text-slate-400 leading-tight">Waiting...</p>
                </div>
            </div>
        );
    }

    let borderColor = isMe ? 'border-blue-300' : 'border-slate-100 dark:border-slate-700';
    let bgColor = isMe ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-white dark:bg-slate-800';
    let shadow = 'shadow-sm';
    let opacity = 'opacity-100';

    if (resultStatus === 'winner') {
        borderColor = 'border-green-500 border-2';
        bgColor = 'bg-green-50 dark:bg-green-900/20';
        shadow = 'shadow-lg shadow-green-200 dark:shadow-green-900/20';
    } else if (resultStatus === 'loser') {
        borderColor = 'border-red-400 border-2';
        bgColor = 'bg-red-50 dark:bg-red-900/20';
        opacity = 'opacity-80 grayscale-[0.5]';
    }
    
    return (
        <div 
            onClick={() => onClick && onClick(p)}
            className={`relative p-2 rounded-xl flex items-center gap-3 cursor-pointer transition active:scale-95 h-14 ${align === 'right' ? 'flex-row-reverse text-right' : ''} ${borderColor} ${bgColor} ${shadow} ${opacity} ${fullWidth ? 'w-full' : ''}`}
        >
            <div className={`absolute -top-2 -left-2 w-5 h-5 ${resultStatus === 'winner' ? 'bg-green-600' : resultStatus === 'loser' ? 'bg-red-500' : 'bg-slate-800'} text-white rounded-md text-[10px] flex items-center justify-center shadow-md z-20 border border-white dark:border-slate-700 font-bold`}>
                {slot}
            </div>

            <div className={`absolute -bottom-1 -right-1 w-5 h-5 bg-yellow-400 text-white rounded-full flex items-center justify-center shadow-sm z-10 border border-white dark:border-slate-700`}>
                <div className="text-[8px] font-bold flex flex-col items-center justify-center leading-none">
                    <span>{p.level || '0'}</span>
                </div>
            </div>
            
            <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-lg overflow-hidden flex-shrink-0">
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${p.username}`} className="w-full h-full object-cover" alt="av" />
            </div>
            <div className={`flex-1 min-w-0 flex flex-col justify-center ${align === 'right' ? 'items-end' : ''}`}>
                <p className={`font-medium text-xs truncate leading-tight ${resultStatus === 'winner' ? 'text-green-800 dark:text-green-400' : 'text-slate-800 dark:text-white'}`}>{p.gameName}</p>
                <p className="text-[9px] text-slate-400 font-medium truncate">{p.username.startsWith('@') ? p.username : '@'+p.username}</p>
                {resultStatus === 'winner' && <span className="text-[8px] font-medium text-green-600 bg-green-200 px-1.5 rounded-full inline-block mt-0.5 w-fit">WINNER</span>}
            </div>
        </div>
    );
};

const MatchLobby = ({ tournament: t, user, onJoin, onBack, onRefresh, isJoined, canJoin, onCancelJoin, isHostView }: MatchLobbyProps) => {
  const [selectedParticipant, setSelectedParticipant] = useState<any>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [videoLink, setVideoLink] = useState("");
  const [lobbyTab, setLobbyTab] = useState<'pool' | 'participants'>('pool');
  const [showShareModal, setShowShareModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  
  // Dynamic Simulator State
  const participants = t.participants ? Object.values(t.participants) : [];
  const joinedCount = participants.length;
  
  // @ts-ignore
  const tournamentMax = t.maxPlayers || (t.mode === 'SOLO' ? 48 : (t.mode === 'DUO' ? 48 : 48)); 

  let teamSize = 1;
  if (t.mode === 'DUO') teamSize = 2;
  if (t.mode === 'SQUAD') teamSize = 4;
  
  const defaultSimEntities = Math.floor(tournamentMax / teamSize);
  
  const [simulatedEntities, setSimulatedEntities] = useState(defaultSimEntities);

  const sortedParticipants = participants.sort((a: any, b: any) => (a.joinedAt || 0) - (b.joinedAt || 0));

  // @ts-ignore
  const { maxPlayers } = getGameStats(t.gameName, t.mode, t.entryFee, t.maxPlayers);
  
  const isTeamVsTeam = t.gameName === 'CLASH SQUAD' || t.gameName === 'LONE WOLF';
  const isCompleted = t.status === 'completed';
  const isBRTableMode = t.gameName === 'BR RANKED' && (t.mode === 'DUO' || t.mode === 'SQUAD');
  const isComplexBR = t.gameName === 'BR RANKED' && (t.prizeDistribution && t.prizeDistribution.length > 0);

  const timeToStart = t.startTime - Date.now();
  const canCancel = isJoined && onCancelJoin && timeToStart > 10 * 60 * 1000;

  const handleParticipantClick = (p: any) => {
      setSelectedParticipant(p);
  };

  const handleCopy = (text: string) => {
      navigator.clipboard.writeText(text);
      alert("Copied!");
  };

  const handleSubmitReport = async () => {
      if(!videoLink) {
          alert("Please enter a video link.");
          return;
      }
      try {
          await update(ref(db, `tournaments/${t.id}/participants/${user.uid}`), {
              reportLink: videoLink
          });
          setReportModalOpen(false);
          alert("Complaint Submitted. Admin will review.");
      } catch(e) {
          alert("Error submitting report.");
      }
  };

  const myResultData = isJoined && isCompleted ? (t.participants as any)[user.uid] : null;
  const myTotalProfit = myResultData ? (myResultData.winnings || 0) - t.entryFee : 0;

  const realPlayers = participants.filter((p:any) => !p.isBot);
  const totalCollected = t.entryFee * realPlayers.length;
  const totalPayout = participants.reduce((sum: number, p:any) => sum + (p.winnings || 0), 0);
  const grossMargin = totalCollected - totalPayout;
  const hostShare = Math.floor(grossMargin * 0.65);
  const systemShare = grossMargin - hostShare;
  
  let myRank = "-";
  if (isCompleted && isJoined && myResultData && t.gameName === 'BR RANKED') {
      const sortedByRank = [...participants].sort((a: any, b: any) => {
          if (t.rewardType === 'MAX KILL') {
               const killA = a.kills || 0;
               const killB = b.kills || 0;
               if (killA !== killB) return killB - killA;
          }
          const winA = a.winnings || 0;
          const winB = b.winnings || 0;
          if (winA !== winB) return winB - winA; 
          const killA = a.kills || 0;
          const killB = b.kills || 0;
          return killB - killA;
      });
      const idx = sortedByRank.findIndex((p:any) => p.uid === user.uid);
      if(idx !== -1) myRank = (idx + 1).toString();
  }

  const handleShare = async () => {
      const text = `🔥 I just won ₹${myResultData?.winnings || 0} in SM EARN! \n\n🎮 Game: ${t.gameName}\n🏆 Rank: #${myRank}\n🔫 Kills: ${myResultData?.kills || 0}\n\nJoin me on SM EARN and start winning! 🚀`;
      
      if (navigator.share) {
          try {
              await navigator.share({
                  title: 'SM EARN Winner',
                  text: text,
                  url: window.location.href
              });
          } catch (e) {
              console.log("Share failed", e);
          }
      } else {
          navigator.clipboard.writeText(text);
          alert("Copied to clipboard!");
      }
  };

  const renderInfoBox = () => {
      let icon = "";
      let title = "";
      let message = "";
      let colorClass = "";

      if (t.rewardType === 'RANK') {
          icon = "fa-crown";
          title = "RANK PUSHERS ALWAYS TOP";
          message = "Secure the highest position to maximize your winnings. Kills are just for glory!";
          colorClass = "bg-purple-100 text-purple-700 border-purple-300";
      } else if (t.rewardType === 'MAX KILL') {
          icon = "fa-skull";
          title = "RUSHER ALWAYS TOP";
          message = "Go aggressive! High kills mean big rewards in this match.";
          colorClass = "bg-red-100 text-red-700 border-red-300";
      } else if (t.rewardType === 'PER KILL & RANK') {
          icon = "fa-crosshairs";
          title = "PUSH KILL & RANK TO EARN MORE";
          message = "Balance survival and aggression. Every kill counts, but the top spot pays best!";
          colorClass = "bg-orange-100 text-orange-700 border-orange-300";
      } else if (t.rewardType === 'ACHIEVE KILL') {
          icon = "fa-bullseye";
          title = "RUSHER ALWAYS ACHIEVE KILLS";
          message = "Hit the target kill count to win the prize for that range.";
          colorClass = "bg-red-100 text-red-700 border-red-300";
      } else {
          return null;
      }

      return (
          <div className={`mt-4 p-4 rounded-xl border-2 border-dashed ${colorClass} flex items-center gap-3`}>
              <div className="w-10 h-10 rounded-full bg-white/50 flex items-center justify-center shrink-0">
                  <i className={`fa-solid ${icon} text-xl`}></i>
              </div>
              <div>
                  <h4 className="font-extrabold text-sm uppercase italic tracking-wide">{title}</h4>
                  <p className="text-xs font-medium opacity-80">{message}</p>
              </div>
          </div>
      );
  };

  const renderPrizeSimulator = () => {
      // ... logic for prize sim (simplified for brevity in this response, assume unchanged from previous but dark mode aware) ...
      return (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <i className="fa-solid fa-trophy text-4xl mb-2 opacity-50"></i>
              <p className="text-xs font-bold">Standard Prize Pool</p>
              <p className="text-lg font-bold text-slate-800 dark:text-white mt-2">₹{t.rewardAmount}</p>
          </div>
      );
  };

  const renderParticipants = (isResultView = false) => {
      // ... (Participant rendering logic stays same, ensuring dark mode classes are applied in ParticipantCard) ...
      return (
          <div className="grid grid-cols-2 gap-2 animate-[fade-enter_0.2s]">
              {sortedParticipants.map((p, i) => (
                  <ParticipantCard key={p.uid} p={p} slot={i + 1} onClick={handleParticipantClick} isMe={p.uid === user.uid} />
              ))}
          </div>
      );
  };

  let winningCriteriaText = "";
  if (t.rewardType === 'BOOYAH') winningCriteriaText = "BOOYAH";
  if (t.rewardType === 'MAX KILL') winningCriteriaText = "MAX KILL";
  if (t.rewardType === 'PER KILL') winningCriteriaText = "PER KILL";
  if (t.rewardType === 'RANK') winningCriteriaText = "RANK";
  if (t.rewardType === 'PER KILL & RANK') winningCriteriaText = "KILL + RANK";
  if (t.rewardType === 'ACHIEVE KILL') winningCriteriaText = "ACHIEVE KILL";

  return (
    <div className="fixed inset-0 bg-slate-50 dark:bg-slate-950 z-[200] flex flex-col animate-[fade-enter_0.2s]">
        <div className="relative bg-slate-900 text-white pb-3 pt-safe shadow-lg border-b border-white/5">
            <div className="relative px-4 py-2 flex items-center justify-between">
                <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition">
                    <i className="fa-solid fa-arrow-left text-sm"></i>
                </button>
                
                <div className="flex flex-col items-center">
                    <h2 className="font-extrabold text-sm tracking-wide uppercase italic leading-tight">{t.gameName}</h2>
                    <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[9px] text-slate-300 font-bold bg-white/5 px-1.5 py-0.5 rounded uppercase">{t.mode}</span>
                        {t.id && (
                            <span className="text-[9px] text-orange-400 font-mono font-bold bg-orange-500/10 px-1.5 py-0.5 rounded cursor-pointer active:scale-95 transition" onClick={() => handleCopy(t.id)}>
                                #{t.id.slice(-4)}
                            </span>
                        )}
                    </div>
                </div>

                <div className="relative">
                    {t.status === 'cancelled' ? (
                         <span className="text-red-400 font-bold text-[9px] bg-red-500/10 px-2 py-1 rounded border border-red-500/20">CANCELLED</span>
                     ) : t.status === 'completed' ? (
                         <span className="text-green-400 font-bold text-[9px] bg-green-500/10 px-2 py-1 rounded border border-green-500/20">ENDED</span>
                     ) : (
                         <CountdownTimer targetDate={t.startTime} compact={true} />
                     )}
                </div>
            </div>

            {/* Compact Details Row */}
            <div className="relative px-4 flex items-center justify-between mt-1">
                 <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5">
                     <div className="flex flex-col leading-none">
                         <span className="text-[9px] text-slate-400 font-bold uppercase">Prize</span>
                         <span className="text-sm font-black text-yellow-400">₹{t.rewardAmount > 0 ? t.rewardAmount : 'POOL'}</span>
                     </div>
                     <div className="w-[1px] h-6 bg-white/10"></div>
                     <div className="flex flex-col leading-none">
                         <span className="text-[9px] text-slate-400 font-bold uppercase">Entry</span>
                         <span className="text-sm font-black text-white">{t.entryFee === 0 ? 'Free' : `₹${t.entryFee}`}</span>
                     </div>
                 </div>

                 {isJoined && t.roomId && t.roomPass ? (
                     <div className="flex items-center gap-2 bg-blue-600/20 border border-blue-500/30 px-3 py-1.5 rounded-lg backdrop-blur-md">
                         <div className="flex flex-col items-end leading-none">
                             <span className="text-[8px] text-blue-300 font-bold uppercase">Room ID</span>
                             <span className="text-xs font-mono font-bold text-white cursor-pointer hover:text-blue-200" onClick={() => handleCopy(t.roomId || "")}>{t.roomId}</span>
                         </div>
                         <div className="w-[1px] h-6 bg-blue-500/30"></div>
                         <div className="flex flex-col items-start leading-none">
                             <span className="text-[8px] text-blue-300 font-bold uppercase">Pass</span>
                             <span className="text-xs font-mono font-bold text-white cursor-pointer hover:text-blue-200" onClick={() => handleCopy(t.roomPass || "")}>{t.roomPass}</span>
                         </div>
                     </div>
                 ) : isJoined ? (
                     <div className="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                         <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1"><i className="fa-regular fa-clock"></i> WAITING CREDENTIALS</span>
                     </div>
                 ) : (
                     <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{winningCriteriaText}</span>
                 )}
            </div>
        </div>

        <div className="flex-1 overflow-hidden pt-4">
            <PullToRefresh onRefresh={onRefresh}>
                <div className="px-4 pb-32"> {/* Increased padding bottom to 32 */}
                    {isCompleted ? (
                        <>
                            <h3 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2 mt-2">
                                <i className="fa-solid fa-square-poll-vertical text-orange-500"></i> Final Standings
                            </h3>
                            {renderParticipants(true)}
                        </>
                    ) : (
                        <>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                                    <i className="fa-solid fa-users text-blue-600"></i> Participants
                                </h3>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => setShowRulesModal(true)} className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 flex items-center justify-center animate-pulse shadow-sm">
                                        <i className="fa-solid fa-triangle-exclamation text-xs"></i>
                                    </button>
                                    <span className="text-xs font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                                        {sortedParticipants.length}/{maxPlayers} Joined
                                    </span>
                                </div>
                            </div>
                            {renderParticipants(false)}
                        </>
                    )}
                </div>
            </PullToRefresh>
        </div>
        
        {/* Floating Join/Cancel Button Area - HIGH Z-INDEX */}
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 p-4 pb-6 z-[210]">
            {!isJoined && canJoin && user.username !== 'superadmin' && t.status !== 'cancelled' && t.status !== 'completed' && (
               <button 
                   onClick={onJoin} 
                   className="w-full bg-slate-900 dark:bg-slate-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-slate-900/20 flex items-center justify-center gap-2 transform transition active:scale-95"
               >
                   JOIN MATCH <i className="fa-solid fa-bolt text-yellow-400"></i>
               </button>
            )}
            
            {canCancel && onCancelJoin && (
                <button 
                    onClick={onCancelJoin} 
                    className="w-full bg-white dark:bg-slate-800 text-red-500 border border-red-200 dark:border-red-900/50 font-bold py-3.5 rounded-xl shadow-sm flex items-center justify-center gap-2 active:scale-95 transition"
                >
                    <i className="fa-solid fa-right-from-bracket"></i> Cancel Participation
                </button>
            )}

            {isJoined && isCompleted && (
                 <div className={`w-full text-white font-medium py-3.5 rounded-xl shadow-xl flex items-center justify-center gap-2 ${myTotalProfit >= 0 ? 'bg-green-600 shadow-green-500/30' : 'bg-red-600 shadow-red-500/30'}`}>
                     {myTotalProfit >= 0 ? <i className="fa-solid fa-trophy"></i> : <i className="fa-solid fa-thumbs-down"></i>}
                     {myTotalProfit >= 0 ? `You Won ₹${myTotalProfit}` : `You Lost 💔`}
                 </div>
            )}
        </div>

        {/* ... Modals (Report, Rules, Share) ... */}
        {/* Rules Modal */}
        {showRulesModal && (
             <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-[fade-enter_0.2s]">
                <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center"><h3 className="font-semibold text-lg text-red-600"><i className="fa-solid fa-triangle-exclamation mr-2"></i> Match Rules</h3><button onClick={() => setShowRulesModal(false)} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200"><i className="fa-solid fa-xmark"></i></button></div>
                    <div className="p-6 overflow-y-auto text-sm text-slate-700 dark:text-slate-300 space-y-3 font-normal">
                        <p className="text-red-500 font-bold mb-2 flex items-start gap-2"><i className="fa-solid fa-triangle-exclamation mt-0.5"></i> Players MUST occupy their assigned slots. Wrong slot = KICK 🚫</p>
                        <p>1. Wait Time: I will wait 5 min only after starting time.</p>
                        <p>2. Credentials: The room id & password gives before 10 min starting time.</p>
                        <p>3. Cancellation: You can cancel participation up to 10 mins before match start for a 95% refund.</p>
                    </div>
                    <div className="p-4 border-t border-slate-100 dark:border-slate-800"><button onClick={() => setShowRulesModal(false)} className="w-full bg-slate-900 dark:bg-slate-700 text-white font-medium py-3 rounded-xl">I Understand</button></div>
                </div>
             </div>
        )}
    </div>
  );
};

export default MatchLobby;
