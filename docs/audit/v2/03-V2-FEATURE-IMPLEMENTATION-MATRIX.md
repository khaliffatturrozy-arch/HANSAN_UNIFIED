# HANSAN V2 Feature Implementation Matrix

## Classification: Each feature assessed across 5 dimensions - Implemented, Connected to persistence, Enforced server-side, Covered by tests, Verified operationally.

| Feature | Impl | Persistence | Server-side | Tests | Operational |
|---|---|---|---|---|---|
| Next.js 14.2.35 App Router | ✓ | - | - | - | ✓ |
| React 18 | ✓ | - | - | - | ✓ |
| TypeScript strict mode | ✓ | - | - | - | ✓ |
| npm package manager | ✓ | - | - | - | ✓ |
| 12 dependencies | ✓ | - | - | - | ✓ |
| `src/app/` App Router | ✓ | - | - | - | ✓ |
| `src/components/` UI | ✓ | - | - | - | ✓ |
| `src/types/DevRole,DevAccount` | ✓ | - | - | - | ✓ |
| `src/styles/tokens.css` design system | ✓ | - | - | - | ✓ |
| `tests/` directory | ✓ | - | - | - | ✓ |
| `prisma/` directory | ✗ | - | - | - | ✗ |
| Next.js App Router (confirmed) | ✓ | - | - | - | ✓ |
| Root Layout with metadata | ✓ | - | - | - | ✓ |
| Home page with role intro | ✓ | - | - | - | ✓ |
| Global CSS + Tailwind | ✓ | - | - | - | ✓ |
| Design tokens (colors/surfaces) | ✓ | - | - | - | ✓ |
| API routes (`/api/health`) | ✓ | - | - | - | ✓ |
| Client-side routing (next/link) | ✓ | - | - | - | ✓ |
| Minimal backend (`/api/health`) | ✓ | - | - | - | ✗ |
| Health endpoint statuses | ✗ | - | - | - | ✗ |
| Service layer | ✗ | - | - | - | ✗ |
| `/api/health` endpoint | ✓ | - | - | - | ✓ |
| Orders API | ✗ | - | - | - | ✗ |
| Reservations API | ✗ | - | - | - | ✗ |
| Auth callbacks | ✗ | - | - | - | ✗ |
| Payment processing API | ✗ | - | - | - | ✗ |
| Service layer | ✗ | - | - | - | ✗ |
| Prisma schema | ✗ | ✗ | - | - | ✗ |
| Migration history | ✗ | ✗ | - | - | ✗ |
| DATABASE_URL placeholder | ✓ | ✗ | - | - | ✗ |
| Connection not established | ✗ | ✗ | - | - | ✗ |
| 5 dev roles (DevRole, DevAccount) | ✓ | - | - | - | ✓ |
| Supabase placeholders | ✗⚡ | - | - | - | ✗⚡ |
| Session middleware | ✗ | - | ✗ | - | ✗ |
| JWT token-based auth | ✗ | - | ✗ | - | ✗ |
| 5 roles map (DEV_ACCOUNTS) | ✓ | - | - | - | ✓ |
| Session store (Redis/DB) | ✗ | - | ✗ | - | ✗ |
| Supabase Auth planned | ✗⚡ | - | - | - | ✗⚡ |
| 5 roles defined | ✓ | - | - | - | ✓ |
| Server-side enforcement | ✗ | - | ✗ | - | ✗ |
| Role-based UI | ✓ | - | - | - | ✓ |
| Permission checks | ✗ | - | ✗ | - | ✗ |
| Development contracts | ✗⚡ | - | - | - | ✗⚡ |
| Tenant discriminator | ✗ | - | - | - | ✗ |
| Outlet partitioning | ✗ | - | - | - | ✗ |
| Multi-tenant readiness | ✗ | - | - | - | ✗ |
| Reservation model | ✗ | ✗ | - | - | ✗ |
| Reservation schema | ✗ | ✗ | - | - | ✗ |
| Reservation API routes | ✗ | ✗ | - | - | ✗ |
| Order flow conceptual | ✓ | - | - | - | ✗ |
| Order persistence | ✗ | - | - | - | ✗ |
| KDS interface | ✗ | - | - | - | ✗ |
| Order-KDS sync | ✗ | - | - | - | ✗ |
| Supabase realtime refs | ✗⚡ | - | - | - | ✗⚡ |
| Realtime channels | ✗ | - | - | - | ✗ |
| vitest framework | ✓ | - | - | ✓ | ✓ |
| Test files | ✗ | - | - | ✗ | ✗ |
| Linting (eslint) | ✓ | - | - | ✓ | ✓ |
| Type checking (tsc) | ✓ | - | - | ✓ | ✓ |
| Build script (`next build`) | ✓ | - | - | - | ✓ |
| Lint script (`next lint`) | ✓ | - | - | - | ✓ |
| Test script (`vitest run`) | ✓ | - | - | ✓ | ✓ |
| GitHub Actions | ✗ | - | - | - | ✗ |
| Start command (`next start`) | ✓ | - | - | - | ✓ |
| Dockerfile | ✗ | - | - | - | ✗ |
| vercel.yaml | ✗ | - | - | - | ✗ |
| Production target | ✗ | - | - | - | ✗ |
| CSP + security headers | ✓⚡ | - | ✓ | - | ✓ |
| .gitignore protections | ✓⚡ | - | - | - | ✓⚡ |
| Authentication (not impl.) | ✗⚡ | - | ✗⚡ | - | ✗⚡ |
| Rate limiting | ✗ | - | ✗ | - | ✗ |
| Input validation (Typescript only) | ✗⚡ | - | ✗⚡ | - | ✗⚡ |
| Code comments (design directives) | ✓⚡ | - | - | - | ✓⚡ |
| `.env.example` docs | ✓⚡ | - | - | - | ✓⚡ |
| CHANGELOG | ✗ | - | - | - | ✗ |
| API docs (beyond health) | ✗ | - | - | - | ✗ |