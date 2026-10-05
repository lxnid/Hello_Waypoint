/**
 * Standardized icon size scale across the Waypoint client application.
 * Prevents arbitrary one-off pixel sizes and aligns with the 4px design grid.
 */
export const ICON_SIZE = {
  /** 14px - Inline metadata, breadcrumbs */
  inline: 14,
  /** 16px - Badges, status chips, compact indicators */
  chip: 16,
  /** 18px - Interactive buttons, action triggers, link arrows */
  action: 18,
  /** 20px - Navigation items (sidebar & mobile), card header badges */
  nav: 20,
  /** 20px - Metric and KPI feature cards */
  card: 20,
  /** 24px - Standard symbols, node markers */
  symbol: 24,
  /** 32px - High-prominence visuals, stage displays */
  display: 32,
} as const;

export type IconSizeKey = keyof typeof ICON_SIZE;
