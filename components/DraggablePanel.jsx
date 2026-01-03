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

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const style = position
    ? { position: 'fixed', left: position.x, top: position.y, zIndex: 1000, cursor: isDragging ? 'grabbing' : 'grab' }
    : { position: 'fixed', ...defaultPosition, zIndex: 1000, cursor: 'grab' };

  return (
    <div
      ref={panelRef}
      onMouseDown={handleMouseDown}
      className={className}
      style={style}
    >
      {children}
    </div>
  );
}
