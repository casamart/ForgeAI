# ForgeAI API — container image (Railway).
#
# Builds the whole monorepo (so the @forgeai/* workspace packages are compiled)
# and runs the Express + SSE API. Deployed in demo-only mode: no AI-provider key
# is set, so the server only ever runs the fixed, scripted worker-marketplace
# build — never arbitrary AI-generated code (see CLAUDE.md §28).
FROM node:22-slim

WORKDIR /app

# Install all workspace dependencies from the lockfile (incl. tsx/typescript,
# which the API's start command and the build step need).
COPY . .
RUN npm ci && npm run build

# Runtime defaults. PORT is injected by Railway; the API reads process.env.PORT.
ENV NODE_ENV=production
ENV FORGEAI_MODE=local

# Start the API (tsx apps/api/src/server.ts) via the root "api" script.
CMD ["npm", "run", "api"]
