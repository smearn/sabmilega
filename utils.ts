import { get, ref, update, increment } from "firebase/database";
import { db } from "./firebase";

export const generateReferralCode = (username: string) => {
  const base = username.replace('@', '').substring(0, 4);
  const random = Math.floor(1000 + Math.random() * 9000);
  return (base + random).toUpperCase();
};

export const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleDateString() + ' ' + new Date(timestamp).toLocaleTimeString();
};

export const getGameStats = (gameName: string, mode: string, entryFee: number, customMaxPlayers?: number) => {
    let maxPlayers = 0;

    if (gameName === 'BR RANKED') {
        // Use custom size if provided (for variable BR rooms), else default to 48
        maxPlayers = customMaxPlayers && customMaxPlayers > 0 ? customMaxPlayers : 48;
    } else {
        // CS or Lone Wolf
        // Solo = 1v1 (2), Duo = 2v2 (4), Squad = 4v4 (8)
        let playersPerTeam = 1;
        if (mode === 'DUO') playersPerTeam = 2;
        if (mode === 'SQUAD') playersPerTeam = 4;
        maxPlayers = playersPerTeam * 2;
    }

    const totalPool = entryFee * maxPlayers;

    return { maxPlayers, totalPool };
};

export const calculateTimeLeft = (targetTime: number) => {
    const difference = targetTime - Date.now();
    let timeLeft = {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        expired: false
    };

    if (difference > 0) {
        timeLeft = {
            days: Math.floor(difference / (1000 * 60 * 60 * 24)),
            hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
            minutes: Math.floor((difference / 1000 / 60) % 60),
            seconds: Math.floor((difference / 1000) % 60),
            expired: false
        };
    } else {
        timeLeft.expired = true;
    }

    return timeLeft;
};

// Financial Logic for Super Admin (System Wallet)
export const updateSystemWallet = async (amount: number, reason: string) => {
    try {
        const usersRef = ref(db, 'users');
        const snapshot = await get(usersRef);
        
        if (snapshot.exists()) {
            const users = snapshot.val();
            let superAdminId = null;
            
            // Find Super Admin
            for (const [uid, user] of Object.entries(users)) {
                // @ts-ignore
                if (user.username === 'superadmin' || user.username === '@superadmin') {
                    superAdminId = uid;
                    break;
                }
            }

            if (superAdminId) {
                // Update Super Admin Wallet
                // If amount is positive (Profit for system), add to 'added'.
                // If amount is negative (Loss for system), deduct from 'added'.
                // We mainly track System Funds in 'added' wallet for simplicity.
                await update(ref(db, `users/${superAdminId}/wallet`), {
                    added: increment(amount)
                });
                
                // Optional: Log transaction for Super Admin
                // await push(ref(db, `transactions/${superAdminId}`), {
                //     type: amount > 0 ? 'game' : 'withdraw',
                //     amount: Math.abs(amount),
                //     date: Date.now(),
                //     details: `System: ${reason}`,
                //     category: 'added'
                // });
            }
        }
    } catch (e) {
        console.error("Failed to update system wallet", e);
    }
};