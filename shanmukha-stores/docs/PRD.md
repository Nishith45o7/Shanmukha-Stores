# Product Requirements Document (PRD) — Shanmukha Stores

## 1. Executive Summary
**Shanmukha Stores** is a production-grade, premium e-commerce platform designed for grocery, organic, and daily essential retail. The platform provides a seamless shopping experience for customers with swift checkout flows (including WhatsApp & direct UPI QR integration), role-based administration for inventory and order management, and secure multi-method authentication (Email/Password, Mobile OTP via MSG91, and Google OAuth).

---

## 2. Target Audience & Personas
- **Retail Customers**: Fast shopping, mobile-first experience, quick login (Google / OTP), transparent order tracking, and interactive WhatsApp order confirmation.
- **Store Administrators / Staff**: Centralized dashboard to manage products, categories, stock, banner announcements, orders, customer accounts, and audit governance.

---

## 3. Core Features & Capabilities

### 3.1 Storefront & Customer Experience
- **Homepage & Discovery**: Hero banners, categorized collections, featured products, and live search.
- **Product Details**: High-resolution image galleries, dynamic weight/variant pricing, stock status indicators, customer reviews, and ratings.
- **Cart & Wishlist**: Persistent cart (session & database backed), floating cart quick view, quantity controls, and wishlist toggling.
- **Checkout & Payments**:
  - Direct WhatsApp order placement with formatted receipt summary.
  - Dynamic UPI QR code generator for instant mobile payments.
  - Multi-address management with delivery preference selection.

### 3.2 Authentication & Security
- **Multi-Method Login**:
  - Email & Password with Bcrypt hashing.
  - Phone OTP verification powered by MSG91.
  - One-click Google Sign-In & Sign-Up via Google Identity Services.
- **Role-Based Access Control (RBAC)**: Distinct permissions for `customer`, `staff`, and `admin`.
- **Security Hardening**: Anti-brute-force rate limiters, strict CORS, parameterized PostgreSQL queries against SQL injection, and security headers.

### 3.3 Admin & Operations Dashboard
- **Product Management**: Multi-image upload with automated Sharp WebP compression, weight variants, stock counts, and categories.
- **Order Management**: Status tracking (`Pending`, `Confirmed`, `Shipped`, `Delivered`, `Cancelled`), payment verification badges, and WhatsApp dispatch.
- **Governance & Audit Logs**: Detailed tracking of admin operations (stock adjustments, role promotions, record deletions).
- **Customer Directory**: View customer profiles, order history, and account verification statuses.

---

## 4. Non-Functional Requirements
- **Performance**: Sub-1.5s page load times, optimized assets, server-side EJS rendering.
- **Scalability**: Stateless serverless deployment compatibility on Vercel with pooled PostgreSQL on Supabase.
- **Reliability**: Resilient circuit breakers for external service integrations (WhatsApp bot, MSG91 SMS).
- **Responsive Design**: Flawless layout across smartphones, tablets, and high-DPI desktop screens.
