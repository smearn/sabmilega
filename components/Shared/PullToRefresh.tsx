import React, { useState, useRef } from 'react';

export const PullToRefresh = ({ onRefresh, children }: { onRefresh: () => Promise<void>, children?: React.ReactNode }) => {
  const [startY, setStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    // Only enable pull to refresh if we are at the top of the scroll container
    // We use the window scroll Y for general page, or container scrollTop
    const scrollTop = containerRef.current?.scrollTop || 0;
    if (scrollTop === 0) {
      setStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY > 0 && !refreshing) {
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY;
      // Only trigger if pulling down
      if (diff > 0) {
        // Add resistance factor 0.4
        setPullDistance(diff * 0.4); 
      }
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance > 70) {
      setRefreshing(true);
      await onRefresh();
      setRefreshing(false);
    }
    setStartY(0);
    setPullDistance(0);
  };

  return (
    <div 
      ref={containerRef}
      className="h-full overflow-y-auto relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div 
        style={{ 
            height: pullDistance > 0 ? pullDistance : (refreshing ? 60 : 0),
            opacity: pullDistance > 0 || refreshing ? 1 : 0
        }} 
        className="w-full flex items-center justify-center overflow-hidden transition-all duration-300 bg-slate-100 text-slate-500"
      >
        {refreshing ? (
            <div className="flex items-center gap-2">
                <i className="fa-solid fa-spinner fa-spin"></i>
                <span className="text-xs font-bold">Reloading...</span>
            </div>
        ) : (
            <div className="flex flex-col items-center">
                <i className="fa-solid fa-arrow-down mb-1" style={{transform: `rotate(${pullDistance > 70 ? 180 : 0}deg)`, transition: 'transform 0.2s'}}></i>
                <span className="text-[10px] font-bold">Pull to refresh</span>
            </div>
        )}
      </div>
      {children}
    </div>
  );
};