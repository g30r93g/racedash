# @racedash/web-marketing

Public marketing site for RaceDash — Next.js 16 App Router, Tailwind v4, shadcn/ui, Lucide icons.

Deployed to Vercel.

## Scripts

```bash
pnpm --filter @racedash/web-marketing dev        # http://localhost:3002
pnpm --filter @racedash/web-marketing build
pnpm --filter @racedash/web-marketing start
pnpm --filter @racedash/web-marketing typecheck
```

## Adding shadcn components

```bash
pnpm dlx shadcn@latest add button
```

Components land in `components/ui/`. The registry is configured in `components.json`
(style `base-nova`, base color `neutral`, icons via Lucide).

## Theming

CSS variables live in `app/globals.css`. Dark mode is driven by `next-themes` via
`components/theme-provider.tsx` and defaults to `dark`.

## Formatting

Prettier is configured at the repo root (`.prettierrc`). Run `pnpm format` from the
monorepo root to format this app.
