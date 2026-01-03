import React, { useState, useEffect, useRef } from 'react';

export default function DraggablePanel({ children, className = '', defaultPosition = { top: '15%', left: '50%', transform: 'translateX(-50%)' } }) {
  const [position, setPosition] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef(null);

  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // Only left click
    
    const rect = panelRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    
    setPosition({ x: rect.left, y: rect.top });
    setIsDragging(true);
    
    e.stopPropagation();
    // e.preventDefault(); // Prevent text selection etc.
  };

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    const rect = panelRef.current.getBoundingClientRect();
    setDragOffset({
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    });
    
    setPosition({ x: rect.left, y: rect.top });
    setIsDragging(true);
    
    e.stopPropagation();
  };

  useEffect(() => {
    const handleMove = (e) => {
      if (!isDragging) return;
      
      let clientX, clientY;
      if (e.type === 'touchmove') {
         clientX = e.touches[0].clientX;
         clientY = e.touches[0].clientY;
      } else {
         clientX = e.clientX;
         clientY = e.clientY;
      }

      setPosition({
        x: clientX - dragOffset.x,
        y: clientY - dragOffset.y
      });
    };

    const handleUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isDragging, dragOffset]);

  const style = position
    ? { position: 'fixed', left: position.x, top: position.y, zIndex: 1000, cursor: isDragging ? 'grabbing' : 'grab' }
    : { position: 'fixed', ...defaultPosition, zIndex: 1000, cursor: 'grab' };

  return (
    <div
      ref={panelRef}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      className={className}
      style={style}
    >
      {children}
    </div>
  );
}
