import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const Tooltip = ({ content, children, className = '' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        left: rect.left + rect.width / 2,
        top: rect.top - 8
      });
      setIsVisible(true);
    }
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  if (!content) return children;

  return (
    <>
      <span
        ref={triggerRef}
        className={`${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </span>
      {mounted && isVisible && createPortal(
        <div
          className="fixed whitespace-pre z-[9999] px-2 py-1 text-xs text-white bg-[#313438]/95 
                               rounded-md shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full"
          style={{ left: coords.left, top: coords.top }}
        >
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#313438]/95"></div>
        </div>,
        document.body
      )}
    </>
  );
};

export default Tooltip;
