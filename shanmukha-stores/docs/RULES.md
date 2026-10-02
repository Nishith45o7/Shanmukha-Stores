# Development Rules & Security Guardrails — Shanmukha Stores

## 1. Security & Protection Rules (Critical)

1. **SQL Injection Prevention**:
   - **NEVER** use string interpolation or concatenation in SQL queries (`query(`SELECT * FROM users WHERE id = ${id}`)` is strictly forbidden).
   - **ALWAYS** use parameterized queries with `$1, $2, ...` and an explicit values array (`query('SELECT * FROM users WHERE id = $1', [id])`).
2. **Access Control & RBAC**:
   - All admin routes (`/admin/*`) **must** be protected by `isAdmin` or `isStaff` middleware from `authMiddleware.js`.
   - Never expose mutation or deletion endpoints (products, users, categories, orders) without verifying session role is `'admin'`.
3. **Secrets & Environment Isolation**:
   - **NEVER** commit `.env` files, database passwords, or OAuth client secrets to version control.
   - Always update `.env.example` when introducing new environment variables.
4. **Rate Limiting**:
   - Apply `authLimiter` to all authentication endpoints (`/auth/login`, `/auth/register`, `/auth/send-otp`, `/auth/google`) to prevent credential stuffing and OTP spam.

---

## 2. Database Practices

1. **Connection Pool Management**:
   - Always query using the connection pool export from `config/db.js`.
   - When acquiring a dedicated client via `pool.connect()`, always wrap usage in a `try...finally` block and call `client.release()`.
2. **Schema Migrations**:
   - Never perform destructive manual SQL changes directly in production without a versioned migration script in `scripts/` or root (`migrate_*.js`).
   - Foreign keys must use proper cascading rules or nullification to avoid orphan records.

---

## 3. Frontend & Styling Rules

1. **Vanilla CSS Standard**:
   - Do not introduce Tailwind or heavy utility frameworks. Maintain styles cleanly in `public/css/style.css`.
   - Rely on CSS Custom Properties (`--primary-green`, `--surface-card`, `--text-main`, etc.) for consistency.
2. **Visual Aesthetics & Polish**:
   - All product images must maintain a strict `1:1` aspect-ratio container with `object-fit: cover` to prevent staggered card rows.
   - Never display raw stock numbers to regular visitors (privacy rule: show only "In Stock" or "Out of Stock").
   - Hide empty star ratings ("0.0") on products without reviews to maintain an elite, premium store appearance.
3. **Responsive & Mobile-First**:
   - Test all pages at 360px viewport width (standard Android phone) up to 1440px desktop.

---

## 4. WhatsApp & External Services

1. **Resilience & Circuit Breaking**:
   - Any external API call (MSG91, WhatsApp service, email dispatch) must be wrapped in `circuitBreaker.js` or a fallback `try...catch` so third-party downtime never crashes core shopping or checkout.
2. **Asynchronous Dispatch**:
   - Notifications and background logs must not block the HTTP response cycle. Send responses early and dispatch notifications asynchronously.
