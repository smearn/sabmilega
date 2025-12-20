
export type Screen = 'splash' | 'login' | 'register' | 'main';
export type Tab = 'home' | 'friends' | 'wallet' | 'refer'; // Trade removed
export type ToastType = 'success' | 'error' | 'info';

export interface Transaction {
  id: string;
  type: 'add' | 'withdraw' | 'game' | 'bonus' | 'transfer_sent' | 'transfer_received' | 'p2p_sell' | 'p2p_buy' | 'coin_buy' | 'coin_sell' | 'game_hosting';
  amount: number;
  date: number;
  details?: string;
  category: 'winning' | 'added' | 'coins';
  closingBalance?: number; 
}

export interface WithdrawRequest {
    id: string;
    uid: string;
    username: string;
    amount: number;
    method: 'upi' | 'bank';
    details: string; // UPI ID or Bank String
    status: 'pending' | 'completed' | 'rejected';
    date: number;
}

export interface P2PTrade {
    id: string;
    sellerUid: string;
    sellerName: string;
    amount: number; // Amount being sold
    upiId: string;
    status: 'open' | 'processing' | 'completed' | 'cancelled';
    buyerUid?: string;
    buyerName?: string;
    createdAt: number;
}

export interface UserProfile {
  uid: string;
  name: string;
  username: string;
  email: string;
  phoneNumber: string;
  profilePic?: string;
  socialLink?: string;
  totalKills?: number;
  language?: string; // Added Language Preference
  wallet: {
    added: number;
    winning: number;
    smCoins?: number; // Coin Balance
  };
  gameDetails?: {
      gameName: string;
      gameUid: string;
      level: number;
  };
  referralCode: string;
  referredBy?: string; // UID of referrer
  redeemedCode?: string; // Actual Code string used
  joinedAt: number;
  isBanned?: boolean;
  friends?: Record<string, boolean>;
}

export interface PrizeDistribution {
    from: number;
    to: number;
    percentage: number;
}

export interface Tournament {
  id: string;
  gameApp: string;
  gameName: 'BR RANKED' | 'CLASH SQUAD' | 'LONE WOLF';
  mode: 'SOLO' | 'DUO' | 'SQUAD';
  map?: string; 
  playWith: 'RANDOMLY' | 'FRIENDS';
  ammo?: 'LIMITED' | 'ULTIMATE'; 
  rewardType: 'BOOYAH' | 'PER KILL' | 'MAX KILL' | 'RANK' | 'PER KILL & RANK' | 'ACHIEVE KILL';
  entryFee: number;
  rewardAmount: number;
  
  margin?: number;
  prizeDistribution?: PrizeDistribution[]; 
  isSpecial?: boolean; // New field for Special Tournaments
  isPrivate?: boolean; // New field for Private Matches
  privatePass?: string; // Password for Private Matches
  maxPlayers?: number;

  startTime: number;
  createdBy: string;
  creatorName: string;
  createdAt: number;
  status: 'open' | 'upcoming' | 'live' | 'completed' | 'cancelled';
  roomId?: string;
  roomPass?: string;
  participants?: Record<string, {
      uid: string;
      username: string;
      gameName: string;
      gameUid: string;
      joinedAt: number;
      level: number;
      kills?: number;
      rank?: number; // Added rank field for result declaration
      winnings?: number;
      isWinner?: boolean;
      status?: 'played' | 'not_joined' | 'kicked';
      reportLink?: string;
  }>;
  resultSnapshot?: { range: string, amount: number }[];
}
