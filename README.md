# Waslah AI Lead CRM

A multi-tenant lead-agent platform with a React CRM, Directus system of record, n8n orchestration, Apify sourcing, and Vapi qualification calls.

- ChatGPT-style lead intake that clarifies the target audience before Apify runs.
- Phone-verified accounts with an idempotent 30 SAR welcome-credit ledger.
- Google, Microsoft, and Apple account creation through Directus SSO with mandatory phone verification.
- Shared, deduplicated lead inventory with masked previews and workspace access grants.
- Apify lead gathering and rate-limited Vapi calling through an importable n8n workflow.
- Append-only provider events, call attempts, structured qualifications, and retryable outbox records.
- On-demand Perplexity company research with slugs and company intelligence.
- CRM overview, lead table, PowerBI-style insight dashboard, proposal workspace, and email-template library.
- Email marketing actions with three free templates and premium-locked templates.

## Run With Docker

```bash
cp .env.docker.example .env.docker
docker compose --env-file .env.docker up --build
```

Ports:

- Frontend CRM: `http://localhost:3000`
- Directus API/Admin: `http://localhost:8055`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`
- n8n (optional): `http://localhost:5678`

The frontend container serves the built refine app through Nginx and proxies `/directus/*` to the Directus service over Docker networking. That keeps browser integration simple while still letting containers talk through internal service names.

Update `.env.docker` before production. Replace every placeholder secret, then add the Apify, Vapi, and Twilio Verify credentials described in [`docs/integrations.md`](docs/integrations.md).

Start the optional automation service and import the bundled workflow:

```bash
docker compose --env-file .env.docker --profile automation up -d n8n
```

## Run Without Docker

For live frontend editing on the same `http://localhost:3000` address:

```bash
npm install
docker compose stop frontend
npm run dev
```

Vite serves the actual React/CSS source with instant refresh and proxies `/directus` to the Directus container on port `8055`. Lead inventory is loaded from Directus; starter records are never bundled into the customer-facing frontend.

See [`docs/frontend-editing.md`](docs/frontend-editing.md) for the small set of files used to change text, styling, branding, registration, and dashboard screens.

## Backend Shape

The Directus bootstrap creates 14 collections and the customer role automatically. See [`directus/schema.md`](directus/schema.md) for the data contract and [`docs/lead-agent-architecture.md`](docs/lead-agent-architecture.md) for request flow, security, and scaling.

The custom API is mounted at `/lead-agent`. With the Docker frontend it is available through `/directus/lead-agent`.

### Administrator lead inventory

Set `DIRECTUS_ADMIN_EMAIL` and `DIRECTUS_ADMIN_PASSWORD` in the ignored `.env.docker` file, bootstrap Directus, and import the starter datasets with:

```bash
docker compose --env-file .env.docker run --rm directus-bootstrap
npm run data:import:starter
```

The importer normalizes every JSON file in `currentData-Starter`, preserves the original record in `raw_payload`, computes an enrichment score/status, and generates deterministic person and company imagery when the source has none. It is idempotent and can be run again safely.

Only a Directus administrator can call `GET /lead-agent/admin/leads`. The endpoint supports server-side search, filtering, sorting, and pagination. `/console` and every nested console route validate the current Directus session before rendering; anonymous or expired sessions are redirected to `/auth`.

## Docker Services

- `frontend`: production Nginx container for the refine UI on port `3000`.
- `directus`: Directus backend on port `8055`.
- `postgres`: persistent Postgres database on port `5432`.
- `redis`: cache and realtime support on port `6379`.
- `directus-bootstrap`: idempotent role and collection provisioning; exits after success.
- `n8n`: optional automation profile using the same Postgres server in a separate schema.

Persistent data lives in Docker volumes: `postgres_data`, `redis_data`, and `directus_uploads`.

## Hostinger Frontend Deploy

This project is prepared for a production frontend deploy on a Hostinger VPS using Docker Compose and NGINX.

One-time server init:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C "hostinger-waslah-deploy" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Add the printed public key to GitHub as a deploy key for the repo.

Allow your deploy user to run Docker without `sudo`:

```bash
sudo usermod -aG docker "$USER"
newgrp docker
```

The single `frontend` service maps host port `3000` to the built Nginx frontend.

Example NGINX site on Hostinger:

```nginx
server {
  listen 80;
  server_name your-domain.com www.your-domain.com;

  location / {
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:3000;
  }
}
```

Deploy the frontend:

```bash
git pull
docker compose build frontend
docker compose --env-file .env.docker up -d frontend
curl -I http://127.0.0.1:3000/healthz
```

Validate and reload NGINX:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

The public site and local preview both use port `3000`; there is no secondary Vite or port `3001` frontend.
