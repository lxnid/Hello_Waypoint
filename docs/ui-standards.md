# UI & Styling Standards

## 1. Styling Architecture (Tailwind CSS v4)

The client uses **Tailwind CSS v4** via `@tailwindcss/vite`. Styling is configured CSS-first in [`client/src/style.css`](../client/src/style.css) via `@theme`.

### Design Tokens

| Token          | CSS Variable / Utility                           | Value     | Usage                                       |
| -------------- | ------------------------------------------------ | --------- | ------------------------------------------- |
| Primary        | `--color-primary` / `bg-primary`, `text-primary` | `#111111` | Primary brand color, text, active elements  |
| Surface        | `--color-surface` / `bg-surface`                 | `#f7f7f7` | Page background, input backgrounds          |
| Surface Raised | `--color-surface-raised` / `bg-surface-raised`   | `#ffffff` | Elevated panels, cards, active nav items    |
| Border         | `--color-border` / `border-border`               | `#d9d9d9` | Card and input borders                      |
| Muted          | `--color-muted` / `text-muted`                   | `#747474` | Secondary text, captions, inactive icons    |
| Chilled        | `--color-chilled` / `bg-chilled`                 | `#cef1f5` | Cold cargo tone, focus rings, active pills  |
| Ambient        | `--color-ambient` / `bg-ambient`                 | `#cef2d2` | Ambient cargo tone, system online indicator |
| Textile        | `--color-textile` / `bg-textile`                 | `#e8e2f6` | Textile cargo tone, metric card tone        |
| Fragile        | `--color-fragile` / `bg-fragile`                 | `#f7f2e9` | Fragile cargo tone, visual card banners     |
| Warning        | `--color-warning` / `text-warning`               | `#ff3e45` | Error alerts, critical statuses             |
| Disabled       | `--color-disabled` / `bg-disabled`               | `#d9d9d9` | Inactive button fills and borders           |
| Card Radius    | `--radius-card` / `rounded-card`                 | `20px`    | Feature cards, panels, large containers     |
| Control Radius | `--radius-control` / `rounded-control`           | `16px`    | Buttons, form inputs, interactive elements  |

---

## 2. Component System (shadcn/ui)

Waypoint UI components follow the **[shadcn/ui](https://ui.shadcn.com/)** architecture: accessible, composable primitives built on Tailwind CSS.

### Architecture & Conventions

- **Ownership & Location**: Reusable primitives live in `client/src/ui/components/ui/` (or `client/src/ui/components/`). Components are owned by the repository (copy-paste / CLI generated) rather than consumed as a black-box NPM package.
- **Utility Helper (`cn`)**: Class names are combined using `clsx` and `tailwind-merge`:
  ```ts
  import { clsx, type ClassValue } from 'clsx';
  import { twMerge } from 'tailwind-merge';

  export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
  }
  ```
- **Variants via `cva`**: Component variants (size, intent, hierarchy) use `class-variance-authority` (`cva`), referencing Waypoint tokens (`rounded-control`, `rounded-card`, `primary`, `surface`).
- **Headless Foundations**: Interactive, complex components (dialogs, dropdowns, popovers, select, tabs, tooltips) use unstyled accessible primitives (Radix UI / React Aria).
- **Adding New Components**: Use `npx shadcn@latest add <component>` or adapt existing primitives to maintain design token fidelity.

---

## 3. Icon Standards (`lucide-react`)

All icons use **[`lucide-react`](https://lucide.dev/)** (`^0.468.0`), matching the standard shadcn/ui icon library.

### Standard Size Scale

Icon sizes must use the unified `ICON_SIZE` scale defined in [`client/src/ui/icons.ts`](../client/src/ui/icons.ts). Avoid arbitrary pixel sizes.

| Key       | Size   | Purpose                                      | Examples                                       |
| --------- | ------ | -------------------------------------------- | ---------------------------------------------- |
| `inline`  | `14px` | Breadcrumbs, small metadata indicators       | `LayoutDashboard`                              |
| `chip`    | `16px` | Location chips, compact badges               | `MapPinned`                                    |
| `action`  | `18px` | Buttons (sign in, sign out), external links  | `ArrowRight`, `LogOut`, `ArrowUpRight`         |
| `nav`     | `20px` | Sidebar navigation, mobile bottom navigation | `RoleIcon`, `FileText`                         |
| `card`    | `20px` | Metric and KPI card icons                    | `RoleIcon`, `Database`, `Truck`                |
| `symbol`  | `24px` | Map symbols, workflow route nodes            | `Route`, `Truck`, `Boxes`, `MapPin`            |
| `display` | `32px` | High-prominence visual illustrations         | `Route`, `Boxes`, `Truck` in Foundation banner |

### Accessibility Rule

- Always include `aria-hidden="true"` on decorative icons or icons accompanied by text labels.
- Provide accessible alternatives (`aria-label` or visually hidden text) when an icon acts as the sole button content on mobile.
