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

## Admin data entry

The admin app is run locally and points at whichever backend you want to manage. Production admin static hosting is not part of the current MVP, so do not create a separate Railway service for `apps/admin`.

### Add data to local development

1. Start the local server:

   ```bash
   pnpm dev:server
   ```

2. Start the admin app against the local server:

   ```bash
   VITE_API_BASE_URL=http://localhost:3000 pnpm dev:admin
   ```

3. Open the Vite URL, usually `http://localhost:5173`.
4. In the login section, enter your teammate name and the `TEAM_INVITE_CODE` from `apps/server/.env`.
5. Add restaurants in the "新增饭馆" section.
6. Add at least one recommendation for each restaurant in the "新增推荐" section:
   - select the restaurant
   - enter the recommended dish
   - enter a short, readable reason
   - save the recommendation

### Add data to Railway

1. Confirm the Railway server is healthy:

   ```bash
   curl https://your-server.up.railway.app/api/health
   ```

2. Start the local admin app against the Railway server. Do not include a trailing slash in the API base URL.

   ```bash
   VITE_API_BASE_URL=https://your-server.up.railway.app pnpm dev:admin
   ```

3. Open the Vite URL, usually `http://localhost:5173`.
4. In the login section, enter your teammate name and the `TEAM_INVITE_CODE` configured in the Railway `@lunch/server` service variables.
5. Add restaurants and recommendations the same way as local development.
6. Verify recommendations from the API. Keep `EXTENSION_READ_TOKEN` private and paste it only into your terminal prompt when asked:

   ```bash
   read -s TOKEN
   API="https://your-server.up.railway.app"
   curl -s -H "x-lunch-read-token: $TOKEN" "$API/api/today-recommendations?forceRefresh=true"
   unset TOKEN
   ```

   Use `forceRefresh=true` after adding data if the normal recommendation endpoint was already called earlier that day. The default endpoint is idempotent for the office date and may otherwise return the earlier cached batch.

### Admin notes

- `TEAM_INVITE_CODE` is typed into the admin login form and must not be hardcoded into frontend bundles.
- `EXTENSION_READ_TOKEN` is only for extension/API read access; it is not used to log in to admin.
- The Chrome extension API base URL should also omit the trailing slash, for example `https://your-server.up.railway.app`.
