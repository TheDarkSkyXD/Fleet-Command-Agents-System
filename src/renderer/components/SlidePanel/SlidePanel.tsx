import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import './SlidePanel.css';

interface SlidePanelProps {
  /** Whether the panel is visible */
  isOpen: boolean;
  /** Content to render inside the panel */
  children: ReactNode;
  /** Direction the panel slides from. Default: 'right' */
  direction?: 'left' | 'right' | 'top' | 'bottom';
  /** Additional CSS classes */
  className?: string;
  /** data-testid for testing */
  testId?: string;
}

const slideVariants = {
  left: {
    initial: { x: -20, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: -20, opacity: 0 },
  },
  right: {
    initial: { x: 20, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: 20, opacity: 0 },
  },
  top: {
    initial: { y: -16, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: -16, opacity: 0 },
  },
  bottom: {
    initial: { y: 16, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: 16, opacity: 0 },
  },
};

const springTransition = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 30,
  mass: 0.8,
};

export function SlidePanel({
  isOpen,
  children,
  direction = 'right',
  className = '',
  testId,
}: SlidePanelProps) {
  const variants = slideVariants[direction];

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          initial={variants.initial}
          animate={variants.animate}
          exit={variants.exit}
          transition={springTransition}
          className={className}
          data-testid={testId}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
