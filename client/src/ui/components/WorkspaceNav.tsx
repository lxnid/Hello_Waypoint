import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { ReactNode } from 'react';

export type NavItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  group?: string;
  badge?: number | string | null;
  badgeColor?: 'red' | 'emerald' | 'amber' | 'primary';
  isSubItem?: boolean;
  onClick?: () => void;
};

export function WorkspaceSidebar({
  items,
  basePath,
  collapsed,
  onToggleCollapse,
  footer,
  ariaLabel = 'Navigation',
}: {
  items: NavItem[];
  basePath: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  footer?: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <aside
      className={`${
        collapsed ? 'w-16' : 'w-60 xl:w-64 2xl:w-72'
      } hidden h-full shrink-0 flex-col rounded-card border border-border bg-white p-3 transition-[width] duration-200 md:flex overflow-y-auto`}
    >
      <button
        className={`mb-3 w-fit shrink-0 rounded-control p-2 text-muted hover:bg-surface ${
          collapsed ? 'mx-auto' : ''
        }`}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        aria-expanded={!collapsed}
        onClick={onToggleCollapse}
      >
        {collapsed ? <PanelLeftOpen size={24} /> : <PanelLeftClose size={24} />}
      </button>

      <nav aria-label={ariaLabel} className="flex-1 overflow-y-auto">
        {items.map((item, index) => {
          const showGroup =
            !collapsed &&
            item.group &&
            (index === 0 || item.group !== items[index - 1]?.group);

          return (
            <div key={item.path}>
              {showGroup && (
                <p
                  className={`${
                    index > 0 ? 'mt-9' : 'mt-2'
                  } mb-3 px-4 text-xs text-muted font-medium uppercase tracking-wider`}
                >
                  {item.group}
                </p>
              )}
              <NavLink
                to={`${basePath}/${item.path}`}
                title={collapsed ? item.label : undefined}
                onClick={item.onClick}
                className={({ isActive }) =>
                  collapsed
                    ? `my-1.5 flex h-10 w-10 mx-auto items-center justify-center rounded-full transition-colors relative ${
                        isActive
                          ? 'bg-primary text-white shadow-sm'
                          : 'text-muted hover:bg-surface hover:text-primary'
                      }`
                    : item.isSubItem
                      ? `my-0.5 ml-4 flex min-h-10 items-center gap-2.5 rounded-control px-3 text-xs transition-colors border-l-2 ${
                          isActive
                            ? 'border-primary bg-primary text-white font-semibold shadow-sm'
                            : 'border-border/60 text-primary/80 hover:bg-surface hover:text-primary hover:border-primary/60'
                        }`
                      : `my-1 flex min-h-12 items-center gap-3 rounded-control px-3.5 text-sm transition-colors ${
                          isActive
                            ? 'bg-primary text-white font-semibold shadow-sm'
                            : 'text-primary/80 hover:bg-surface hover:text-primary'
                        }`
                }
              >
                <item.icon size={item.isSubItem ? 18 : 20} className="shrink-0" />
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                {item.badge != null && String(item.badge) !== '0' && (
                  <span
                    className={
                      collapsed
                        ? `absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                            item.badgeColor === 'emerald'
                              ? 'bg-emerald-600'
                              : item.badgeColor === 'amber'
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                          }`
                        : `ml-auto rounded-full px-2 py-0.5 text-xs font-semibold text-white ${
                            item.badgeColor === 'emerald'
                              ? 'bg-emerald-600'
                              : item.badgeColor === 'amber'
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                          }`
                    }
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            </div>
          );
        })}
      </nav>

      {!collapsed && footer && (
        <div className="mt-auto shrink-0 px-4 pt-4 text-xs leading-5 text-muted">{footer}</div>
      )}
    </aside>
  );
}

export function WorkspaceMobileNav({
  items,
  basePath,
  ariaLabel = 'Mobile navigation',
}: {
  items: NavItem[];
  basePath: string;
  ariaLabel?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="mb-4 flex shrink-0 gap-2 overflow-x-auto rounded-card border border-border bg-white p-2 md:hidden"
    >
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={`${basePath}/${item.path}`}
          onClick={item.onClick}
          className={({ isActive }) =>
            `flex shrink-0 items-center gap-2 rounded-control px-3.5 py-2.5 text-sm transition-colors ${
              isActive
                ? 'bg-primary text-white font-medium shadow-sm'
                : 'text-primary/80 hover:bg-surface hover:text-primary'
            }`
          }
        >
          <item.icon size={18} className="shrink-0" />
          <span>{item.label}</span>
          {item.badge != null && String(item.badge) !== '0' && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold text-white ${
                item.badgeColor === 'emerald'
                  ? 'bg-emerald-600'
                  : item.badgeColor === 'amber'
                    ? 'bg-amber-500'
                    : 'bg-red-500'
              }`}
            >
              {item.badge}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
