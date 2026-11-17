# Workwise HR — multi-tenant HR & Payroll SaaS

A complete HR platform for many companies at once: **web app** for HR/admins and staff, an **Android app** for employees, and a **NestJS API** with strict tenant isolation, roles and subscription plans.

```
apps/
  api/      NestJS 11 · Drizzle ORM · PostgreSQL · JWT · pdfkit · Billplz
  web/      React 19 · Vite · TanStack Query · React Router
  mobile/   Expo (React Native) · Expo Router · push notifications · GPS clock-in
```

## Apps (modules)

| Area | Apps |
|---|---|
| People | **Profiles** (directory + employee records), **Onboarding** (checklists from templates), **Performance** (review cycles, self/manager reviews, goals), **Training** (courses, assignments, progress) |
| Time | **Attendance** (GPS clock-in with office geofence, daily register, monthly summary), **Leave** (requests, approvals, balances, holidays), **Timesheets** (hours by project, approvals), **Shifts** (weekly roster, shift types) |
| Money | **Payroll** (monthly runs, adjustments, finalize/paid, bank CSV, PDF payslips), **Payslips** (self-service), **Claims** (approved claims are paid through the next payroll run) |
| Hiring | **Recruitment** (candidate pipeline, hire → employee + onboarding), **Job Board** (public careers page per company: `/careers/<slug>`) |
| Engagement | **Feed** (posts, likes, comments, announcements), **Surveys** (anonymous pulse surveys with results), **Services** (HR helpdesk tickets) |
| Work | **Tasks** (assign, track, kanban), **Meetings** (schedule, invite, RSVP, 15-min reminders) |
| Insights | **Reporting** (headcount, turnover, payroll cost, leave, claims, attendance; CSV export) |
| Platform | **Notifications** (in-app + Expo push), **Billing** (plans, Billplz checkout), **Super-admin** (all tenants, plans, revenue) |

### Roles
- **Owner / HR** – everything in their company (Owner also manages billing and owners).
- **Manager** – approves leave, claims and timesheets of their **direct reports**; plans shifts; assigns tasks and goals.
- **Employee** – self-service: clock in, payslips, leave, claims, tasks, meetings, surveys, helpdesk.
- **Super-admin** (platform) – sees all companies, changes plans, suspends tenants.

### Plans (edit in `apps/api/src/common/plans.ts`, then re-run the seed)
| Plan | Price | Employees | Apps |
|---|---|---|---|
| Free | RM 0 | 5 | Profiles, Attendance, Leave, Feed, Tasks, Meetings |
| Pro | RM 99/mo | 50 | + Payroll, Claims, Timesheets, Shifts, Onboarding, Services, Reporting |
| Business | RM 249/mo | Unlimited | Everything incl. Recruitment/Job Board, Performance, Training, Surveys |

Each company can also switch individual apps off in **Settings → Apps**.

## How tenancy and security work
- Every tenant table has `company_id`; every query is scoped by the company in the caller's token. `apps/api/scripts/smoke.sh` exercises roles and cross-tenant access end to end.
- The auth guard re-reads the membership, company and subscription **on every request**, so role changes, deactivation, suspension and plan expiry apply immediately.
- Passwords are bcrypt-hashed; JWTs are signed with `JWT_SECRET`; login and invite endpoints are rate-limited.
- Billplz callbacks are verified with the X-Signature HMAC; payment activation is idempotent.
- Survey responses store only a salted hash of the respondent (anonymous surveys never store names).

## Payroll rules
`apps/api/src/modules/payroll/engine.ts` (unit-tested):
- daily rate = basic ÷ working days per month; hourly = daily ÷ hours per day
- overtime = hourly × OT hours × OT multiplier (OT hours come from attendance)
- unpaid days = absences + ½ × half days + approved **unpaid** leave (working days only)
- statutory contributions = min(gross, wage cap) × rate — defaults are EPF 11%/13%, SOCSO 0.5%/1.75% (cap RM6,000), EIS 0.2%/0.2% (cap RM6,000), editable per company
- PCB (income tax) is a fixed monthly amount per employee, overridable per run
- approved claims are added as non-taxable reimbursements

> ⚠️ The statutory calculation is a **simplified flat-percentage method**. The official EPF/SOCSO/EIS tables use wage bands and EPF employer drops to 12% above RM5,000. Check figures against official tables before paying, or replace `computePayslip` with table-based lookups.

---

## Run it locally (works in Termux)

Requirements: Node 20+ and PostgreSQL 14+.

```bash
# Termux
pkg install nodejs-lts postgresql
initdb $PREFIX/var/lib/postgresql && pg_ctl -D $PREFIX/var/lib/postgresql start
createdb hrsaas
```

### 1. API
```bash
cd apps/api
cp .env.example .env          # set DATABASE_URL and a long JWT_SECRET; BILLING_DEV_MODE=true for local
npm install
npm run db:migrate            # applies SQL in ./drizzle (pure Node — no native engines)
npm run db:seed -- --demo     # plans, super-admin, and a demo company
npm run start:dev             # http://localhost:3000/api
npm test                      # payroll engine + Billplz signature tests
```
Demo logins (password `Demo1234!`): `owner@demo.test`, `hr@demo.test`, `manager@demo.test`, `staff@demo.test`.
Super-admin: `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` from `.env`.

Schema changes: edit `src/db/schema.ts`, run `npm run db:generate` (creates a new SQL migration), then `npm run db:migrate`.

### 2. Web
```bash
cd apps/web
npm install
npm run dev                   # http://localhost:5173 (proxies /api to :3000)
```

### 3. Android app
```bash
cd apps/mobile
cp .env.example .env          # EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:3000
npm install
npx expo start                # scan the QR with Expo Go
```
Everything except push notifications works in Expo Go. For push and a real APK, use EAS (builds in the cloud — no Gradle/glibc issues on Termux):

```bash
npm i -g eas-cli
eas login
eas init                      # put the project id in .env as EAS_PROJECT_ID
# set EXPO_PUBLIC_API_URL in eas.json → build.preview.env / build.production.env
npm run build:apk             # installable APK for testing
npm run build:aab             # Play Store bundle
```
Staff join by opening their **invitation link** (Team & access → Invite) in the app's "I have an invite" tab, or by signing in.

---

## Deploy

### Docker (one server)
```bash
cp apps/api/.env.example apps/api/.env    # fill in JWT_SECRET, WEB_URL, API_URL, CORS_ORIGINS, Billplz keys
DB_PASSWORD=strong-password docker compose up -d --build
docker compose exec api node dist/db/seed.js         # plans + super-admin (add --demo for sample data)
```
Web on `:8080` (nginx serves the SPA and proxies `/api`), API on `:3000`. Put both behind HTTPS (Caddy, Nginx, Cloudflare Tunnel).

### Managed
- **API** → Railway / Render / Fly.io (`apps/api`, build `npm run build`, start `node dist/db/migrate.js && node dist/main.js`).
- **Database** → Neon / Supabase / Railway Postgres (`DATABASE_URL`).
- **Web** → Vercel / Cloudflare Pages (`apps/web`, build `npm run build`, output `dist`, env `VITE_API_URL=https://api.yourdomain.com`, SPA fallback to `index.html`).

### Billplz
1. Create a collection in Billplz and copy the API key, collection ID and X-Signature key into the API `.env`.
2. Set `API_URL` to the public API URL (Billplz posts to `/api/billing/billplz/callback` and redirects to `/api/billing/billplz/return`).
3. `BILLPLZ_SANDBOX=false` for live payments. Plans are prepaid (1, 3, 6 or 12 months; 12 months = 10× monthly).

## API overview
All routes are under `/api` and need `Authorization: Bearer <token>` unless marked public.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register` · `POST /auth/login` · `GET /auth/me` · `POST /auth/switch` · `GET /auth/invite/:token` · `POST /auth/accept-invite` · `POST /auth/password` |
| Company | `GET/PATCH /company` · `PUT /company/statutory` · `/company/leave-types` · `/company/holidays` |
| Team | `/team/members` · `/team/invites` · `POST /team/invites/all-employees` |
| People | `/employees` · `/departments` · `/me/profile` |
| Time | `/attendance` · `/attendance/summary` · `/me/attendance` · `POST /me/attendance/clock` · `/leave/requests` · `/leave/balances` · `/timesheets` · `/shifts/roster` · `PUT /shifts/assign` |
| Money | `/payroll/runs/:period` (`/generate`, `/status`, `/payslips/:employeeId`, `/bank.csv`, `/summary.csv`, `/payslips.pdf`) · `/payslips/mine` · `/payslips/:id/pdf` · `/claims` |
| Hiring | `/recruitment/jobs` · `/recruitment/applications` · `POST /recruitment/applications/:id/hire` · public `GET /public/careers/:slug`, `POST /public/careers/:slug/jobs/:id/apply` |
| Growth | `/onboarding` · `/performance/cycles|reviews|goals` · `/training/courses|enrollments` |
| Engagement | `/feed` · `/surveys` · `/services` |
| Work | `/tasks` · `/meetings` (`/respond`, `/people`) |
| Other | `/home` · `/notifications` (`/read`, `/push-token`) · `/reports/overview` · `/billing` · `/admin/*` (super-admin) · `GET /health` |
