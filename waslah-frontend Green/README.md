# Waslah Frontend

Standalone React/Vite frontend for the Waslah lead agent and CRM experience.

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

The app runs at `http://localhost:3001` and proxies `/directus` requests to `http://127.0.0.1:8055`.

## Commands

```bash
npm run dev
npm run lint
npm run build
npm run preview
npm run check
```

## Environment

Only `VITE_*` browser configuration belongs in this repository. Keep OpenAI, OpenRouter, Apify, Vapi, Twilio, and Directus administrator credentials in the backend environment.

The interface can render its representative local dataset when Directus is not configured, so visual editing and component work remain possible without the backend stack.
