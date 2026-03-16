import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

interface TooltipProps {
  content: string;
  children: ReactNode;
  /** Preferred position (auto-adjusts if clipped) */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Delay before showing tooltip in ms */
  delay?: number;
  /** Additional className for the wrapper */
  className?: string;
  /** Whether tooltip is disabled */
  disabled?: boolean;
}

/**
 * Lightweight tooltip component for truncated text and icon buttons.
 * Shows a styled tooltip on hover with auto-positioning.
 * Uses a portal to render outside parent overflow/flex containers.
 */
export function Tooltip({
  content,
  children,
  position = 'bottom',
  delay = 300,
  className = '',
  disabled = false,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [actualPosition, setActualPosition] = useState(position);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const gap = 6;
    let pos = position;
    let top = 0;
    let left = 0;

    const calc = (p: string) => {
      switch (p) {
        case 'top':
          top = triggerRect.top - tooltipRect.height - gap;
          left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
          break;
        case 'bottom':
          top = triggerRect.bottom + gap;
          left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
          break;
        case 'left':
          top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
          left = triggerRect.left - tooltipRect.width - gap;
          break;
        case 'right':
          top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
          left = triggerRect.right + gap;
          break;
      }
    };

    calc(pos);

    // Auto-flip if out of viewport
    if (pos === 'top' && top < 4) {
      pos = 'bottom';
      calc(pos);
    } else if (pos === 'bottom' && top + tooltipRect.height > window.innerHeight - 4) {
      pos = 'top';
      calc(pos);
    } else if (pos === 'left' && left < 4) {
      pos = 'right';
      calc(pos);
    } else if (pos === 'right' && left + tooltipRect.width > window.innerWidth - 4) {
      pos = 'left';
      calc(pos);
    }

    // Clamp to viewport
    left = Math.max(4, Math.min(left, window.innerWidth - tooltipRect.width - 4));
    top = Math.max(4, Math.min(top, window.innerHeight - tooltipRect.height - 4));

    setCoords({ top, left });
    setActualPosition(pos);
  }, [position]);

  const handleMouseEnter = useCallback(() => {
    if (disabled || !content) return;
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, delay);
  }, [disabled, content, delay]);

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  }, []);

  // Position after the tooltip renders in the portal
  useEffect(() => {
    if (visible) {
      // Double rAF ensures the portal element is painted before measuring
      requestAnimationFrame(() => {
        requestAnimationFrame(updatePosition);
      });
    }
  }, [visible, updatePosition]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!content || disabled) {
    return <>{children}</>;
  }

  return (
    <div
      ref={triggerRef}
      className={`inline-flex ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {children}
      {visible &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            className="fixed z-[9999] max-w-xs rounded-md bg-slate-800 border border-slate-600 px-2.5 py-1.5 text-xs text-slate-100 shadow-lg pointer-events-none"
            style={{ top: coords.top, left: coords.left }}
            data-position={actualPosition}
          >
            {content}
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * Simple wrapper that adds a title attribute for native browser tooltip
 * on truncated text. Use when you just need basic tooltip without styling.
 */
export function TruncatedText({
  text,
  className = '',
  maxWidth,
}: {
  text: string;
  className?: string;
  maxWidth?: string;
}) {
  return (
    <span
      className={`truncate ${className}`}
      title={text}
      style={maxWidth ? { maxWidth } : undefined}
    >
      {text}
    </span>
  );
}
