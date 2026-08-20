FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_DIRECTUS_URL=/directus
ARG VITE_DIRECTUS_AI_FLOW_PATH=/flows/trigger/waslah-ai
ARG VITE_DIRECTUS_APIFY_FLOW_PATH=/flows/trigger/apify-leads
ARG VITE_DIRECTUS_RESEARCH_FLOW_PATH=/flows/trigger/perplexity-research
ARG VITE_DIRECTUS_PROPOSAL_FLOW_PATH=/flows/trigger/openai-proposal
ARG VITE_DIRECTUS_EMAIL_FLOW_PATH=/flows/trigger/email-campaign
ARG VITE_DIRECTUS_LEAD_AGENT_PATH=/lead-agent
ENV VITE_DIRECTUS_URL=$VITE_DIRECTUS_URL
ENV VITE_DIRECTUS_AI_FLOW_PATH=$VITE_DIRECTUS_AI_FLOW_PATH
ENV VITE_DIRECTUS_APIFY_FLOW_PATH=$VITE_DIRECTUS_APIFY_FLOW_PATH
ENV VITE_DIRECTUS_RESEARCH_FLOW_PATH=$VITE_DIRECTUS_RESEARCH_FLOW_PATH
ENV VITE_DIRECTUS_PROPOSAL_FLOW_PATH=$VITE_DIRECTUS_PROPOSAL_FLOW_PATH
ENV VITE_DIRECTUS_EMAIL_FLOW_PATH=$VITE_DIRECTUS_EMAIL_FLOW_PATH
ENV VITE_DIRECTUS_LEAD_AGENT_PATH=$VITE_DIRECTUS_LEAD_AGENT_PATH
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
