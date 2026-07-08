# 中午吃点啥

Chrome MV3 extension + Fastify + PostgreSQL lunch recommendation tool.

## Local quick start

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Configure server:

   ```bash
   cp apps/server/.env.example apps/server/.env
   ```

3. Run Prisma:

   ```bash
   pnpm --filter @lunch/server prisma:generate
   pnpm --filter @lunch/server prisma:migrate -- --name init
   pnpm --filter @lunch/server prisma:seed
   ```

4. Start server:

   ```bash
   pnpm dev:server
   ```

5. Build extension:

   ```bash
   pnpm --filter @lunch/extension build
   ```

6. Load `apps/extension/dist` in `chrome://extensions`.

7. Start admin locally:

   ```bash
   export VITE_API_BASE_URL=http://localhost:3000
   pnpm dev:admin
   ```

## Railway deploy checklist

1. Create a Railway project with one PostgreSQL service and one app service.
2. Set the variables listed in `apps/server/README.md`.
3. Deploy `apps/server` with:

   ```bash
   pnpm --filter @lunch/shared build
   pnpm --filter @lunch/server prisma:generate
   pnpm --filter @lunch/server build
   pnpm --filter @lunch/server exec prisma migrate deploy
   pnpm --filter @lunch/server start
   ```

4. Copy the Railway public domain into the extension settings as the API base URL.
