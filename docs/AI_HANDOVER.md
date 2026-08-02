# AI-to-AI Handoff & Setup Guide

Hello! This document provides quick setup instructions, architectural principles, and runtime boundaries for the **Payment Ledger Workstation** to help you continue development seamlessly.

---

## 🚀 Environment Setup & Tooling

We manage environment and build steps via **`mise`**. You must prefix all execution commands accordingly.

### 1. Initial Dependency Installation
To prevent post-install scripts (like compilation of heavy binary dependencies) from blocking in non-interactive sandbox terminals, run the install command with the `--ignore-scripts` flag:
```bash
mise exec -- pnpm install --ignore-scripts
```

### 2. Typings & Code Verification
Validate the TypeScript compiler states across all workspace packages and apps:
```bash
mise exec -- pnpm run check
```

### 3. Production Build Compilation
Compile packages, backend server, and front-end bundle (with code-split reports):
```bash
mise exec -- pnpm run build
```

### 4. Running the Dev Workstation
Launch the Hono API server and the Vite dev server proxy in parallel:
```bash
mise exec -- pnpm run dev
```
Open your browser at [http://127.0.0.1:4782](http://127.0.0.1:4782).

### 5. Running E2E Test Suite
Run local browser execution verification checks using Playwright:
```bash
mise exec -- pnpm test:e2e
```

---

## 📐 Conceptual Stack & Rationale

* **Front-end SPA**: Built with **React 19.2 + Vite 8.2 + Tailwind CSS v4.3** inside the [`apps/web-react`](file:///home/arch/payment-ledger/apps/web-react) package directory.
* **Routing**: Using **React Router v7** in SPA mode. Tabs are fully routed (hash-less URL paths), allowing deep-linked drawers (e.g. `/ledger/:transactionId` and `/payees/:payeeId`) with support for browser forward/back buttons.
* **Form Validation**: Standardized on **React Hook Form + Zod** validation resolvers (see [`DetailedEntryDrawer.tsx`](file:///home/arch/payment-ledger/apps/web-react/src/components/payment-entry/DetailedEntryDrawer.tsx)). Errors show red borders with inline messages, and focus is automatically directed to the first invalid field.
* **Typographical Numerals**: Uses **Geist Mono** with `font-variant-numeric: tabular-nums` for all currency amounts, transaction IDs, and timestamps to ensure tabular spacing alignment.
* **Lazy Loading**: Analytical modules and Apache ECharts are split into a separate bundle chunk ([`ReportCharts.tsx`](file:///home/arch/payment-ledger/apps/web-react/src/components/reports/ReportCharts.tsx)) and wrapped in a `<Suspense>` boundary on reports pages. This keeps the initial **Today** page bundle small and performant on low-spec 4 GB RAM machines.
* **Deterministic Autocomplete**: The autocomplete dropdown matches payees and aliases deterministically in this order:
  1. Exact alias
  2. Exact name
  3. Prefix match
  4. Word prefix match
  5. Contains match
  6. Fuzzy fallback match (Fuse.js index score <= 0.32)

---

## 🛡️ Operational & Database Boundaries

1. **Passive Frontend**: React pages must never perform database corrections, voids, or recalculate transaction balances. The backend Hono API remains the **only** authority for write validations and state rules.
2. **Audit Visibility**: Voided transactions are never silently deleted. They are flagged as `voided` in SQLite, marked red in the UI, and remain permanently in the transaction audit trail drawer logs.
3. **Reversibility**: Svelte files in [`apps/web/`](file:///home/arch/payment-ledger/apps/web) are kept as a fallback. The Hono static file server checks for the existence of `apps/web-react/build` and hot-swaps static routing automatically. If you ever need to roll back, simply delete the `apps/web-react/build` directory.
