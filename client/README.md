# @waypoint/client

Frontend application for Waypoint delivery operations.

## UI Standards

- **Styling**: Tailwind CSS v4 via `@tailwindcss/vite`. Tokens are defined CSS-first in `src/style.css` via `@theme`.
- **Component System**: [shadcn/ui](https://ui.shadcn.com/) patterns (composable accessible primitives, `cn()` utility, `cva` variants).
- **Icons**: `lucide-react` with standardized sizes from `src/ui/icons.ts`:
  - `inline` (14px): Breadcrumbs & small inline indicators
  - `chip` (16px): Status chips & badges
  - `action` (18px): Buttons & action triggers
  - `nav` / `card` (20px): Navigation items & metric cards
  - `symbol` (24px): Map symbols & route nodes
  - `display` (32px): Feature displays & banners

For full details, see [`docs/ui-standards.md`](../docs/ui-standards.md).

## Development

```bash
pnpm dev        # Start dev server on port 3000
pnpm build      # Typecheck and build for production
pnpm typecheck  # Run tsc without emit
```
