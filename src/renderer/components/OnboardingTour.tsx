import { useCallback, useEffect, useRef, useState } from 'react';
import { FiArrowRight, FiPlay, FiX } from 'react-icons/fi';

export interface TourStep {
  /** CSS selector or data-testid to anchor the tooltip to */
  targetSelector: string;
  /** Unique identifier for this step (used for data-testid) */
  stepId: string;
  /** Title of the tooltip */
  title: string;
  /** Description text */
  description: string;
  /** Position relative to the target element */
  position: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STEPS: TourStep[] = [
  {
    targetSelector: '[data-testid="sidebar-nav"]',
    stepId: 'sidebar',
    title: 'Sidebar Navigation',
    description:
      'This is your main navigation panel. Use it to switch between Agents, Mail, Merge Queue, Worktrees, Tasks, Metrics, and more. Each section gives you control over a different aspect of your fleet. The sidebar can be collapsed for more workspace.',
    position: 'right',
  },
  {
    targetSelector: '[data-testid="spawn-agent-button"]',
    stepId: 'spawn-agent',
    title: 'Spawn Your First Agent',
    description:
      'Click here to spawn an AI coding agent. Choose a capability (scout, builder, reviewer, etc.), select a model, and optionally set a file scope to restrict which files the agent can modify.',
    position: 'bottom',
  },
  {
    targetSelector: '[data-testid="nav-mail"]',
    stepId: 'mail',
    title: 'Check Agent Mail',
    description:
      'Agents communicate via an internal mail system. Check the inbox to see status updates, questions, and results from your agents. You can also send messages to coordinate work. Unread messages are indicated by a badge on the Mail icon.',
    position: 'right',
  },
  {
    targetSelector: '[data-testid="nav-merge"]',
    stepId: 'merge',
    title: 'Merge Workflow',
    description:
      'When agents finish their work, their branches are enqueued here for merging. Review the queue, preview diffs, and merge changes into your main branch. The system supports 4 resolution tiers: clean merge, auto-resolve, AI-resolve, and reimagine.',
    position: 'right',
  },
];

const TOUR_STORAGE_KEY = 'fleet-command-onboarding-completed';

export function OnboardingTour() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const [arrowPos, setArrowPos] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const step = TOUR_STEPS[currentStep];

  const positionTooltip = useCallback(() => {
    if (!step) return;

    const target = document.querySelector(step.targetSelector);
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const tooltipEl = tooltipRef.current;
    const tooltipWidth = tooltipEl?.offsetWidth || 320;
    const tooltipHeight = tooltipEl?.offsetHeight || 160;
    const gap = 12;

    let top = 0;
    let left = 0;
    let aTop = 0;
    let aLeft = 0;

    switch (step.position) {
      case 'bottom':
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        aTop = rect.bottom + 2;
        aLeft = rect.left + rect.width / 2 - 6;
        break;
      case 'top':
        top = rect.top - tooltipHeight - gap;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        aTop = rect.top - gap + 2;
        aLeft = rect.left + rect.width / 2 - 6;
        break;
      case 'right':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.right + gap;
        aTop = rect.top + rect.height / 2 - 6;
        aLeft = rect.right + 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.left - tooltipWidth - gap;
        aTop = rect.top + rect.height / 2 - 6;
        aLeft = rect.left - gap + 2;
        break;
    }

    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - tooltipHeight - 8));

    setTooltipPos({ top, left });
    setArrowPos({ top: aTop, left: aLeft });
  }, [step]);

  // Check if tour should show
  useEffect(() => {
    try {
      const completed = localStorage.getItem(TOUR_STORAGE_KEY);
      if (!completed) {
        // Delay slightly to let the page render first
        const timer = setTimeout(() => {
          setIsVisible(true);
        }, 1500);
        return () => clearTimeout(timer);
      }
    } catch {
      // localStorage not available
    }
  }, []);

  // Position tooltip when visible and on resize/scroll
  useEffect(() => {
    if (!isVisible) return;

    const updatePosition = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(positionTooltip);
    };

    updatePosition();

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isVisible, positionTooltip]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    } catch {
      // localStorage not available
    }
  }, []);

  const handleNext = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleDismiss();
    }
  }, [currentStep, handleDismiss]);

  if (!isVisible || !step) return null;

  // Highlight the target element
  const target = document.querySelector(step.targetSelector);
  const targetRect = target?.getBoundingClientRect();

  return (
    <div data-testid="onboarding-tour" className="fixed inset-0 z-[60] pointer-events-none">
      {/* Backdrop overlay with cutout for target */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss */}
      <div className="absolute inset-0 pointer-events-auto" onClick={handleDismiss}>
        <svg
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Tour overlay backdrop"
        >
          <defs>
            <mask id="tour-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {targetRect && (
                <rect
                  x={targetRect.left - 4}
                  y={targetRect.top - 4}
                  width={targetRect.width + 8}
                  height={targetRect.height + 8}
                  rx="8"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.5)"
            mask="url(#tour-mask)"
          />
        </svg>
      </div>

      {/* Highlight ring around target */}
      {targetRect && (
        <div
          className="absolute border-2 border-blue-400 rounded-lg animate-pulse pointer-events-none"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
        />
      )}

      {/* Arrow indicator */}
      <div
        className="absolute w-3 h-3 bg-slate-800 border border-blue-500/50 rotate-45 pointer-events-none"
        style={{
          top: arrowPos.top,
          left: arrowPos.left,
          zIndex: 61,
        }}
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        data-testid={`onboarding-tooltip-${step.stepId}`}
        className="absolute w-80 rounded-xl border border-blue-500/30 bg-slate-800 shadow-2xl shadow-blue-500/10 pointer-events-auto"
        style={{
          top: tooltipPos.top,
          left: tooltipPos.left,
          zIndex: 62,
        }}
      >
        {/* Tooltip header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20">
              <FiPlay className="h-3 w-3 text-blue-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-50">{step.title}</h3>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-md p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
            aria-label="Dismiss tour"
            title="Dismiss tour"
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>

        {/* Tooltip body */}
        <div className="px-4 pb-3">
          <p className="text-xs text-slate-400 leading-relaxed">{step.description}</p>
        </div>

        {/* Tooltip footer */}
        <div className="flex items-center justify-between border-t border-slate-700 px-4 py-3">
          <span className="text-xs text-slate-500">
            {currentStep + 1} of {TOUR_STEPS.length}
          </span>
          <button
            type="button"
            onClick={handleNext}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
          >
            {currentStep < TOUR_STEPS.length - 1 ? (
              <>
                Next
                <FiArrowRight className="h-3 w-3" />
              </>
            ) : (
              'Got it!'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Reset the onboarding tour so it shows again */
export function resetOnboardingTour() {
  try {
    localStorage.removeItem(TOUR_STORAGE_KEY);
  } catch {
    // localStorage not available
  }
}
