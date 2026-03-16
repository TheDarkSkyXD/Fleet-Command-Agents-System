import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import './ContextMenu.css';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

/**
 * Hook to manage context menu state and positioning.
 */
export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const show = useCallback((e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();

    // Calculate position, ensuring menu stays in viewport
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - items.length * 36 - 16);

    setMenu({ x, y, items });
  }, []);

  const hide = useCallback(() => setMenu(null), []);

  return { menu, show, hide };
}

/**
 * A floating context menu component triggered by right-click.
 */
export function ContextMenu({
  menu,
  onClose,
}: {
  menu: { x: number; y: number; items: ContextMenuItem[] } | null;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!menu) return;

    const handleClick = () => onClose();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[200px] rounded-lg border border-slate-600 bg-slate-800 shadow-xl shadow-black/50 py-1"
      style={{ left: menu.x, top: menu.y }}
      data-testid="context-menu"
    >
      {menu.items.map((item) =>
        item.separator ? (
          <Separator key={item.id} className="my-1" />
        ) : (
          <Button
            variant="ghost"
            key={item.id}
            type="button"
            disabled={item.disabled}
            onClick={(e) => {
              e.stopPropagation();
              item.onClick();
              onClose();
            }}
            className={`flex h-auto w-full items-center gap-2.5 px-3 py-2 text-sm rounded-none transition-colors ${
              item.disabled
                ? 'text-slate-500 cursor-not-allowed'
                : item.danger
                  ? 'text-red-400 hover:bg-red-500/10'
                  : 'text-slate-200 hover:bg-slate-700'
            }`}
            data-testid={`context-menu-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            {item.icon && (
              <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                {item.icon}
              </span>
            )}
            <span>{item.label}</span>
          </Button>
        ),
      )}
    </div>
  );
}
