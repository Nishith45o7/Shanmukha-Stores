# Design System & UI/UX Guidelines — Shanmukha Stores

## 1. Brand Identity & Visual Language
Shanmukha Stores presents an organic, premium, and welcoming atmosphere. The visual aesthetic balances earthy botanical greens with crisp neutrals and subtle golden accents, conveying natural freshness, purity, and trust.

---

## 2. Color Palette & Tokens

```css
:root {
  /* Brand Primary */
  --primary-green: #2c7a4b;       /* Fresh Botanical Green */
  --primary-green-dark: #1f5735;  /* Deep Forest Hover */
  --primary-green-light: #e8f5ed; /* Soft Mint Background Tint */
  
  /* Accents */
  --accent-gold: #d4a373;         /* Warm Organic Accent */
  --accent-gold-light: #fefae0;   /* Light Gold Highlight */
  --accent-red: #e63946;          /* Danger / Out of Stock / Alerts */
  --accent-amber: #f4a261;        /* Warning / Few Left Notice */

  /* Neutral Spectrum */
  --surface-base: #f8f9fa;        /* Page Canvas Background */
  --surface-card: #ffffff;        /* Pure White Card Surfaces */
  --text-main: #1a1a1a;           /* Crisp High-Contrast Charcoal */
  --text-muted: #6c757d;          /* Secondary Grey */
  --border-subtle: #e9ecef;       /* Light Dividers */
  --border-focus: #2c7a4b;        /* Active Input Outline */
}
```

---

## 3. Typography
- **Primary Typeface**: Modern sans-serif stack (`'Inter'`, `'Segoe UI'`, system-ui, `-apple-system`, Roboto, sans-serif).
- **Scale**:
  - `Hero Title`: 2.5rem (40px), bold (700)
  - `Section Heading (h2)`: 1.75rem (28px), semi-bold (600)
  - `Card Heading (h3)`: 1.125rem (18px), semi-bold (600)
  - `Body Text`: 1rem (16px), normal (400), line-height 1.6
  - `Caption / Badge`: 0.75rem – 0.85rem (12–14px), medium (500)

---

## 4. UI Components

### 4.1 Product Cards
- **Aspect Ratio**: Always `1:1` square container for the product image.
- **Image Fit**: `object-fit: cover` with subtle zoom on hover (`transform: scale(1.05); transition: 0.3s ease;`).
- **Badges**:
  - `In Stock`: Soft mint badge with dark green text.
  - `Out of Stock`: Light red tint with bold crimson text.
- **Cart CTA**: High-visibility pill button with smooth lift hover (`transform: translateY(-2px);`).

### 4.2 Buttons & Interactive Elements
- **Primary Button**: Solid `--primary-green` background with white text, 8px border-radius, subtle shadow.
- **WhatsApp Button**: Branded WhatsApp green (`#25D366`) with WhatsApp SVG icon.
- **Google Sign-In Button**: Clean white card styling with official 4-color Google 'G' icon and clear hover shadow.

### 4.3 Floating Widgets
- **WhatsApp Support**: Floating button at bottom-right with pulse micro-animation.
- **Floating Cart**: Collapsible side drawer with live cart item counter badge.

---

## 5. Micro-Animations & Feedback
- **Transitions**: Standard `cubic-bezier(0.4, 0, 0.2, 1)` easing across hover and focus states (150ms–300ms).
- **Toast Notifications**: Crisp top-right sliding toasts for cart additions, wishlist updates, and form submissions.
- **Empty States**: Friendly illustrations with clear call-to-action buttons (e.g. "Your cart is empty — Explore Products").
