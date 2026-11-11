# Usine Axion — image construite par GitHub Actions, envoyée au serveur par le job `deployer` (voir README).
# Aucun secret n'entre dans l'image : base, clé de session et hachage du mot de passe sont fournis au démarrage.
# Les migrations sont jouées au démarrage du serveur (src/instrumentation.ts), jamais à la construction.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Clé FIXE des actions serveur (facultative) : sans elle, chaque construction en tire une au hasard et une page
# ouverte avant la mise en ligne échoue (« Failed to find Server Action »). Elle ne vit que dans cette étape.
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=
RUN pnpm build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN useradd --uid 1001 --create-home usine
COPY --from=build --chown=usine:usine /app/.next/standalone ./
COPY --from=build --chown=usine:usine /app/.next/static ./.next/static
COPY --from=build --chown=usine:usine /app/migrations ./migrations
USER usine
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s CMD node -e "fetch('http://127.0.0.1:3000/api/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
