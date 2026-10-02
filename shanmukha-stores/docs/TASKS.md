# Roadmap & Task Tracker — Shanmukha Stores

## 1. Completed Tasks (Done)
- [x] **Complete Security Audit**: 100% parameterization of SQL queries across all routes (`server.js`, `routes/*`).
- [x] **RBAC Enforcement**: Hardened admin routes with strict `isAdmin` / `isStaff` session validation.
- [x] **Image Processing**: Integrated `sharp` for automatic WebP conversion and optimization.
- [x] **UI Polish Sprint**:
  - [x] Standardized 1:1 aspect ratio on product cards.
  - [x] Implemented stock privacy (hidden numerical counts, display "In Stock" / "Out of Stock").
  - [x] Cleaned up zero-rating display for new products.
- [x] **WhatsApp Checkout Engine**: Formatted order templates with itemized pricing, delivery address, and instant order broadcast.
- [x] **Dynamic UPI Payment**: Integrated Bharat UPI QR code generator for direct merchant payment.
- [x] **Google OAuth Integration**:
- [x] **Support & Legal Pages**:
  - [x] Created `/help` (Help Center & FAQs).
  - [x] Created `/shipping-policy` (Regional delivery zones & order thresholds).
  - [x] Created `/return-policy` (Returns, replacements & refund processing).
  - [x] Created `/privacy-policy` (Customer data protection & Google OAuth compliance).
  - [x] Created `/terms` (Terms of service agreement).
  - [x] Linked all pages in `footer.ejs`.
- [x] **Production Checklist Automation**:
  - [x] Created automated test runner `scripts/test-production-checklist.js`.
  - [x] Verified 100% test pass rate (28 automated test assertions covering Security, Navigation, Auth, RBAC, Cart, Delivery Rules, and Health).

---


## 2. In Progress / Immediate Next Steps (Current Sprint)
- [ ] **Custom Domain Live Verification**:
  - [ ] Complete GoDaddy WHOIS email validation.
  - [ ] Verify DNS A-record (`76.76.21.21`) and CNAME (`cname.vercel-dns.com`) propagation in Vercel.
  - [ ] Confirm SSL certificate activation on `https://shanmukhastores.in`.
- [ ] **Vercel Production Deployment**:
  - [ ] Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` to Vercel Environment Variables.
  - [ ] Trigger fresh redeployment on Vercel.
- [ ] **Live OAuth Smoke Test**:
  - [ ] Verify one-click Google Login flow on production domain `https://shanmukhastores.in/auth/login`.

---

## 3. Backlog / Future Enhancements
- [ ] **Automated Payment Gateway**: Integrate Razorpay or Cashfree webhook for automated payment verification alongside manual UPI QR.
- [ ] **PWA Support**: Add service worker and Web App Manifest for "Install as App" on Android and iOS.
- [ ] **Bulk Product Import**: CSV upload utility in the admin dashboard for bulk catalog updates.
- [ ] **Automated Email Invoices**: Generate downloadable PDF receipts sent via Nodemailer on order confirmation.
- [ ] **Customer Loyalty / Coupons**: Discount coupon code redemption engine during checkout.
