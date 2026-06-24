# Lume Brand Assets

**Standalone lumen mark** — no background square. Designed for motion (layered SVG + CSS).

| File | Use |
|------|-----|
| `lume-mark.svg` | Reference / Flutter / export |
| `lume-logo.svg` | Mark + wordmark |
| `/favicon.svg` | Browser tab (static) |

## Web usage

```html
<link rel="stylesheet" href="assets/css/lume-brand.css">
<script src="assets/js/lume-brand.js"></script>
<span data-lume-mark="32"></span>
```

Idle animation: glow pulse + ray shimmer (respects `prefers-reduced-motion`).

Disable animation: `data-lume-mark-animate="false"`

## Layers (for future Lottie / GSAP)

- `#lume-mark-body` — L stem + foot
- `#lume-mark-light` — core + halo
- `#lume-mark-rays` — three ray paths

Do **not** use a boxed letter **L** or `lume-mark-square.svg` (removed).
