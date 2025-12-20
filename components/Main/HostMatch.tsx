
import React, { useState, useEffect } from "react";
import { push, ref, update, get, query, orderByChild, equalTo } from "firebase/database";
import { db } from "../../firebase";
import { ToastType, UserProfile, Tournament, PrizeDistribution } from "../../types";

const CompactInput = ({ 
    label, value, onChange, type = "text", placeholder, validator, errorText, min, max, icon, disabled = false 
}: any) => {
    const isValid = validator ? validator(value) : true;
    const isEmpty = value === "";
    let borderClass = "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:border-blue-500 dark:focus:border-blue-500";
    let iconClass = "text-slate-400 dark:text-slate-500";
    
    if (!isEmpty && !disabled) {
        if (isValid) {
            borderClass = "border-green-500 bg-green-50/50 dark:bg-green-900/20 text-green-700 dark:text-green-400";
            iconClass = "text-green-500";
        } else {
            borderClass = "border-red-500 bg-red-50/50 dark:bg-red-900/20 text-red-700 dark:text-red-400";
            iconClass = "text-red-500";
        }
    }

    return (
        <div className="w-full">
            <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase mb-1 ml-1">{label}</label>
            <div className="relative">
                {icon && <i className={`fa-solid ${icon} absolute left-3 top-3 text-xs ${iconClass} transition-colors`}></i>}
                <input 
                    type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} min={min} max={max} disabled={disabled}
                    className={`w-full text-slate-900 dark:text-white text-xs font-medium rounded-xl py-2.5 pl-9 pr-2 border-2 outline-none transition-all duration-200 ${borderClass} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
            </div>
            {!isEmpty && !isValid && errorText && <p className="text-[9px] text-red-500 font-medium mt-1 ml-1">{errorText}</p>}
        </div>
    );
};

const SelectDropdown = ({ label, value, onChange, options, disabled }: any) => (
    <div className="w-full">
        <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase mb-1 ml-1">{label}</label>
        <div className="relative">
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className="w-full appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-white text-xs font-bold rounded-xl px-3 py-2.5 outline-none focus:border-blue-500 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-800 transition-all shadow-sm"
            >
                {options.map((opt: any) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
            <div className="absolute right-3 top-3 pointer-events-none text-slate-400">
                <i className="fa-solid fa-caret-down text-xs"></i>
            </div>
        </div>
    </div>
);

// Preset Logic
const DISTRIBUTION_PRESETS = [
    { 
        name: "High Winners", 
        data: [
            {from: 1, to: 1, percentage: 15}, 
            {from: 2, to: 3, percentage: 15}, 
            {from: 4, to: 10, percentage: 30}, 
            {from: 11, to: 20, percentage: 40}
        ] 
    },
    { 
        name: "Balanced", 
        data: [
            {from: 1, to: 1, percentage: 25}, 
            {from: 2, to: 5, percentage: 30}, 
            {from: 6, to: 10, percentage: 45}
        ] 
    },
    { 
        name: "Top 3 Only", 
        data: [
            {from: 1, to: 1, percentage: 50}, 
            {from: 2, to: 2, percentage: 30}, 
            {from: 3, to: 3, percentage: 20}
        ] 
    },
];

type RankPreset = 'TOP_1' | 'TOP_2' | 'TOP_3' | 'TOP_10_PERCENT';

const HostMatch = ({ user, showToast, isEditing, initialData, onCancelEdit }: { user: UserProfile, showToast: (m: string, t: ToastType) => void, isEditing?: boolean, initialData?: Tournament | null, onCancelEdit?: () => void }) => {
  const [selectedGameApp, setSelectedGameApp] = useState("FREE FIRE");
  const [matchType, setMatchType] = useState<any>("BR RANKED");
  const [mode, setMode] = useState<any>("SOLO");
  const [map, setMap] = useState<any>("BERMUDA");
  const [playWith, setPlayWith] = useState<any>("RANDOMLY");
  const [ammo, setAmmo] = useState<'LIMITED' | 'ULTIMATE'>("LIMITED");
  const [entryFee, setEntryFee] = useState("");
  const [rewardType, setRewardType] = useState<any>("MAX KILL");
  const [rewardAmount, setRewardAmount] = useState(""); 
  const [startTime, setStartTime] = useState("");
  
  // Custom Room Size for BR
  const [roomSize, setRoomSize] = useState(48);

  // Private Room Logic
  const [isPrivate, setIsPrivate] = useState(false);
  const [privatePass, setPrivatePass] = useState("");

  // Advanced BR Logic
  const isAdmin = user.username === 'admin' || user.username === 'superadmin' || user.username === '@admin' || user.username === '@superadmin';
  const minMargin = isAdmin ? 0 : 10;
  
  const [margin, setMargin] = useState(isAdmin ? "0" : "10"); 
  const [isSpecial, setIsSpecial] = useState(false);
  
  // Main State
  const [prizeDistribution, setPrizeDistribution] = useState<PrizeDistribution[]>(DISTRIBUTION_PRESETS[0].data);
  const [rankPreset, setRankPreset] = useState<RankPreset>('TOP_3');

  // Temporary State for Modal
  const [tempDistribution, setTempDistribution] = useState<PrizeDistribution[]>([]);

  // Simulation State
  const [simulatedEntities, setSimulatedEntities] = useState(48); 
  const [showDistributionModal, setShowDistributionModal] = useState(false);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
      if (isEditing && initialData) {
          setSelectedGameApp(initialData.gameApp);
          setMatchType(initialData.gameName);
          setMode(initialData.mode);
          setPlayWith(initialData.playWith);
          setAmmo(initialData.ammo || "LIMITED");
          setEntryFee(initialData.entryFee.toString());
          setRewardType(initialData.rewardType);
          setRewardAmount(initialData.rewardAmount.toString());
          if (initialData.map) setMap(initialData.map);
          // @ts-ignore
          if (initialData.maxPlayers) setRoomSize(initialData.maxPlayers);
          if (initialData.margin !== undefined) setMargin(initialData.margin.toString());
          if (initialData.isSpecial !== undefined) setIsSpecial(initialData.isSpecial);
          
          if(initialData.isPrivate) {
              setIsPrivate(true);
              setPrivatePass(initialData.privatePass || "");
          }

          if(initialData.prizeDistribution) setPrizeDistribution(initialData.prizeDistribution);

          const d = new Date(initialData.startTime);
          const offset = d.getTimezoneOffset() * 60000;
          const localISOTime = (new Date(d.getTime() - offset)).toISOString().slice(0, 16);
          setStartTime(localISOTime);
      }
  }, [isEditing, initialData]);

  const isBR = matchType === "BR RANKED";
  const isLoneWolf = matchType === "LONE WOLF";
  const isCS = matchType === "CLASH SQUAD";
  const showAmmoOption = isCS || isLoneWolf;

  // --- Reset/Default Logic ---

  useEffect(() => { if (isLoneWolf && mode === 'SQUAD') setMode('SOLO'); }, [matchType]);
  
  useEffect(() => {
      if (isBR) {
          if (rewardType === 'BOOYAH') {
              setRewardType('MAX KILL');
          }
          if (mode !== 'SOLO' && rewardType === 'ACHIEVE KILL') {
              setRewardType('MAX KILL');
          }

          let teamSize = 1;
          if (mode === 'DUO') teamSize = 2;
          if (mode === 'SQUAD') teamSize = 4;
          
          setSimulatedEntities(Math.floor(roomSize / teamSize));

      } else {
          if (rewardType !== 'BOOYAH') {
              setRewardType('BOOYAH');
          }
      }
  }, [mode, matchType, roomSize, rewardType]);

  useEffect(() => {
      let step = 1;
      if (mode === 'DUO') step = 2;
      if (mode === 'SQUAD') step = 4;
      
      if (roomSize % step !== 0) {
          setRoomSize(Math.floor(roomSize / step) * step);
      }

      const maxEntities = Math.floor(roomSize / step);
      if (simulatedEntities > maxEntities) {
          setSimulatedEntities(maxEntities);
      }
  }, [mode, isBR, roomSize]);

  const generateSafeKillDistribution = (size: number): PrizeDistribution[] => {
      const t1 = Math.ceil(size * 0.30); 
      let t2 = Math.ceil(size * 0.20);
      let t3 = Math.ceil(size * 0.12);
      
      if (t3 < 2) t3 = 2;

      if (t2 >= t1) t2 = t1 - 1;
      if (t3 >= t2) t3 = t2 - 1;
      if (t3 < 2) t3 = 2; 

      const ranges: PrizeDistribution[] = [];
      const maxPossibleKills = size - 1;
      
      ranges.push({ from: t1, to: maxPossibleKills, percentage: 40 }); 

      if (t2 < t1 && t2 > 0) {
          ranges.push({ from: t2, to: t1 - 1, percentage: 35 });
      }

      if (t3 < t2 && t3 > 0) {
          ranges.push({ from: t3, to: t2 - 1, percentage: 25 });
      }
      
      return ranges;
  };

  useEffect(() => {
      if (rewardType === 'PER KILL & RANK') {
          let newData: PrizeDistribution[] = [];
          if (rankPreset === 'TOP_1') newData = [{ from: 1, to: 1, percentage: 100 }];
          else if (rankPreset === 'TOP_2') newData = [{ from: 1, to: 1, percentage: 60 }, { from: 2, to: 2, percentage: 40 }];
          else if (rankPreset === 'TOP_3') newData = [{ from: 1, to: 1, percentage: 50 }, { from: 2, to: 2, percentage: 30 }, { from: 3, to: 3, percentage: 20 }];
          else if (rankPreset === 'TOP_10_PERCENT') newData = [{ from: 1, to: 1, percentage: 30 }, { from: 2, to: 3, percentage: 30 }, { from: 4, to: 5, percentage: 40 }];
          setPrizeDistribution(newData);
      } else if (rewardType === 'ACHIEVE KILL') {
          setPrizeDistribution(generateSafeKillDistribution(roomSize));
      }
  }, [rewardType, rankPreset, roomSize]);

  const handleRewardTypeChange = (type: any) => {
      setRewardType(type);
      if (type !== 'ACHIEVE KILL' && rewardType === 'ACHIEVE KILL') {
          setPrizeDistribution(DISTRIBUTION_PRESETS[0].data);
      }
  };

  const fee = parseInt(entryFee) || 0;
  const marginPercent = margin === "" ? 10 : parseInt(margin); 
  
  let teamSize = 1;
  if (mode === 'DUO') teamSize = 2;
  if (mode === 'SQUAD') teamSize = 4;
  
  const maxPossibleTeams = Math.floor(roomSize / teamSize);
  const maxConfigurableRank = Math.max(1, Math.floor(maxPossibleTeams / 2));

  const getClampedAndNormalizedData = (data: PrizeDistribution[]) => {
      if (rewardType === 'ACHIEVE KILL') return data; 

      let clamped: PrizeDistribution[] = [];
      for(const row of data) {
          if (row.from > maxConfigurableRank) continue;
          const newTo = Math.min(row.to, maxConfigurableRank);
          if (row.from > newTo) continue;
          clamped.push({ ...row, to: newTo });
      }
      
      if(clamped.length === 0) clamped.push({from: 1, to: 1, percentage: 100});
      else {
          const currentSum = clamped.reduce((s, r) => s + r.percentage, 0);
          if (currentSum !== 100 && currentSum > 0) {
              const multiplier = 100 / currentSum;
              let runningSum = 0;
              clamped = clamped.map((row, idx) => {
                  if (idx === clamped.length - 1) return { ...row, percentage: 100 - runningSum };
                  const newPct = Math.round(row.percentage * multiplier);
                  runningSum += newPct;
                  return { ...row, percentage: newPct };
              });
          }
      }
      return clamped;
  };

  useEffect(() => {
      if (rewardType === 'RANK' || rewardType === 'MAX KILL' || rewardType === 'PER KILL & RANK') {
          const corrected = getClampedAndNormalizedData(prizeDistribution);
          if (JSON.stringify(corrected) !== JSON.stringify(prizeDistribution)) {
              setPrizeDistribution(corrected);
          }
      }
  }, [roomSize, maxConfigurableRank, rewardType]);


  const validateFee = (val: string) => !isNaN(parseFloat(val)) && parseFloat(val) >= (isAdmin ? 0 : 1);
  const validateTime = (val: string) => val ? new Date(val).getTime() >= (Date.now() + 10 * 60 * 1000) : false;
  const validateMargin = (val: string) => {
      const n = parseInt(val);
      return !isNaN(n) && n >= minMargin && n <= 30;
  }

  const totalPlayersSimulated = simulatedEntities * teamSize; 
  const totalCollection = totalPlayersSimulated * fee; 
  const isSponsored = fee === 0 && isAdmin;
  
  let hostProfit = 0;
  let distributablePool = 0;
  let killReserve = 0;

  if (isSponsored) {
      const sponsorPool = parseInt(rewardAmount) || 0;
      distributablePool = sponsorPool;
  } else {
      let calculatedMargin = totalCollection * (marginPercent / 100);
      if (!isAdmin && calculatedMargin > 500) calculatedMargin = 500;
      hostProfit = Math.floor(calculatedMargin);
      
      if (rewardType === 'PER KILL & RANK') {
          const perKill = parseInt(rewardAmount) || 0; 
          killReserve = totalPlayersSimulated * perKill;
      }
      
      distributablePool = Math.floor(totalCollection - hostProfit - killReserve);
  }
  
  const activeDistribution = showDistributionModal ? tempDistribution : prizeDistribution;
  const currentTotalPercent = activeDistribution.reduce((sum, item) => sum + item.percentage, 0);

  const validateDistribution = (dist: PrizeDistribution[]) => {
      const totalPct = dist.reduce((sum, item) => sum + item.percentage, 0);
      
      if (distributablePool < 0) return "Entry Fee too low! Cannot cover Margin + Per Kill rewards.";

      if (rewardType === 'ACHIEVE KILL') {
          if (totalPct > 100) return "Total allocation cannot exceed 100% to ensure safety.";
          
          const minSafe = Math.ceil(roomSize * 0.12);
          const hasUnsafeRange = dist.some(d => d.from < 2); 
          if (hasUnsafeRange) return `Min kills must be ≥ 2.`;
          
          const maxKillLimit = roomSize - 1;
          const exceedsLimit = dist.some(d => d.to > maxKillLimit || d.from > maxKillLimit);
          if (exceedsLimit) return `Kills cannot exceed ${maxKillLimit} (Room Size - 1)`;

      } else {
          if (totalPct !== 100) return "Total allocation must be exactly 100%.";
          let prevPrize = Number.MAX_VALUE;
          for (let i = 0; i < dist.length; i++) {
              const row = dist[i];
              const count = (row.to - row.from) + 1;
              const totalForRange = Math.floor(distributablePool * (row.percentage / 100));
              const perEntity = count > 0 ? Math.floor(totalForRange / count) : 0;
              if (perEntity > prevPrize) return `Rank ${row.from}-${row.to} prize is higher than previous rank.`;
              prevPrize = perEntity;
          }
      }
      return null;
  };

  const distError = validateDistribution(activeDistribution);
  
  const getNormalizedDistribution = (joinedEntities: number, pool: number) => {
      if (pool <= 0) return [];

      if (rewardType === 'ACHIEVE KILL') {
          return prizeDistribution.map(row => {
              const normalizedPercent = row.percentage;
              const totalForRange = Math.floor(pool * (normalizedPercent / 100));
              return { ...row, perEntity: totalForRange, normalizedPercent }; 
          });
      }

      let configuredMaxRank = 1;
      if (prizeDistribution.length > 0) {
          configuredMaxRank = prizeDistribution[prizeDistribution.length - 1].to;
      }
      
      const effectiveMaxRank = Math.min(configuredMaxRank, maxConfigurableRank);
      
      let actualWinnersCount = 1;
      if (joinedEntities < 10) {
          actualWinnersCount = Math.ceil(joinedEntities * 0.5);
      } else {
          const coverageRatio = effectiveMaxRank / maxPossibleTeams;
          actualWinnersCount = Math.max(1, Math.floor(joinedEntities * coverageRatio));
      }

      const validRows = [];
      for (const row of prizeDistribution) {
          if (row.from > actualWinnersCount) continue;
          const originalCount = (row.to - row.from) + 1;
          const clampedTo = Math.min(row.to, actualWinnersCount);
          const newCount = (clampedTo - row.from) + 1;
          if (newCount <= 0) continue;
          const scaledPercentage = row.percentage * (newCount / originalCount);
          validRows.push({ ...row, to: clampedTo, percentage: scaledPercentage });
      }

      if (validRows.length === 0) return [];

      const totalActivePercent = validRows.reduce((sum, r) => sum + r.percentage, 0);
      const multiplier = totalActivePercent > 0 ? (100 / totalActivePercent) : 0;

      return validRows.map(row => {
          const count = (row.to - row.from) + 1;
          const normalizedPercent = row.percentage * multiplier;
          const totalForRange = Math.floor(pool * (normalizedPercent / 100));
          const perEntity = count > 0 ? Math.floor(totalForRange / count) : 0;
          return { ...row, perEntity, normalizedPercent };
      });
  };

  const handleOpenModal = () => {
      const clamped = getClampedAndNormalizedData(prizeDistribution);
      setTempDistribution(clamped);
      setShowDistributionModal(true);
  };

  const handleApplyPreset = (data: any) => {
      const clamped = getClampedAndNormalizedData(data);
      setTempDistribution(clamped);
  };

  const handleSaveModal = () => {
      setPrizeDistribution(tempDistribution);
      setShowDistributionModal(false);
  };

  const addDistributionRow = () => {
      const last = tempDistribution[tempDistribution.length - 1];
      if (rewardType !== 'ACHIEVE KILL' && last.to >= maxConfigurableRank) return; 
      
      const newArr = [...tempDistribution];
      if (rewardType === 'ACHIEVE KILL') {
          const prevStart = last.from;
          const newTo = prevStart - 1;
          const newFrom = Math.max(2, newTo - 2); 
          if (newTo < 2) return; 
          newArr.push({ from: newFrom, to: newTo, percentage: 0 });
      } else {
          newArr.push({ from: last.to + 1, to: last.to + 1, percentage: 0 });
      }
      setTempDistribution(newArr);
  };

  const updateDistributionRow = (index: number, field: keyof PrizeDistribution, val: number) => {
      const newArr = [...tempDistribution];
      if (rewardType === 'ACHIEVE KILL') {
          if ((field === 'to' || field === 'from') && val > (roomSize - 1)) val = roomSize - 1;
          newArr[index] = { ...newArr[index], [field]: val };
      } else {
          if (field === 'to') {
              if (val > maxConfigurableRank) val = maxConfigurableRank;
              if (val < newArr[index].from) val = newArr[index].from;
              if (index < newArr.length - 1) {
                  if (val >= newArr[index + 1].to) return; 
                  newArr[index + 1].from = val + 1;
              }
          }
          newArr[index] = { ...newArr[index], [field]: val };
      }
      
      if (field === 'percentage') {
          if (val < 0) val = 0;
          if (val > 100) val = 100;
          newArr[index].percentage = val;
      }
      setTempDistribution(newArr);
  };

  const removeDistributionRow = (index: number) => {
      if(tempDistribution.length > 1) {
          const newArr = tempDistribution.filter((_, i) => i !== index);
          setTempDistribution(newArr);
      }
  };

  const getRewardValidationError = () => {
      const amount = parseInt(rewardAmount) || 0;
      const entryFeeVal = parseInt(entryFee) || 0;

      if (isSponsored) {
          if (amount <= 0) return "Sponsor Pool must be > 0";
          return null;
      }
      
      if (rewardType === 'BOOYAH') { 
          if (amount <= 0) return "Winning Prize must be > 0"; 
      }
      else if (rewardType === 'PER KILL') { if (amount <= 0) return "Per Kill Prize must be > 0"; }
      else if (rewardType === 'RANK' || rewardType === 'MAX KILL' || rewardType === 'ACHIEVE KILL') {
          const distErr = validateDistribution(prizeDistribution);
          if (distErr) return distErr;
      }
      else if (rewardType === 'PER KILL & RANK') {
          if (amount <= 0) return "Per Kill Prize must be > 0";
          const distErr = validateDistribution(prizeDistribution);
          if (distErr) return distErr;
      }

      if (!isBR) {
          if (amount <= entryFeeVal) {
              return "Winning Prize must be greater than Entry Fee.";
          }
      }

      return null;
  };

  const isFormValid = () => {
      if (!entryFee || !startTime) return false;
      if (!validateTime(startTime) && !isEditing) return false;
      if (isAdmin && !validateMargin(margin)) return false;
      if (isPrivate && !privatePass) return false;
      if (isSponsored && (!rewardAmount || parseInt(rewardAmount) <= 0)) return false;
      if (['RANK', 'PER KILL & RANK', 'MAX KILL', 'ACHIEVE KILL'].includes(rewardType)) {
           if (validateDistribution(prizeDistribution)) return false;
      } 
      if (!['RANK', 'MAX KILL', 'ACHIEVE KILL'].includes(rewardType) && !rewardAmount) return false;
      if (getRewardValidationError()) return false;
      return true;
  };

  const handleCreate = async () => {
    const rewardError = getRewardValidationError();
    if (rewardError) return showToast(rewardError, "error");
    if (!isFormValid()) return showToast("Please fix errors before launching", "error");

    setLoading(true);
    try {
      if (!isAdmin && !isEditing) {
          const q = query(ref(db, 'tournaments'), orderByChild('createdBy'), equalTo(user.uid));
          const snap = await get(q);
          if (snap.exists()) {
              const myTourneys = Object.values(snap.val()) as Tournament[];
              const activeBR = myTourneys.filter(t => t.gameName === 'BR RANKED' && t.status !== 'completed' && t.status !== 'cancelled');
              const activeOther = myTourneys.filter(t => (t.gameName === 'CLASH SQUAD' || t.gameName === 'LONE WOLF') && t.status !== 'completed' && t.status !== 'cancelled');
              if (isBR && activeBR.length >= 1) throw new Error("Limit Reached: You already have an active BR match. Finish it first.");
              if (!isBR && activeOther.length >= 1) throw new Error("Limit Reached: You already have an active CS/Lone Wolf match. Finish it first.");
          }
      }

      const newStartTimeMs = new Date(startTime).getTime();
      const tournamentData: any = {
        gameApp: selectedGameApp,
        gameName: matchType,
        mode,
        playWith,
        map,
        ammo: showAmmoOption ? ammo : 'LIMITED', 
        entryFee: parseInt(entryFee),
        rewardType,
        rewardAmount: parseInt(rewardAmount || '0'), 
        startTime: newStartTimeMs,
        createdBy: user.uid,
        creatorName: user.username,
        createdAt: isEditing && initialData ? initialData.createdAt : Date.now(),
        status: isEditing && initialData ? initialData.status : 'upcoming',
        margin: parseInt(margin),
        maxPlayers: isBR ? roomSize : (mode === 'SOLO' ? 2 : (mode === 'DUO' ? 4 : 8)),
        isSpecial: isAdmin ? isSpecial : false,
        isPrivate: isPrivate,
        privatePass: isPrivate ? privatePass : null
      };

      if (fee > 0 && ['RANK', 'MAX KILL', 'ACHIEVE KILL'].includes(rewardType)) tournamentData.rewardAmount = 0; 
      if (['RANK', 'PER KILL & RANK', 'MAX KILL', 'ACHIEVE KILL'].includes(rewardType)) tournamentData.prizeDistribution = prizeDistribution;

      if (isEditing && initialData) {
          await update(ref(db, `tournaments/${initialData.id}`), tournamentData);
          showToast("Updated Successfully!", "success");
          if(onCancelEdit) onCancelEdit();
      } else {
          await push(ref(db, 'tournaments'), tournamentData);
          showToast("Hosted Successfully!", "success");
          setEntryFee(""); setRewardAmount(""); setStartTime("");
      }
    } catch (e: any) {
      showToast(e.message || "Failed to create", "error");
    } finally {
      setLoading(false);
    }
  };

  const minDateTime = (new Date(Date.now() - (new Date().getTimezoneOffset() * 60000) + 10 * 60 * 1000)).toISOString().slice(0, 16);
  const isValid = isFormValid();
  
  let availableRewardTypes = isBR ? ['PER KILL', 'MAX KILL', 'RANK', 'PER KILL & RANK'] : ['BOOYAH'];
  if (isBR && mode === 'SOLO') {
      availableRewardTypes = ['ACHIEVE KILL', ...availableRewardTypes];
  }

  const simDistribution = getNormalizedDistribution(simulatedEntities, distributablePool);
  const isDistValid = validateDistribution(prizeDistribution) === null;

  return (
    <div className={`h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 ${isEditing ? 'pt-4 pb-32' : 'pt-20 px-4 pb-32'}`}>
      
      {isEditing && (
          <div className="mb-4 flex items-center justify-between bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-xl border border-yellow-200 dark:border-yellow-800">
              <span className="text-yellow-700 dark:text-yellow-400 font-bold text-xs"><i className="fa-solid fa-pen mr-1"></i> Editing Match</span>
              <button onClick={() => { setEntryFee(""); setRewardAmount(""); setStartTime(""); if(onCancelEdit) onCancelEdit(); }} className="text-xs font-bold text-slate-500 dark:text-slate-400 underline">Cancel Edit</button>
          </div>
      )}

      <div className="mb-4 flex items-center gap-2">
         <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
             <i className="fa-solid fa-fire"></i>
         </div>
         <span className="font-bold text-lg text-slate-800 dark:text-white">Hosting Free Fire</span>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-xl shadow-slate-200/50 dark:shadow-black/20 border border-slate-100 dark:border-slate-800 animate-[fade-enter_0.3s]">
          
          <div className="grid grid-cols-2 gap-3 mb-4">
              <SelectDropdown 
                  label="Match Type"
                  value={matchType}
                  onChange={setMatchType}
                  options={[
                      {value: 'BR RANKED', label: 'BR RANKED'},
                      {value: 'CLASH SQUAD', label: 'CLASH SQUAD'},
                      {value: 'LONE WOLF', label: 'LONE WOLF'}
                  ]}
              />
              <SelectDropdown 
                  label="Mode"
                  value={mode}
                  onChange={setMode}
                  options={[
                      {value: 'SOLO', label: 'SOLO'},
                      {value: 'DUO', label: 'DUO'},
                      {value: 'SQUAD', label: 'SQUAD'}
                  ].filter(opt => !(isLoneWolf && opt.value === 'SQUAD'))}
              />
          </div>
          
          <div className="grid grid-cols-2 gap-3 mb-4">
              {showAmmoOption ? (
                 <SelectDropdown 
                    label="Ammo"
                    value={ammo}
                    onChange={setAmmo}
                    options={[
                        {value: 'LIMITED', label: 'LIMITED'},
                        {value: 'ULTIMATE', label: 'ULTIMATE'}
                    ]}
                 />
              ) : (
                 mode !== 'SOLO' && (
                 <SelectDropdown 
                    label="Play With"
                    value={playWith}
                    onChange={setPlayWith}
                    options={[
                        {value: 'RANDOMLY', label: 'RANDOM'},
                        {value: 'FRIENDS', label: 'FRIEND'}
                    ]}
                 />
                 )
              )}
          </div>

          {isBR && (
              <div className="mb-4 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Room Size</label>
                      <span className="text-xs font-bold text-slate-800 dark:text-white">{roomSize} Players</span>
                  </div>
                  <input 
                      type="range" 
                      min={mode === 'SOLO' ? 10 : (mode === 'DUO' ? 10 : 12)} 
                      max="48" 
                      step={mode === 'SOLO' ? 1 : (mode === 'DUO' ? 2 : 4)} 
                      value={roomSize} 
                      onChange={e => setRoomSize(parseInt(e.target.value))} 
                      className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
              </div>
          )}

          <div className={`grid ${isBR ? 'grid-cols-2' : 'grid-cols-1'} gap-3 mb-4`}>
             <SelectDropdown 
                label="Winning Criteria"
                value={rewardType}
                onChange={handleRewardTypeChange}
                options={availableRewardTypes.map(type => ({ value: type, label: type }))}
             />
             {isBR && (
                 <SelectDropdown 
                    label="Map"
                    value={map}
                    onChange={setMap}
                    options={[
                        {value: 'BERMUDA', label: 'BERMUDA'},
                        {value: 'BERMUDA REMASTERED', label: 'BERMUDA REMASTERED'},
                        {value: 'PURGATORY', label: 'PURGATORY'},
                        {value: 'KALAHARI', label: 'KALAHARI'},
                        {value: 'ALPINE', label: 'ALPINE'},
                        {value: 'NEXTERRA', label: 'NEXTERRA'}
                    ]}
                 />
             )}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
              <CompactInput label="Entry Fee (₹)" value={entryFee} onChange={setEntryFee} type="number" placeholder="0" icon="fa-ticket" validator={validateFee} min="0" />
              {((isSponsored) || (rewardType !== 'RANK' && rewardType !== 'MAX KILL' && rewardType !== 'ACHIEVE KILL')) && (
                  <CompactInput label={isSponsored ? "Sponsor Prize Pool" : (rewardType.includes('KILL') ? "Per Kill/Max Kill Prize" : "Winning Prize (₹)")} value={rewardAmount} onChange={setRewardAmount} type="number" placeholder="0" icon="fa-trophy" min="0" />
              )}
          </div>

          {(['RANK', 'PER KILL & RANK', 'MAX KILL', 'ACHIEVE KILL'].includes(rewardType)) && (
              <div className="mb-6 border-2 border-dashed border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10 rounded-xl p-3">
                  <h4 className="text-xs font-bold text-blue-800 dark:text-blue-400 uppercase mb-3 flex items-center gap-2">
                      <i className="fa-solid fa-calculator"></i> 
                      {rewardType === 'MAX KILL' ? 'Max Kill Prize Structure' : 
                       rewardType === 'ACHIEVE KILL' ? 'Target Kill Prize Structure' : 
                       'Rank Prize Structure'}
                  </h4>

                  {!isSponsored && (
                  <div className="mb-4 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                      <div className="flex justify-between items-center mb-1">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Host Margin (%)</label>
                          {!isAdmin && <button className="text-[9px] bg-yellow-400 text-white px-2 py-0.5 rounded font-bold hover:scale-105 transition shadow-sm animate-pulse"><i className="fa-solid fa-crown mr-1"></i> Get Premium</button>}
                          {isAdmin && <span className="text-xs font-bold text-slate-800 dark:text-white">{margin}%</span>}
                      </div>
                      {isAdmin ? (
                        <input type="range" min={minMargin} max="30" step="1" value={margin} onChange={e => setMargin(e.target.value)} className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-orange-500" />
                      ) : (
                        <div className="w-full bg-slate-100 dark:bg-slate-700 p-2 rounded-lg text-center border border-slate-200 dark:border-slate-600 text-xs font-bold text-slate-500 dark:text-slate-400">Fixed at 10% (Capped at ₹500)</div>
                      )}
                  </div>
                  )}

                  <button 
                      onClick={handleOpenModal} 
                      className={`w-full py-3 rounded-xl text-xs font-bold mb-4 shadow-lg flex items-center justify-between px-4 transition-colors ${isDistValid ? 'bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-700 dark:hover:bg-slate-600' : 'bg-red-50 dark:bg-red-900/20 text-red-600 border border-red-200 dark:border-red-900 animate-pulse'}`}
                  >
                      <span>Configure Payout Ranges</span>
                      {isDistValid ? <i className="fa-solid fa-check text-green-500"></i> : <i className="fa-solid fa-triangle-exclamation text-red-500"></i>}
                  </button>
                  {rewardType !== 'ACHIEVE KILL' && (
                      <div className="mb-2 text-[9px] text-slate-500 dark:text-slate-400 text-center italic">Max rank configurable: {maxConfigurableRank} (Based on {roomSize} Players)</div>
                  )}

                  <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 animate-[fade-enter_0.2s]">
                      <div className="flex justify-between items-center mb-2 bg-slate-100 dark:bg-slate-700 p-2 rounded-lg">
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase flex items-center gap-1"><i className="fa-solid fa-users"></i> {mode === 'SOLO' ? 'Players' : 'Teams'} Joined</span>
                          <span className="text-xs font-bold text-slate-800 dark:text-white">{simulatedEntities}</span>
                      </div>
                      <input type="range" min="2" max={Math.floor(roomSize / teamSize)} step="1" value={simulatedEntities} onChange={e => setSimulatedEntities(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-600 mb-3" />
                      
                      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                          <table className="w-full text-left bg-white dark:bg-slate-800">
                              <thead><tr className="bg-slate-50 dark:bg-slate-700 border-b border-slate-100 dark:border-slate-600 text-[9px] uppercase text-slate-500 dark:text-slate-300">
                                  <th className="px-3 py-1">{rewardType === 'ACHIEVE KILL' ? 'Target Kills' : (rewardType === 'MAX KILL' ? 'Kill Rank' : 'Rank')}</th>
                                  <th className="px-3 py-1 text-right">Prize {playWith === 'RANDOMLY' && mode !== 'SOLO' ? '(Per Player)' : rewardType === 'ACHIEVE KILL' ? '(Total Pool For Achievers)' : '(Total)'}</th>
                              </tr></thead>
                              <tbody>
                                  {simDistribution.map((row, i) => {
                                      const displayPrize = (playWith === 'RANDOMLY' && mode !== 'SOLO') ? Math.floor(row.perEntity / teamSize) : row.perEntity;
                                      
                                      let label = "";
                                      if (rewardType === 'ACHIEVE KILL') {
                                          const maxKill = roomSize - 1;
                                          const displayTo = Math.min(row.to, maxKill);
                                          label = `${row.from}${displayTo >= maxKill ? '+' : `-${displayTo}`} Kills`;
                                      } else {
                                          label = row.from === row.to ? `#${row.from}` : `#${row.from}-${row.to}`;
                                      }

                                      return (
                                      <tr key={i} className="border-b border-slate-100 dark:border-slate-700 last:border-0"><td className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300">{label}</td><td className={`px-3 py-2 text-xs font-bold text-right text-green-700 dark:text-green-400`}>₹{displayPrize}</td></tr>
                                  )})}
                                  {simDistribution.length === 0 && <tr><td colSpan={2} className="text-center p-3 text-xs text-slate-400 italic">No eligible winners with current join count</td></tr>}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          )}

          <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1"><i className="fa-solid fa-lock text-slate-400"></i> Private</span>
                  <label className="relative inline-flex items-center cursor-pointer mr-2">
                      <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} className="sr-only peer" />
                      <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                  
                  {isPrivate && (
                      <input 
                          type="tel" 
                          placeholder="Password (Numbers Only)" 
                          value={privatePass}
                          onChange={e => setPrivatePass(e.target.value.replace(/\D/g,''))}
                          className="flex-1 text-xs font-bold p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:border-blue-500"
                      />
                  )}
              </div>
          </div>

          <div className={`grid ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'} gap-3 mb-6`}>
              <CompactInput label="Start Time" value={startTime} onChange={setStartTime} type="datetime-local" icon="fa-clock" min={minDateTime} validator={validateTime} errorText="Min 10 mins future" />
              
              {isAdmin && (
                <div className="flex flex-col justify-end">
                    <div className="flex items-center justify-between bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/30 px-3 py-2.5 rounded-xl h-[42px]">
                        <span className="text-[10px] font-bold text-orange-800 dark:text-orange-400 flex items-center gap-1"><i className="fa-solid fa-star text-orange-500"></i> Special</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={isSpecial} onChange={e => setIsSpecial(e.target.checked)} className="sr-only peer" />
                            <div className="w-8 h-4 bg-orange-200 dark:bg-orange-900/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-orange-600"></div>
                        </label>
                    </div>
                </div>
              )}
          </div>
          
          <button 
            onClick={handleCreate} 
            disabled={loading || !isValid} 
            className={`fixed bottom-24 right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl z-50 transition-all transform active:scale-90 ${!isValid ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:scale-110 animate-bounce shadow-blue-500/40'}`}
          >
             {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className={`fa-solid ${isEditing ? 'fa-check' : 'fa-rocket'} text-xl`}></i>}
          </button>
      </div>

      {showDistributionModal && (
          <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-5 shadow-2xl animate-[slide-up_0.2s] max-h-[90vh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-4"><h3 className="font-semibold text-slate-800 dark:text-white">Prize Distribution</h3><button onClick={() => setShowDistributionModal(false)} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300"><i className="fa-solid fa-xmark"></i></button></div>
                  
                  {rewardType !== 'ACHIEVE KILL' && (
                  <div className="mb-4">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Winner Presets</p>
                      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                          {DISTRIBUTION_PRESETS.map((preset, idx) => (
                              <button key={idx} onClick={() => handleApplyPreset(preset.data)} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 whitespace-nowrap">{preset.name}</button>
                          ))}
                      </div>
                  </div>
                  )}

                  <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg mb-3 text-center"><span className={`text-xs font-bold ${currentTotalPercent !== 100 && rewardType !== 'ACHIEVE KILL' ? 'text-red-500' : 'text-blue-600 dark:text-blue-400'}`}>Total Allocation: {currentTotalPercent}%</span></div>
                  {distError && <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded-lg mb-3 text-xs text-red-600 dark:text-red-400 font-medium flex items-start gap-2"><i className="fa-solid fa-triangle-exclamation mt-0.5"></i>{distError}</div>}
                  <div className="mb-4 space-y-2">
                      {tempDistribution.map((row, idx) => {
                          const count = (row.to - row.from) + 1;
                          const totalForRange = Math.floor(distributablePool * (row.percentage / 100));
                          const perEntity = count > 0 ? Math.floor(totalForRange / count) : 0;
                          return (
                          <div key={idx} className="flex items-center gap-2">
                              <div className="flex items-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 w-20">
                                  <span className="text-[10px] text-slate-400 mr-1">{rewardType === 'ACHIEVE KILL' ? 'Kill' : 'Rank'}</span>
                                  <input type="number" value={row.from} onChange={e => updateDistributionRow(idx, 'from', parseInt(e.target.value))} className="w-full bg-transparent text-xs font-medium outline-none text-slate-800 dark:text-white" />
                              </div>
                              <span className="text-slate-400 text-xs">-</span>
                              <div className="flex items-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 w-20">
                                  <input type="number" value={row.to} onChange={e => updateDistributionRow(idx, 'to', parseInt(e.target.value))} className="w-full bg-transparent text-xs font-medium outline-none text-slate-800 dark:text-white" />
                              </div>
                              <div className="flex-1 flex flex-col justify-center bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900 rounded-lg px-2 py-1">
                                  <div className="flex items-center">
                                      <input type="number" value={row.percentage} onChange={e => updateDistributionRow(idx, 'percentage', parseInt(e.target.value))} className="w-full bg-transparent text-xs font-medium text-green-700 dark:text-green-400 outline-none text-right" placeholder="0" />
                                      <span className="text-[10px] text-green-600 dark:text-green-500 ml-1">%</span>
                                  </div>
                                  {rewardType !== 'ACHIEVE KILL' && (
                                      <div className="text-[9px] text-green-800 dark:text-green-300 text-right font-bold border-t border-green-200/50 dark:border-green-800/50 mt-0.5 pt-0.5">~₹{perEntity}/team</div>
                                  )}
                              </div>
                              <button onClick={() => removeDistributionRow(idx)} className="text-red-400 hover:text-red-600"><i className="fa-solid fa-trash text-xs"></i></button>
                          </div>
                      )})}
                  </div>
                  <div className="flex gap-2 mb-3"><button onClick={addDistributionRow} className="flex-1 py-2 border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 rounded-xl font-medium text-xs hover:bg-slate-50 dark:hover:bg-slate-800"><i className="fa-solid fa-plus mr-1"></i> Add Row</button></div>
                  <button onClick={handleSaveModal} disabled={!!distError} className="w-full bg-blue-600 text-white font-medium py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">{distError ? "Fix Issues to Save" : "Save Config"}</button>
              </div>
          </div>
      )}
    </div>
  );
};
export default HostMatch;
