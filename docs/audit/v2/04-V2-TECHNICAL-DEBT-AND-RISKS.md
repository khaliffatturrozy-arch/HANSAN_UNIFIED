# HANSAN V2 Technical Debt and Risks

## Technical Debt

### 1. No Prisma/ORM (High)
- No `prisma/` directory, no schema, no migrations
- `DATABASE_URL` is `.env.example` placeholder only
- All persistence features must be built from scratch

### 2. No Service Layer (High)
- Only `/api/health` endpoint exists
- No API routes for orders, reservations, KDS, inventory
- No business logic separation

### 3. Authentication Not Implemented (High)
- Supabase planned but only `.env.example` placeholders
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are placeholders
- No session middleware, no JWT, no server-side enforcement
- 5 development roles have UI-only access

### 4. No Session Architecture (Medium)
- No session store (Redis/DB), no middleware, client-side only

### 5. Zero Test Coverage (High)
- vitest configured but zero test files found
- `passWithNoTests: false` but no tests exist

### 6. No CI/CD (Medium)
- No GitHub Actions, manual build/test/deploy only
- Scripts exist (`next build`, `next lint`, `vitest run`) but no automation

### 7. No Deployment Config (Low-Medium)
- No Dockerfile, no `vercel.yaml`, development-focused only
- Start command: `next start`

### 8. Incomplete Security Controls (Low)
- CSP and headers are well-configured
- But no rate limiting, no input validation beyond TypeScript

### 9. No Tenant/Outlet Isolation (Medium)
- No tenant discriminator, no outlet partitioning
- Single-tenant by design only

## Fragile Dependencies

### Next.js 14.2.35 + TailwindCSS 3.4.1
- `src/styles/tokens.css` must manually mirror `tailwind.config.ts`
- Drift causes UI inconsistencies

### TypeScript strict mode
- Provides safety but may block legitimate refactors

## Security Risks

### Current State
- **Positive**: No production data, no secrets committed, all "not-configured"
- **Per**: `.gitignore` and `.env.example` guidance

### Risks if Features Added Prematurely
- API routes without input validation → injection
- Auth without session management → session fixation
- No rate limiting → brute force attacks
- No input sanitization → XSS, SQL injection

## Areas Requiring Rebuild

| Area | Action |
|------|--------|
| Full backend | Complete from scratch with proper architecture |
| Database schema | Design schema, choose ORM, implement migrations |
| Auth and session | Full Supabase Auth + session management |
| RBAC enforcement | Server-side middleware, route protection, permission checks |
| Multi-tenant support | Design and implement tenant isolation |
| Test suite | Write tests for critical paths |
| CI/CD pipeline | Set up GitHub Actions for build/test/deploy |
| Deployment config | Add Dockerfile, vercel.yaml, or platform config |

## Confirmed vs Assumptions

### Confirmed
- V2 is Phase 0 foundation sprint with no production backend
- Design token system well-implemented and consistent
- Security headers properly configured in next.config.mjs
- .gitignore properly protects sensitive files
- 5 development roles defined with DEV_ACCOUNTS mapping
- vitest configured but zero test files exist
- Supabase placeholders in .env.example only
- /api/health reports all backends as "not-configured"
- No Prisma/ORM, no database connection, no auth implementation
- Neumorphic elevation system documented and consistent

### Assumptions (not operationally verified)
- V2 will remain in development foundation state; no production data exposed
- Design token consistency between tokens.css and tailwind.config.ts will be maintained
- Role contracts ("contracts stay stable per §24") will hold during future redesign
- Supabase integration will be properly implemented in Phase 2
- No secrets stored in repository (per .gitignore and .env.example guidance)
- Future phases will add backend functionality following established patterns