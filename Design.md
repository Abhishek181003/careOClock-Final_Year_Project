# CareOClock — Landing Page Design System

> Last updated: 2026-09-24

---

## 1. Design Philosophy

CareOClock's landing page follows a **"calm confidence"** design language. The platform serves elderly patients, family caregivers, and physicians — three audiences with very different needs but one shared priority: **trust**.

### Core Principles

| Principle | Implementation |
|-----------|---------------|
| **Warmth over clinical** | Warm photography, golden accents, rounded corners — the page feels like a home, not a hospital |
| **Clarity over cleverness** | Large type, plain language, obvious CTAs — accessibility is a design feature, not an afterthought |
| **Calm over urgent** | Smooth animations, no autoplay, no aggressive popups — we earn attention, we don't demand it |
| **Proof over promise** | Testimonials, step-by-step transparency, real imagery — we show, not just tell |

---

## 2. Color Palette

### Primary Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `brand` | `#1D6F64` | Primary teal — buttons, icons, links, also the "Stable" clinical color |
| `brand-dark` | `#154F47` | Hover states, emphasis, deep backgrounds |
| `brand-light` | `#BFE3D3` | Soft mint for badges, light fills, subtle backgrounds |

### Accent Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `dawn` / warm gold | `#E8A24D` | Primary CTA buttons, hero highlights, the `<em>` accent in headlines |
| `dusk` | `#5B5A8C` | Evening check-in wayfinding (not used on landing page) |

### Neutrals

| Token | Hex | Usage |
|-------|-----|-------|
| `paper` | `#F6F7F5` | Page background — warm off-white, not sterile |
| `surface` | `#FFFFFF` | Cards, modals, elevated surfaces |
| `ink` | `#1F2E2C` | Primary text — deep teal-charcoal, softer than pure black |
| `ink-soft` | `#4B5A57` | Secondary text, captions |
| `line` | `#DCE4E1` | Borders, dividers |

### Dark Section Colors

| Token | Hex | Usage |
|-------|-----|-------|
| Deep navy | `#0F2027` | Dark hero overlay, CTA section, footer |
| Gradient mid | `#154F47` → `#1D6F64` | Dark-section gradient transitions |

### Color Harmony Rules

1. **Gold (`#E8A24D`) is reserved for primary CTAs and emphasis** — never use it for body text or decorative fills
2. **Teal (`#1D6F64`) handles everything else** — icons, links, secondary buttons, border accents
3. **Dark sections** always use the `#0F2027` → `#1D6F64` gradient, never flat black
4. **Clinical tier colors** (`stable`, `moderate`, `high`, `critical`) are **never** used on the landing page — those belong exclusively to the patient dashboard

---

## 3. Typography

### Font Stack

| Role | Font | Weights | Reasoning |
|------|------|---------|-----------|
| Display / Headlines | **Manrope** | 700, 800 | Geometric, modern, personality in headlines |
| Body / UI | **Noto Sans** | 400, 500, 600 | Wide script coverage (Devanagari, Indic) — functional choice for Indian user base |

### Type Scale

| Token | Size | Line Height | Usage |
|-------|------|-------------|-------|
| `hero-title` | `clamp(2.2rem, 5vw, 3.8rem)` | 1.12 | Hero headline only |
| `section-title` | `clamp(1.8rem, 3.5vw, 2.8rem)` | 1.2 | Section headings |
| `benefit-title` | `1.2rem` | 1.4 | Card titles |
| `body` | `1rem–1.1rem` | 1.65–1.75 | Paragraphs, descriptions |
| `eyebrow` | `0.85rem` | 1 | Section labels, badges |
| `caption` | `0.75rem–0.85rem` | 1.5 | Disclaimers, footer text |

### Typography Rules

1. **Headlines always use `letter-spacing: -0.02em` to -0.03em** — tighter tracking looks more premium at large sizes
2. **Body text never drops below 1rem (16px)** — WCAG floor for elderly users
3. **`<em>` in hero = gold accent**, not italic — emphasis through color, not slant

---

## 4. Layout & Spacing

### Container

- Max width: `1200px` centered
- Horizontal padding: `clamp(1.5rem, 6vw, 5rem)` — fluid between mobile and desktop

### Section Padding

- Vertical: `clamp(4rem, 8vw, 7rem)` — generous breathing room between sections

### Grid Patterns

| Section | Grid | Gap |
|---------|------|-----|
| Benefits | `auto-fit, minmax(280px, 1fr)` | `2rem` |
| Steps | `4 columns` → `2 columns` → `1 column` | `2rem` |
| Roles | `auto-fit, minmax(300px, 1fr)` | `2rem` |
| Testimonials | `auto-fit, minmax(320px, 1fr)` | `2rem` |
| Footer | `2fr 1fr 1fr 1fr` → `1fr 1fr` → `1fr` | `3rem` |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `ritual` | `20px` | Patient-facing cards, benefit cards |
| `clinical` | `4px` | Doctor dashboard (not used on landing) |
| `pill` | `50px` | Buttons, badges, navbar CTA |
| `circle` | `50%` | Step numbers, avatars |

---

## 5. Visual Effects

### Parallax

Two parallax layers on the landing page:

1. **Hero background** — moves at `0.35` speed relative to scroll
2. **Family care image band** — moves at `0.25` speed

Implementation: `IntersectionObserver` + `getBoundingClientRect()` calculates offset, applied as CSS `transform: translateY()`. Uses `will-change: transform` for GPU compositing.

### Scroll-Reveal Animations

All content below the fold uses `IntersectionObserver` to trigger CSS transitions:

| Class | Effect | Duration |
|-------|--------|----------|
| `reveal` | Fade + slide up 40px | 0.7s ease |
| `reveal-left` | Fade + slide from left 50px | 0.7s ease |
| `reveal-right` | Fade + slide from right 50px | 0.7s ease |
| `stagger-children` | Each child delays +0.1s | 0.5s ease per child |

**Threshold:** Elements trigger when 12–15% visible in viewport.

### Glassmorphism Navbar

```css
background: rgba(15, 32, 39, 0.85);
backdrop-filter: blur(16px) saturate(1.6);
```

Transitions from fully transparent to frosted glass on scroll (threshold: 60px).

### Micro-Animations

| Element | Animation | Details |
|---------|-----------|---------|
| Hero badge dot | `pulse-glow` | Green dot pulses continuously |
| Scroll indicator | `scrollBounce` | Mouse wheel bounces down |
| CTA buttons | `hover:translateY(-3px) + scale(1.02)` | Lift + grow on hover |
| Benefit cards | Top border `scaleX(0→1)` on hover | Teal bar reveals from left |
| Step numbers | `hover:scale(1.1)` | Grow on hover |
| Nav links | Underline `width(0→100%)` on hover | Gold underline slides in |

### Reduced Motion

All animations respect `prefers-reduced-motion: reduce`:
- Animations are set to `duration: 0.001ms`
- Scroll reveals show immediately without transition
- Hover effects remain (they're user-initiated)

---

## 6. Page Sections (Top to Bottom)

### 6.1 Navigation Bar
- Fixed, glassmorphism on scroll
- Brand name with gold "O" accent
- In-page anchor links + Login/Register CTA
- Mobile: hamburger toggle, full-width dropdown

### 6.2 Hero Section
- **Full viewport height** with parallax background image
- Gradient overlay (dark navy → teal → gold, diagonal)
- Badge: "Trusted Home Health Monitoring" with live dot
- Headline with gold `<em>` accent
- Subtitle: conversational, benefit-driven
- Dual CTA: Primary (gold, "Start Your First Check-in") + Secondary (outline, "See How It Works")
- Stats strip: 2 min / 2× daily / 100% free
- Scroll indicator (mouse icon)

### 6.3 Trust Strip
- Horizontal bar of trust signals: encrypted, consent-first, AI-powered, no wearable
- Icon + text pairs, centered

### 6.4 Benefits Section
- 6 benefit cards in responsive grid
- Each: icon + title + descriptive text
- Hover: card lifts + teal top-border reveals

### 6.5 How It Works
- 4 numbered steps with connecting gradient line
- Each: numbered circle + title + text
- Centered layout, visual flow left-to-right

### 6.6 Parallax Image Band
- Full-width image (family + tablet) with slow parallax
- Dark overlay + centered text: "Keeping families connected through care"
- Visual breathing room between content sections

### 6.7 Who It's For (Roles)
- Dark gradient background with radial light accents
- 3 glass cards: Patient / Family / Doctor
- Each: icon + title + benefit text + CTA link
- Glassmorphism cards with gold hover borders

### 6.8 Social Proof
- 3 testimonial cards with realistic quotes
- Avatar initials + name + role
- Staggered reveal animation

### 6.9 Final CTA
- Dark gradient with radial decorative orbs
- Strong headline + subtitle + dual buttons
- Medical disclaimer below CTAs

### 6.10 Footer
- Dark background (`#0A1A1F`)
- 4-column grid: brand desc / product / account / support
- Bottom bar: copyright + disclaimer

---

## 7. Image Assets

| File | Location | Usage |
|------|----------|-------|
| `hero-bg.jpg` | `/public/assets/images/` | Hero section parallax background |
| `family-care.jpg` | `/public/assets/images/` | Parallax image band (mid-page) |
| `doctor-care.jpg` | `/public/assets/images/` | Available for future use (doctor dashboard preview) |

All images are high-quality, realistic photography — **never illustrations or stock vectors**. They convey warmth, trust, and real-world home care scenarios.

---

## 8. Accessibility

| Feature | Implementation |
|---------|---------------|
| Skip to content | Hidden link, visible on keyboard focus |
| Focus visible | 3px brand-color outline, 2px offset |
| Semantic HTML | `<nav>`, `<main>`, `<section>`, `<footer>`, `<h1>`→`<h3>` hierarchy |
| ARIA labels | Menu toggle, decorative images marked `role="presentation"` |
| Color contrast | All text passes WCAG AA (4.5:1 minimum) |
| Reduced motion | Full `prefers-reduced-motion` support |
| Font size | Minimum 16px body, clamp-based responsive scaling |
| Touch targets | All buttons ≥ 44×44px |

---

## 9. Performance Considerations

| Technique | Details |
|-----------|---------|
| Font preconnect | `<link rel="preconnect">` for Google Fonts CDN |
| Lazy loading | All below-fold images use `loading="lazy"` |
| Passive scroll listeners | All scroll handlers use `{ passive: true }` |
| GPU compositing | Parallax images use `will-change: transform` |
| Observer cleanup | All `IntersectionObserver` instances disconnect on unmount |
| Image format | JPEG for photographic content (good compression) |

---

## 10. File Structure

```
client/src/
├── pages/
│   ├── LandingPage.jsx    ← Main landing page component
│   └── LandingPage.css    ← All landing-specific styles
├── index.css              ← Global styles, fonts, Tailwind setup
└── config.js              ← Brand name, disclaimer text, support phone

client/public/
└── assets/images/
    ├── hero-bg.jpg
    ├── family-care.jpg
    └── doctor-care.jpg
```

---

## 11. Design Decision Log

| Decision | Rationale |
|----------|-----------|
| Separate CSS file vs Tailwind | Landing page needs custom animations, parallax, glassmorphism — raw CSS gives full control without fighting utility classes |
| Gold primary CTA, not teal | Teal is the brand color used everywhere — gold creates visual hierarchy and draws the eye to the action |
| Testimonials with initials, not photos | Avoids uncanny AI-generated faces; initials feel genuine and are universally inclusive |
| No autoplay video | Respects bandwidth, accessibility, and the "calm confidence" design principle |
| Dark hero overlay gradient | Ensures text readability over any background image; diagonal gradient adds depth without feeling heavy |
| Stats in hero, not a separate section | Social proof close to the CTA increases conversion; "2 min / 2× / 100% free" addresses top objections immediately |
