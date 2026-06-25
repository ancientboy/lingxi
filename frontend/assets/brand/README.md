# Lume Brand Assets

**Hive nest mark (C1-13)** — hex cell home + partner peek. No background box.

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

Idle animation: nest breathe + partner peek (respects `prefers-reduced-motion`).

Disable animation: `data-lume-mark-animate="false"`

## Layers

- `#lume-mark-nest` — hex cell outline
- `#lume-mark-face` — eye + smile
- `#lume-mark-partner` — peeking partner dot

Story: **蜂巢巢室是家，伙伴在巢里探头等你。**

Exploration drafts: `home-options/` (not all shipped).
