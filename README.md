# Waslah AI Lead CRM

A refine-based CRM front end for a Directus backend. It models the full flow:

- ChatGPT-style lead intake that clarifies the target audience before Apify runs.
- Apify lead gathering through Directus flow endpoints.
- On-demand Perplexity company research with slugs and company intelligence.
- CRM overview, lead table, PowerBI-style insight dashboard, proposal workspace, and email-template library.
- Email marketing actions with three free templates and premium-locked templates.

## Run With Docker

```bash
docker compose up --build
```

Ports:

- Frontend CRM: `http://localhost:3000`
- Directus API/Admin: `http://localhost:8055`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

The frontend container serves the built refine app through Nginx and proxies `/directus/*` to the Directus service over Docker networking. That keeps browser integration simple while still letting containers talk through internal service names.

For live frontend development with the same Directus/Postgres/Redis stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build frontend-dev directus postgres redis
```

Then open `http://localhost:5173`.

Update `.env.docker` before production. At minimum replace `KEY`, `SECRET`, database password, and Directus admin password. Add your `OPENAI_API_KEY`, `APIFY_TOKEN`, `PERPLEXITY_API_KEY`, and mail provider settings for the Directus flows.

## Run Without Docker

```bash
npm install
npm run dev
```

The app ships with local demo data. Add `.env` from `.env.example` to connect Directus flows directly.

## Backend Shape

See `directus/schema.md` for the recommended collections and flow endpoints.

## Docker Services

- `frontend`: production Nginx container for the refine UI on port `3000`.
- `frontend_alt`: standby production Nginx container for blue/green deploys on port `3001`.
- `directus`: Directus backend on port `8055`.
- `postgres`: persistent Postgres database on port `5432`.
- `redis`: cache and realtime support on port `6379`.

Persistent data lives in Docker volumes: `postgres_data`, `redis_data`, and `directus_uploads`.

## Hostinger Blue/Green Frontend Deploy

This project is prepared for a zero-downtime frontend deploy on a Hostinger VPS using Docker Compose and NGINX.

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

Two frontend containers are available:

- `frontend` maps host port `3000` to the built Nginx frontend.
- `frontend_alt` maps host port `3001` to the standby frontend.

Only one of them should receive public traffic at a time. Rebuild the standby container, verify it locally, then swap the NGINX upstream.

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

Switch live traffic by changing `proxy_pass`:

```nginx
proxy_pass http://127.0.0.1:3000; # frontend live
proxy_pass http://127.0.0.1:3001; # frontend_alt live
```

Deploy to standby `frontend_alt`:

```bash
git pull
docker compose build frontend_alt
docker compose up -d frontend_alt
curl -I http://127.0.0.1:3001/healthz
```

Deploy to standby `frontend`:

```bash
git pull
docker compose build frontend
docker compose up -d frontend
curl -I http://127.0.0.1:3000/healthz
```

Apply the NGINX switch:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Deployment rhythm:

1. Check which port NGINX currently points to.
2. Rebuild the other frontend service.
3. Verify `/healthz` on the standby port.
4. Change `proxy_pass` to the standby port.
5. Reload NGINX.
