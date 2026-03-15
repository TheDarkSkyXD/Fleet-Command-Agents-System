import { FiChevronRight, FiHome } from 'react-icons/fi';

export interface BreadcrumbItem {
  label: string;
  page?: string;
  onClick?: () => void;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  onNavigate?: (page: string) => void;
}

export function Breadcrumbs({ items, onNavigate }: BreadcrumbsProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      data-testid="breadcrumbs"
      className="flex items-center gap-1.5 text-sm mb-4"
    >
      <button
        type="button"
        onClick={() => onNavigate?.('agents')}
        className="flex items-center gap-1 text-slate-400 hover:text-blue-400 transition-colors"
        data-testid="breadcrumb-home"
        title="Home"
        aria-label="Home"
      >
        <FiHome size={14} />
      </button>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={item.label} className="flex items-center gap-1.5">
            <FiChevronRight size={12} className="text-slate-500" />
            {isLast ? (
              <span
                className="text-slate-200 font-medium truncate max-w-[200px]"
                data-testid={`breadcrumb-${index}`}
                title={item.label}
              >
                {item.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (item.onClick) item.onClick();
                  else if (item.page) onNavigate?.(item.page);
                }}
                className="text-slate-400 hover:text-blue-400 transition-colors"
                data-testid={`breadcrumb-${index}`}
              >
                {item.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
