
import React, { useState, useEffect } from "react";
import { calculateTimeLeft } from "../../utils";

const CountdownTimer = ({ targetDate, compact = false }: { targetDate: number, compact?: boolean }) => {
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft(targetDate));

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(calculateTimeLeft(targetDate));
        }, 1000);
        return () => clearInterval(timer);
    }, [targetDate]);

    if (timeLeft.expired) {
        return <span className="text-red-500 font-bold text-[10px] uppercase animate-pulse">Starting Soon</span>;
    }

    if (compact) {
        return (
            <div className="flex items-center text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400">
                <i className="fa-regular fa-clock mr-1"></i>
                {timeLeft.days > 0 && <>{timeLeft.days}d </>}
                {timeLeft.hours}:{timeLeft.minutes}:{timeLeft.seconds}
            </div>
        );
    }

    return (
        <div className="flex items-center gap-1 font-mono font-bold text-sm text-slate-800 dark:text-white">
            {timeLeft.days > 0 && <span>{timeLeft.days}d </span>}
            <span className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{timeLeft.hours.toString().padStart(2, '0')}</span>
            <span className="text-slate-400">:</span>
            <span className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{timeLeft.minutes.toString().padStart(2, '0')}</span>
            <span className="text-slate-400">:</span>
            <span className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{timeLeft.seconds.toString().padStart(2, '0')}</span>
        </div>
    );
};

export default CountdownTimer;
