## 20. Technical Documentation
- **Code comments** reference `HANSAN-UI-UX-DESIGN-DIRECTION.md`, §11 through §27
- **`.env.example`**: "NEVER commit real secrets", "Real backend wiring happens post-UI-freeze (§24)"
- **No CHANGELOG**, no API documentation beyond health endpoint
## 19. Security Controls
- **next.config.mjs**: CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS, X-Permitted-Cross-Domain-Policies
- **.gitignore**: protects `.env`, `secrets*`, `*.key`, `*.crt`, `credentials*`, `service-account*`, `node_modules/`, `.next/`
- **No authentication** yet, **no rate limiting**, **no input validation** beyond TypeScript
## 18. Deployment Configuration
- **Start command**: `next start`
- **No Dockerfile**, no `vercel.yaml`
- **Development-focused sprint**
## 17. CI/CD Workflows
- **Build**: `next build`, **Lint**: `next lint`, **Test**: `vitest run`
- **No GitHub Actions** configuration found
## 16. Testing Infrastructure
- **Framework**: `vitest@^2.1.9`
- **Config**: `vitest.config.ts` with `@/src` alias, `include: ["tests/**/*.test.ts"]`, environment: "node"
- **Test files**: None found in repository
- **Linting**: `eslint@^8` with `eslint-config-next@14.2.35`
- **Type checking**: `tsc --noEmit`
## 15. Realtime Mechanisms
- **Supabase** referenced in `next.config.mjs` and `.env.example`
- **Realtime channels**: Not configured
## 14. Orders and KDS Architecture
- **Order flow conceptual**: pos - type → table → menu → cart → payment → receipt; kds - new → preparing → ready → completed
- **Order persistence**: Not implemented
- **KDS interface**: Not present in UI
- **Order-KDS sync**: Not implemented
## 13. Reservation Persistence
- **Status**: Not implemented
- **No reservation model** or schema
- **No reservation API routes**
- **Persistence layer**: Not present (Prisma not used in V2)
## 12. Tenant and Outlet Isolation
- **Status**: Not implemented
- **No tenant discriminator** in schema or middleware
- **No outlet/branch** partitioning logic
- **Multi-tenant readiness**: Not present in V2 foundation
## 11. RBAC and Permission Enforcement
- **5 roles** defined but **NOT enforced server-side**
- **Role-based UI** present but no access control
- **Contracts**: "will be replaced by real auth without redesigning the frontend"
## 10. Session Architecture
- **Status**: Not implemented
- **Mechanism**: To be built on Supabase Auth
- **No session store** (Redis, database, etc.)
- **No session middleware** in Next.js config
- **Client-side only** role navigation (no server-side session enforcement)
## 9. Authentication Implementation
- **Status**: Development-only planned
- **Method**: Supabase integration planned (`.env.example` placeholders)
- **5 roles**: developer, owner, pos, kds, finance (`src/types/roles.ts`)
- **No session middleware**, no token-based auth
## 8. PostgreSQL Integration
- **Status**: Not configured
- **Configuration**: `DATABASE_URL` placeholder in `.env.example` only
## 7. Prisma Schema and Migration History
- **Prisma schema**: **NOT PRESENT** in V2
- **Migration history**: None
- **Database integration**: "not-configured" per health endpoint
## 6. API Routes and Service Layer
- **Confirmed**: `GET /api/health` - system health check
- **Missing**: Orders, reservations, KDS, auth callbacks, payment processing
- **Service layer**: Not present
## 5. Backend Architecture
- **Minimal backend** - only `/api/health` endpoint
- **Health endpoint**: database "not-configured", auth "development-only-planned", payments "not-configured"
- **No service layer** implemented
## 4. Frontend Architecture
- **Next.js App Router** (`src/app/`)
- **Root layout**: `src/app/Layout.tsx` - "HANSAN — F&B Operations Platform"
- **Home page**: `src/app/page.tsx` - role-based development workspace
- **Global styles**: `src/app/globals.css` - Tailwind + CSS custom properties
- **Design system**: `src/styles/tokens.css` - single source of truth for colors, surfaces, elevation, radius, typography, z-index, spacing, transitions
- **API routes**: `src/app/api/` - minimal; `/api/health` only confirmed endpoint
- **Client-side routing** via `next/link`
## 3. Application Directory Structure
- `src/app/` - Next.js App Router pages and API routes
- `src/components/` - UI component directory
- `src/types/` - Type definitions (`DevRole`, `DevAccount`)
- `src/styles/tokens.css` - HANSAN design tokens
- `tests/` - vitest configured, no test files found
- `prisma/` - **Not present** in V2
# HANSAN V2 Technical Inventory

## 1. Frameworks and Runtime
- **Next.js 14.2.35** (App Router pattern) - confirmed via `next.config.mjs`
- **React 18** - confirmed via `package.json`
- **TypeScript** - `strict: true` in `tsconfig.json`

## 2. Package Manager and Dependencies
- **Package manager**: `npm`
- **Dependencies**: `next@14.2.35`, `react@^18`, `react-dom@^18`
- **DevDependencies**: `@types/node@^20`, `@types/react@^18`, `@types/react-dom@^18`, `eslint@^8`, `eslint-config-next@14.2.35`, `postcss@^8`, `tailwindcss@^3.4.1`, `typescript@^5`, `vitest@^2.1.9`
# 01-V2-TECHNICAL-INVENTORY

## 1. Frameworks and Runtime
- **Next.js 14.2.35** (App Router pattern) - confirmed via `next.config.mjs`
- **React 18** - confirmed via `package.json`
- **TypeScript** - confirmed via `tsconfig.json` with `strict: true`
- **Node.js** - ^20 (from `@types/node` dependency)

## 2. Package Manager and Dependencies
- **Package manager**: `npm` (standard for Next.js projects)
- **Dependencies** (from `package.json`):
  - `next@14.2.35`
  - `react@^18`
  - `react-dom@^18`
- **DevDependencies**:
  - `@types/node@^20`
  - `@types/react@^18`
  - `@types/react-dom@^18`
  - `eslint@^8`
  - `eslint-config-next@14.2.35`
  - `postcss@^8`
  - `tailwindcss@^3.4.1`
  - `typescript@^5`
  - `vitest@^2.1.9`