import { motion } from 'framer-motion';
import type { HTMLAttributes, ReactNode } from 'react';
import './AnimatedCard.css';

/**
 * Staggered card entrance animation wrapper.
 * Wrap cards in AnimatedCardContainer, then each card in AnimatedCard.
 * Cards animate in with a subtle fade + slide-up with staggered delay.
 */

interface AnimatedCardContainerProps {
  children: ReactNode;
  className?: string;
  /** Stagger delay between each child in seconds (default: 0.05) */
  staggerDelay?: number;
}

/** Container that orchestrates staggered children animations */
export function AnimatedCardContainer({
  children,
  className,
  staggerDelay = 0.05,
}: AnimatedCardContainerProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

interface AnimatedCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  /** Override the data-testid */
  'data-testid'?: string;
}

const cardVariants = {
  hidden: {
    opacity: 0,
    y: 8,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.25,
      ease: 'easeOut',
    },
  },
};

/** Individual card with entrance animation - use inside AnimatedCardContainer */
export function AnimatedCard({
  children,
  className,
  ...rest
}: AnimatedCardProps) {
  return (
    <motion.div className={className} variants={cardVariants} {...rest}>
      {children}
    </motion.div>
  );
}
