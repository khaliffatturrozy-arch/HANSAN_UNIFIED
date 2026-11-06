# HANSAN V2 Architecture Review

## Overall Assessment
V2 is a **Phase 0 foundation sprint** — a development-only prototype with no production backend, no database integration, and auth planned for future phases. The architecture is frontend-centric (Next.js App Router) with deliberate separation between UI foundation and backend wiring.

## Strengths
- **Clean design token system**: `src/styles/tokens.css` is a single source of truth for brand colors, surfaces, elevation, radius, typography, z-index, spacing, and transitions (referenced by both Tailwind config and CSS)
- **Neumorphic elevation system**: Flat-first approach with reserved uses for raised-sm, raised, inset, and flat; neu-raised and neu-raised-sm only for primary buttons and elevated overlays
- **Role-based UI scaffolding**: 5 roles (developer, owner, pos, kds, finance) defined in `src/types/roles.ts` with DEV_ACCOUNTS mapping to emails and home routes
- **Security headers**: Comprehensive CSP and HTTP headers in `next.config.mjs` (CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS, X-Permitted-Cross-Domain-Policies)
- **ORBIT-informed UI/UX**: Design language referencing ORBIT design system — operational clarity, flat surfaces, 1px structural borders, disciplined radius hierarchy
- **Type safety**: TypeScript with `strict: true`, comprehensive type definitions for roles and accounts

## Technical Debt
- **No Prisma/ORM**: V2 has no database schema or migration history — `prisma/` directory is absent; `DATABASE_URL` is only a placeholder in `.env.example`
- **No service layer**: Missing business logic separation; `/api/health` reports all backends as "not-configured"
- **No authentication implemented**: Supabase integration planned but only placeholders in `.env.example`; 5 development roles have no server-side enforcement
- **No session architecture**: No session middleware, no session store (Redis/database), client-side only navigation
- **No realtime mechanisms**: Supabase referenced but channels, WebSockets not configured
- **No CI/CD**: No GitHub Actions, no automated build/test/deployment pipeline
- **No testing infrastructure**: vitest configured but zero test files in repository
- **No deployment configuration**: No Dockerfile, no vercel.yaml, development-focused only

## Fragile Dependencies
- **Next.js 14.2.35** — latest at time of sprint, but no lock-file guarantees for future upgrades
- **TailwindCSS 3.4.1** — design tokens in `tokens.css` must mirror `tailwind.config.ts` manually; any drift breaks UI
- **eslint-config-next@14.2.35** — coupled to Next.js version

## Security Risks
- **Development-only state**: All features are unconnected; no risk of production data leakage, but also no guardrails if features are enabled prematurely
- **CSP in next.config.mjs**: Well-configured with restrictive directives (frame-ancestors 'none', base-uri 'self', form-action 'self', object-src 'none')
- ** .gitignore**: Properly protects `.env`, `secrets*`, `*.key`, `*.crt`, `credentials*`, `service-account*`
- **No input validation** beyond TypeScript types — if API routes are added later without validation, injection risks emerge

## Areas Requiring Rebuild
- **Full backend**: Orders, reservations, KDS, authentication, payments — none exist; would need complete implementation from scratch
- **Database schema and migrations**: Prisma not used; would need design and implementation
- **Session and auth system**: Supabase planned but not wired; would need full implementation
- **RBAC enforcement**: Roles defined but not enforced server-side; would need middleware and route protection

## Confirmed Findings vs Assumptions
- **Confirmed**: Next.js App Router, React 18, TypeScript, 5 dev roles, design tokens in `src/styles/tokens.css`, `/api/health` endpoint, CSP headers, `.gitignore` protections, vitest configured with no test files, Supabase placeholders in `.env.example`
- **Assumed**: No production data (health endpoint reports "not-configured" for database); no secrets committed (per .gitignore and .env.example guidance); frontend contracts will remain stable per §24 comments