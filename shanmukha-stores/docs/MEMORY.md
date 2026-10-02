# Project Memory & Architecture Decision Records (ADR) — Shanmukha Stores

## 1. Project Overview & Context
- **Name**: Shanmukha Stores
- **Primary Domain**: `shanmukhastores.in` / `www.shanmukhastores.in`
- **Deployment Platform**: Vercel (Serverless Node.js with `vercel.json`)
- **Primary Database**: PostgreSQL hosted on Supabase (ap-northeast-2 region) with transaction pooling on port `6543`.
- **Domain Registrar**: GoDaddy

---

## 2. Key Architecture Decision Records (ADRs)

### ADR 001: Supabase Connection Pooling on Vercel
- **Context**: Vercel serverless functions spin up ephemeral instances which quickly exhaust native PostgreSQL connection limits.
- **Decision**: Always use the pooled connection string with `pgbouncer=true` on port `6543` for standard app queries (`DATABASE_URL`), and reserve port `5432` (`DIRECT_URL`) strictly for long-running schema migration scripts.

### ADR 002: Security Headers vs. Helmet
- **Context**: The standard `helmet` package caused CSP and resource-blocking conflicts with inline EJS styles and dynamic SVG icons.
- **Decision**: Replaced helmet with tailored security middleware in `server.js` (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and customized CORS) to ensure smooth asset loading while maintaining strict browser protections.

### ADR 003: Dual Google OAuth Architecture
- **Context**: Modern web apps require instant Google One-Tap/Popups without losing traditional redirect compatibility for mobile browsers.
- **Decision**: Implemented dual handling in `routes/authRoutes.js`:
  1. `POST /auth/google` using Google Identity Services (GIS) client token validation.
  2. `GET /auth/google` with fallback redirect to `GET /auth/google/callback` using `google-auth-library`'s `OAuth2Client`.

### ADR 004: Stock Privacy & Aesthetic Integrity
- **Context**: Displaying raw inventory counts (e.g. "Only 2 left") cluttered the card layouts and exposed internal inventory volumes to competitors.
- **Decision**: Enforced an aesthetic policy across all EJS views to only render discrete status tags ("In Stock" or "Out of Stock") and enforced `1:1` aspect-ratio containers on all product imagery.

---

## 3. Important Credentials & Service Reference

| Service | Identifier / Usage | Location |
| :--- | :--- | :--- |
| **Google OAuth Client ID** | `1091454272955-27b02ce62gk8p6nue1seu36kvrmhss47.apps.googleusercontent.com` | `.env` & Vercel Secrets |
| **Vercel A-Record Target** | `76.76.21.21` | GoDaddy DNS (`@`) |
| **Vercel CNAME Target** | `cname.vercel-dns.com` | GoDaddy DNS (`www`) |
| **Database Pool** | `aws-0-ap-northeast-2.pooler.supabase.com:6543` | `DATABASE_URL` |
| **SMS Gateway** | MSG91 (Authentication & OTP verification) | `utils/msg91Service.js` |
| **WhatsApp Bot** | Baileys multi-device socket session | `services/whatsappBot.js` |
