# Payment Ledger

Private, single-user INR payment tracking for daily business operations. The production application is one Node.js process serving a static Svelte SPA and Hono API at `http://127.0.0.1:4782`.

## Requirements

- Node.js `24.18.1`
- pnpm `11.18.0`
- Windows 10/11 x64 or a supported x64 Linux development environment

The development machine can activate the exact tools with `mise install`.

## Commands

```bash
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm dev
mise exec -- pnpm build
mise exec -- pnpm start
mise exec -- pnpm db:migrate
mise exec -- pnpm db:backup
mise exec -- pnpm test
mise exec -- pnpm test:e2e
```

Development serves the UI on `127.0.0.1:4782` and proxies API calls to a loopback-only Hono process on port `4783`. Production serves everything from one process on port `4782`.

Development data defaults to `./data`. Windows production uses `%LOCALAPPDATA%\PaymentLedger` through `scripts/start-production.ps1`. See [Windows deployment](docs/WINDOWS_DEPLOYMENT.md) and [backup and restore](docs/BACKUP_AND_RESTORE.md).

## Current status

The local website includes master data, smart and manual capture, favourites and frequent payees, a searchable ledger, audited corrections and void/undo, review queue, cash-first reports, CSV/print, unusual and repeated-payment analysis, plus verified backup tooling. Telegram is deliberately not implemented.

The custom Payment Desk frontend uses Skeleton 4 theme tokens with Tailwind CSS 4, Ark UI behavior primitives, TanStack Table v8, lazy LayerChart 2 reports, Fuse.js payee search, Sonner notifications, and Lucide icons. It does not use shadcn or a premade admin template.
