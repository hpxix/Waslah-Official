# Frontend Editing

The Wasla interface is ordinary React, HTML, CSS, and inline SVG. No page or form is a flattened screenshot.

## Live Editing

Keep Directus, Postgres, and Redis running, stop only the compiled frontend container, then start the source development server:

```bash
docker compose stop frontend
npm run dev
```

Open `http://localhost:3000`. Changes appear as soon as a source file is saved.

To return to the production-style Docker frontend:

```bash
# Stop the local npm dev server first.
docker compose up -d --build frontend
```

## Where To Edit

| What you want to change | File |
| --- | --- |
| Arabic and English text | `src/i18n.tsx` |
| Landing page and dashboard structure | `src/App.tsx` |
| Registration and login flow | `src/components/AuthDialog.tsx` |
| Logo geometry and lockups | `src/components/WaslaBrand.tsx` |
| Lead-agent workflow visual | `src/components/LeadFlowVisual.tsx` |
| Product tour and onboarding | `src/components/ProductTour.tsx` |
| Auth, onboarding, and workspace styling | `src/experience.css` |
| Main page and dashboard styling | `src/styles.css` |

The logo is inline SVG, so its edges remain sharp at every size. Icons are editable Lucide React components. Confetti is the only canvas effect and appears only as a temporary celebration after account creation or phone verification.

## Quick Changes

- Text: edit the Arabic and English value beside the matching key in `src/i18n.tsx`.
- Colors and spacing: search the CSS files for the class shown in browser developer tools.
- Registration fields or buttons: edit the JSX in `src/components/AuthDialog.tsx`.
- Page layout: edit the matching React component in `src/App.tsx`.

Do not place API secrets in frontend files. Provider credentials belong in `.env.docker`, using `.env.docker.example` as the guide.
