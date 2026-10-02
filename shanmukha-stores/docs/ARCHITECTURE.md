# System Architecture — Shanmukha Stores

## 1. High-Level Architecture Overview

```
                      +-----------------------------+
                      |       Clients / Browsers    |
                      +--------------+--------------+
                                     |
                                     v HTTPS (shanmukhastores.in)
                      +-----------------------------+
                      |   Vercel Edge / Serverless  |
                      |      (api/index.js)         |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |       Express.js Server     |
                      |  - Middleware (Auth, Limit) |
                      |  - Routing Layers           |
                      |  - EJS View Rendering Engine|
                      +--------------+--------------+
                                     |
         +---------------------------+---------------------------+
         |                           |                           |
         v                           v                           v
+------------------+       +-------------------+       +-------------------+
|  Supabase PG DB  |       | Third-Party APIs  |       | Internal Services |
|  - Connection    |       | - Google OAuth    |       | - Baileys WA Bot  |
|    Pool (pg)     |       | - MSG91 (OTP)     |       | - Sharp Image Ops |
|  - Pooled: 6543  |       | - UPI QR Engine   |       | - Circuit Breaker |
+------------------+       +-------------------+       +-------------------+
```

---

## 2. Technology Stack

| Layer | Technologies Used | Description |
| :--- | :--- | :--- |
| **Runtime & Backend** | Node.js (v18+), Express.js | Core web server and REST/EJS routing |
| **Frontend Rendering**| EJS (Embedded JavaScript) | Server-Side Rendered (SSR) HTML templates |
| **Styling & Design**  | Vanilla Modern CSS | Custom CSS variables, responsive grid, micro-animations |
| **Primary Database**  | PostgreSQL on Supabase | Relational data persistence with connection pooling (`pg`) |
| **Deployment**        | Vercel Serverless Function | Serverless packaging via `vercel.json` and `api/index.js` |
| **Authentication**    | Session (`express-session`), Google OAuth (GIS), MSG91 OTP | Multi-provider customer and admin auth |
| **Asset Processing**  | Sharp | Automated image resizing and WebP conversion |
| **Automation**        | Baileys / WhatsApp Web | WhatsApp order dispatch and customer bot notification |

---

## 3. Directory Structure

```
shanmukha-stores/
├── api/
│   └── index.js              # Serverless entry point for Vercel
├── config/
│   └── db.js                 # PostgreSQL pg.Pool connection & retry logic
├── docs/                     # System documentation & developer guides
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── RULES.md
│   ├── DESIGN.md
│   ├── TASKS.md
│   └── MEMORY.md
├── middleware/
│   ├── authMiddleware.js     # isAuthenticated, isAdmin, isStaff, RBAC
│   └── ...                   # Upload & validation middlewares
├── public/
│   ├── css/style.css         # Unified design system & style tokens
│   ├── js/                   # Client-side scripts (google-auth.js, etc.)
│   └── uploads/              # Converted WebP product and banner images
├── routes/
│   ├── adminRoutes.js        # Protected administrative operations
│   ├── authRoutes.js         # Register, Login, OTP, Google OAuth
│   ├── cartRoutes.js         # Cart mutation & calculation endpoints
│   ├── orderRoutes.js        # Checkout, Order confirmation, Tracking
│   └── shopRoutes.js         # Products catalog, filtering, search, reviews
├── services/
│   └── whatsappBot.js        # Baileys automated WhatsApp messaging
├── utils/
│   ├── circuitBreaker.js     # Fault-tolerance wrapper for 3rd-party APIs
│   ├── upiQrGenerator.js     # Dynamic Bharat UPI QR code builder
│   ├── msg91Service.js       # SMS & OTP gateway client
│   └── mailer.js             # Nodemailer email dispatch
├── views/                    # EJS views (Storefront, Cart, Checkout, Admin)
├── server.js                 # Local & core Express app initialization
└── vercel.json               # Vercel deployment routing & rewrites
```

---

## 4. Database Schema Summary

1. **`users`**: Customer and staff credentials, phone numbers, Google OAuth IDs, roles (`customer`, `staff`, `admin`), verification flags.
2. **`products`**: Title, slug, description, category ID, base price, sale price, stock count, images (JSON array of WebP paths).
3. **`product_variants` / `product_weights`**: Weight options (e.g. 250g, 500g, 1kg) with variant-level pricing and stock overrides.
4. **`categories`**: Taxonomy hierarchy, display order, banner images.
5. **`orders`**: Order number, user ID, status, total amount, payment method (COD, UPI, WhatsApp), shipping address snapshot.
6. **`order_items`**: Line items per order linking product, variant, quantity, unit price.
7. **`addresses`**: Saved delivery addresses per customer.
8. **`reviews`**: Ratings, comments, user association, verified purchase badge.
9. **`governance_logs`**: Admin audit trail capturing who performed what sensitive action and when.
