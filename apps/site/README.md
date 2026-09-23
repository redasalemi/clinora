# Clinora marketing site

Standalone public landing page. Plain HTML/CSS/JS — no framework, no build step,
no dependency on `packages/engine` or `apps/web`. No auth, no participant data,
no backend.

Imported and translated from the Claude Design project "Clinora Site" (the
`.dc` component format used by the Design tool's live editor) into static
markup, so it runs anywhere without the Design tool's `support.js` runtime.

## Preview locally

```
cd apps/site
python3 -m http.server 8000
```

Then open http://localhost:8000/.

## Files

- `index.html` — page markup
- `styles.css` — all styling
- `script.js` — header scroll state, scroll-reveal animations, the
  professions panel swap, and the provenance hover interaction
