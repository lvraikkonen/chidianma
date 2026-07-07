# Lunch Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable vertical slice of “中午吃点啥”: shared API types, Fastify recommendation API with seeded PostgreSQL data, and a Chrome MV3 extension that can fetch, cache, display, and notify today’s recommendations.

**Architecture:** Use a pnpm TypeScript monorepo with `apps/server`, `apps/extension`, `apps/admin`, and `packages/shared`. The first slice prioritizes server + shared + extension, with admin and real weather added after the end-to-end path works. Server owns recommendations and persistence; extension owns alarms, notifications, popup display, and local fallback cache.

**Tech Stack:** TypeScript, pnpm workspaces, Fastify, Prisma, PostgreSQL, Vitest, Vite, React, Chrome Manifest V3, Open-Meteo adapter later in the slice.

## Global Constraints

- Spec status is `Draft Accepted for Prototype`, but Open Design HTML prototype is skipped for now.
- Monorepo paths are `apps/extension/`, `apps/server/`, `apps/admin/`, and `packages/shared/`.
- Plugin default reminder time is `11:30`.
- Chrome extension must use Manifest V3.
- Chrome service worker state must persist through `chrome.storage`; do not rely on long-lived globals.
- Chrome extension uses `chrome.alarms`, not `setTimeout` or `setInterval`, for long-term scheduling.
- Plugin permissions stay minimal: `alarms`, `notifications`, `storage`, and the Railway/API host permission.
- Server framework is Fastify.
- Server deploy target is Railway.
- Fastify listen on Railway must use `host: "::"` and `port: Number(process.env.PORT ?? 3000)`.
- Database is PostgreSQL through Prisma.
- Recommendation API date boundaries use `OFFICE_TIMEZONE`, not server or user machine timezone.
- `GET /api/today-recommendations` is idempotent by default for the same office date.
- `GET /api/today-recommendations?forceRefresh=true` creates a new current batch and keeps old batches for review.
- Plugin recommendation requests include `X-Lunch-Read-Token`.
- `EXTENSION_READ_TOKEN` is a lightweight public API guard, not a strong secret.
- Weather is called only by the server, never by the extension.
- Real weather uses an Open-Meteo-style adapter after the mock-weather vertical slice works.
- Team invite code must never be embedded into frontend bundles.
- Management auth uses a short-lived signed session token created from teammate name + team invite code.
- First runnable slice may seed 5-10 restaurants manually.

---

## File Structure

Create this structure during Task 1:

```text
/Users/claus/chidianma/
  apps/
    extension/
      index.html
      manifest.json
      package.json
      src/
        background.ts
        chromeApi.ts
        config.ts
        popup.ts
        recommendationClient.ts
        storage.ts
      styles/
        popup.css
      public/
        icon-16.png
        icon-32.png
        icon-48.png
        icon-128.png
      tests/
        background.test.ts
        storage.test.ts
    server/
      package.json
      prisma/
        schema.prisma
        seed.ts
      src/
        app.ts
        env.ts
        index.ts
        plugins/
          prisma.ts
        routes/
          health.ts
          recommendations.ts
          feedback.ts
        services/
          dates.ts
          recommendation/
            scorer.ts
            today.ts
          weather/
            mockWeather.ts
            openMeteo.ts
      tests/
        dates.test.ts
        recommendation.test.ts
        recommendations-route.test.ts
    admin/
      package.json
      src/
        main.tsx
  packages/
    shared/
      package.json
      src/
        api.ts
        scoring.ts
        types.ts
      tests/
        scoring.test.ts
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  vitest.config.ts
```

`apps/admin` is scaffolded lightly in Task 1 but not built out until Task 7. This keeps the first vertical slice focused.

---

### Task 1: Monorepo Foundation

**Files:**
- Create: `/Users/claus/chidianma/package.json`
- Create: `/Users/claus/chidianma/pnpm-workspace.yaml`
- Create: `/Users/claus/chidianma/tsconfig.base.json`
- Create: `/Users/claus/chidianma/vitest.config.ts`
- Create: `/Users/claus/chidianma/apps/server/package.json`
- Create: `/Users/claus/chidianma/apps/extension/package.json`
- Create: `/Users/claus/chidianma/apps/admin/package.json`
- Create: `/Users/claus/chidianma/packages/shared/package.json`
- Create: `/Users/claus/chidianma/apps/admin/src/main.tsx`

**Interfaces:**
- Produces: pnpm workspace package names `@lunch/shared`, `@lunch/server`, `@lunch/extension`, `@lunch/admin`.
- Produces: root scripts `build`, `test`, `typecheck`, `dev:server`, `dev:extension`, `dev:admin`.
- Consumes: no prior code.

- [ ] **Step 1: Create workspace manifests**

Create `/Users/claus/chidianma/package.json`:

```json
{
  "name": "lunch-what",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "dev:server": "pnpm --filter @lunch/server dev",
    "dev:extension": "pnpm --filter @lunch/extension dev",
    "dev:admin": "pnpm --filter @lunch/admin dev"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Create `/Users/claus/chidianma/pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `/Users/claus/chidianma/tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "baseUrl": ".",
    "paths": {
      "@lunch/shared": ["packages/shared/src/index.ts"],
      "@lunch/shared/*": ["packages/shared/src/*"]
    }
  }
}
```

Create `/Users/claus/chidianma/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/**/tests/**/*.test.ts", "apps/**/tests/**/*.test.ts"]
  }
});
```

- [ ] **Step 2: Create package manifests**

Create `/Users/claus/chidianma/packages/shared/package.json`:

```json
{
  "name": "@lunch/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run tests",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

Create `/Users/claus/chidianma/apps/server/package.json`:

```json
{
  "name": "@lunch/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run tests",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@fastify/cors": "^10.0.2",
    "@lunch/shared": "workspace:*",
    "@prisma/client": "^6.1.0",
    "fastify": "^5.2.1",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "prisma": "^6.1.0",
    "tsx": "^4.19.2"
  }
}
```

Create `/Users/claus/chidianma/apps/extension/package.json`:

```json
{
  "name": "@lunch/extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build",
    "test": "vitest run tests",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@lunch/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.287",
    "vite": "^6.0.7"
  }
}
```

Create `/Users/claus/chidianma/apps/admin/package.json`:

```json
{
  "name": "@lunch/admin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run tests",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@lunch/shared": "workspace:*",
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.0.7",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2"
  }
}
```

- [ ] **Step 3: Create TypeScript configs**

Create `/Users/claus/chidianma/packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "emitDeclarationOnly": false
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

Create `/Users/claus/chidianma/apps/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "prisma/**/*.ts"]
}
```

Create `/Users/claus/chidianma/apps/extension/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "types": ["chrome", "vite/client"],
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

Create `/Users/claus/chidianma/apps/admin/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["vite/client"],
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts", "tests/**/*.tsx"]
}
```

- [ ] **Step 4: Add minimal admin placeholder**

Create `/Users/claus/chidianma/apps/admin/src/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <main>
    <h1>中午吃点啥 Admin</h1>
  </main>
);
```

Create `/Users/claus/chidianma/apps/admin/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>中午吃点啥 Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Install dependencies**

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` is created and all workspace dependencies install.

- [ ] **Step 6: Verify install and initial admin typecheck**

Run:

```bash
pnpm --filter @lunch/admin typecheck
```

Expected: the placeholder admin app typechecks. Full workspace test/typecheck begins after shared and server source files exist.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json vitest.config.ts apps packages
git commit -m "chore: initialize lunch monorepo"
```

---

### Task 2: Shared Types and Scoring Helpers

**Files:**
- Create: `/Users/claus/chidianma/packages/shared/src/index.ts`
- Create: `/Users/claus/chidianma/packages/shared/src/types.ts`
- Create: `/Users/claus/chidianma/packages/shared/src/api.ts`
- Create: `/Users/claus/chidianma/packages/shared/src/scoring.ts`
- Create: `/Users/claus/chidianma/packages/shared/tests/scoring.test.ts`

**Interfaces:**
- Produces: `TodayRecommendationResponse`, `RestaurantStatus`, `FeedbackType`, `WeatherTag`, `WeekdayTag`.
- Produces: `calculateRestaurantScore(input: ScoreInput): ScoreResult`.
- Consumes: workspace from Task 1.

- [ ] **Step 1: Write shared scoring tests**

Create `/Users/claus/chidianma/packages/shared/tests/scoring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calculateRestaurantScore } from "../src/scoring";

describe("calculateRestaurantScore", () => {
  it("rewards weekday, weather, distance, and teammate recommendations", () => {
    const result = calculateRestaurantScore({
      weekdayMatch: 1,
      weatherMatch: 1,
      distanceMinutes: 8,
      teammateRecommendationCount: 3,
      recentlyRecommended: false,
      negativeFeedbackCount: 0
    });

    expect(result.score).toBe(20 + 25 + 20 + 10);
    expect(result.reasons).toEqual([
      "适合今天",
      "适合当前天气",
      "离办公室近",
      "多人推荐"
    ]);
  });

  it("penalizes recent duplicates and negative feedback", () => {
    const result = calculateRestaurantScore({
      weekdayMatch: 0,
      weatherMatch: 0,
      distanceMinutes: 25,
      teammateRecommendationCount: 1,
      recentlyRecommended: true,
      negativeFeedbackCount: 2
    });

    expect(result.score).toBe(-45);
    expect(result.reasons).toContain("最近推荐过，降权");
    expect(result.reasons).toContain("有人不想吃，降权");
  });
});
```

- [ ] **Step 2: Run failing shared test**

Run:

```bash
pnpm --filter @lunch/shared test
```

Expected: FAIL because `../src/scoring` does not exist.

- [ ] **Step 3: Implement shared types**

Create `/Users/claus/chidianma/packages/shared/src/types.ts`:

```ts
export type RestaurantStatus = "active" | "paused" | "blocked";
export type FeedbackType = "want" | "skip" | "ate" | "blocked";
export type WeatherTag = "rainy" | "hot" | "cold" | "clear" | "windy";
export type WeekdayTag = "monday" | "tuesday" | "wednesday" | "thursday" | "friday";

export interface RecommendationItem {
  restaurantId: string;
  recommendationId?: string;
  restaurantName: string;
  dish?: string;
  reason: string;
  distanceMinutes?: number;
  tags: string[];
}

export interface TodayRecommendationResponse {
  date: string;
  headline: string;
  weatherSummary?: string;
  weatherUnavailable?: boolean;
  fromCache?: boolean;
  items: RecommendationItem[];
}
```

Create `/Users/claus/chidianma/packages/shared/src/api.ts`:

```ts
export const LUNCH_HEADLINE = "吃饭才是正事，中午吃点啥呢？";
export const READ_TOKEN_HEADER = "x-lunch-read-token";
```

Create `/Users/claus/chidianma/packages/shared/src/index.ts`:

```ts
export * from "./api";
export * from "./scoring";
export * from "./types";
```

- [ ] **Step 4: Implement scoring**

Create `/Users/claus/chidianma/packages/shared/src/scoring.ts`:

```ts
export interface ScoreInput {
  weekdayMatch: 0 | 1;
  weatherMatch: 0 | 1;
  distanceMinutes?: number;
  teammateRecommendationCount: number;
  recentlyRecommended: boolean;
  negativeFeedbackCount: number;
}

export interface ScoreResult {
  score: number;
  reasons: string[];
}

export function calculateRestaurantScore(input: ScoreInput): ScoreResult {
  let score = 0;
  const reasons: string[] = [];

  if (input.weekdayMatch) {
    score += 20;
    reasons.push("适合今天");
  }

  if (input.weatherMatch) {
    score += 25;
    reasons.push("适合当前天气");
  }

  const distanceScore = getDistanceScore(input.distanceMinutes);
  score += distanceScore;
  if (distanceScore === 20) reasons.push("离办公室近");
  if (distanceScore === 10) reasons.push("距离适中");

  if (input.teammateRecommendationCount >= 2) {
    score += 10;
    reasons.push("多人推荐");
  }

  if (input.recentlyRecommended) {
    score -= 25;
    reasons.push("最近推荐过，降权");
  }

  if (input.negativeFeedbackCount > 0) {
    score -= input.negativeFeedbackCount * 10;
    reasons.push("有人不想吃，降权");
  }

  return { score, reasons };
}

function getDistanceScore(distanceMinutes?: number): number {
  if (typeof distanceMinutes !== "number") return 0;
  if (distanceMinutes <= 10) return 20;
  if (distanceMinutes <= 20) return 10;
  return 0;
}
```

- [ ] **Step 5: Verify shared tests pass**

Run:

```bash
pnpm --filter @lunch/shared test
pnpm --filter @lunch/shared typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat: add shared lunch contracts"
```

---

### Task 3: Prisma Schema and Seed Data

**Files:**
- Create: `/Users/claus/chidianma/apps/server/prisma/schema.prisma`
- Create: `/Users/claus/chidianma/apps/server/prisma/seed.ts`
- Create: `/Users/claus/chidianma/apps/server/.env.example`

**Interfaces:**
- Produces: Prisma models `Teammate`, `Restaurant`, `Recommendation`, `DailyRecommendation`, `WeatherSnapshot`, `Feedback`.
- Produces: seed data with at least 6 active restaurants and recommendations.
- Consumes: shared enum names from Task 2 conceptually; Prisma enum names use uppercase values.

- [ ] **Step 1: Write Prisma schema**

Create `/Users/claus/chidianma/apps/server/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum RestaurantStatus {
  active
  paused
  blocked
}

enum FeedbackType {
  want
  skip
  ate
  blocked
}

model Teammate {
  id              String           @id @default(cuid())
  name            String           @unique
  createdAt       DateTime         @default(now()) @map("created_at")
  lastSeenAt      DateTime?        @map("last_seen_at")
  recommendations Recommendation[]
  feedback        Feedback[]

  @@map("teammates")
}

model Restaurant {
  id                   String                @id @default(cuid())
  name                 String
  area                 String?
  address              String?
  distanceMinutes      Int?                  @map("distance_minutes")
  cuisine              String?
  priceBand            String?               @map("price_band")
  supportsDineIn       Boolean               @default(true) @map("supports_dine_in")
  supportsTakeout      Boolean               @default(false) @map("supports_takeout")
  tags                 String[]
  status               RestaurantStatus      @default(active)
  createdAt            DateTime              @default(now()) @map("created_at")
  updatedAt            DateTime              @updatedAt @map("updated_at")
  recommendations      Recommendation[]
  dailyRecommendations DailyRecommendation[]
  feedback             Feedback[]

  @@map("restaurants")
}

model Recommendation {
  id                   String                @id @default(cuid())
  restaurantId         String                @map("restaurant_id")
  teammateId           String                @map("teammate_id")
  dish                 String?
  reason               String
  weatherTags          String[]              @map("weather_tags")
  weekdayTags          String[]              @map("weekday_tags")
  moodTags             String[]              @map("mood_tags")
  createdAt            DateTime              @default(now()) @map("created_at")
  updatedAt            DateTime              @updatedAt @map("updated_at")
  restaurant           Restaurant            @relation(fields: [restaurantId], references: [id])
  teammate             Teammate              @relation(fields: [teammateId], references: [id])
  dailyRecommendations DailyRecommendation[]
  feedback             Feedback[]

  @@map("recommendations")
}

model DailyRecommendation {
  id               String         @id @default(cuid())
  date             String
  batchId          String         @map("batch_id")
  restaurantId     String         @map("restaurant_id")
  recommendationId String?        @map("recommendation_id")
  score            Int
  reason           String
  isCurrent        Boolean        @default(true) @map("is_current")
  createdAt        DateTime       @default(now()) @map("created_at")
  restaurant       Restaurant     @relation(fields: [restaurantId], references: [id])
  recommendation   Recommendation? @relation(fields: [recommendationId], references: [id])

  @@index([date, isCurrent])
  @@map("daily_recommendations")
}

model WeatherSnapshot {
  id                         String   @id @default(cuid())
  date                       String
  city                       String
  temperatureC               Float?   @map("temperature_c")
  condition                  String
  precipitationProbability   Int?     @map("precipitation_probability")
  windLevel                  String?  @map("wind_level")
  rawPayload                 Json?    @map("raw_payload")
  createdAt                  DateTime @default(now()) @map("created_at")

  @@unique([date, city])
  @@map("weather_snapshots")
}

model Feedback {
  id               String          @id @default(cuid())
  date             String
  restaurantId     String          @map("restaurant_id")
  recommendationId String?         @map("recommendation_id")
  teammateId       String?         @map("teammate_id")
  type             FeedbackType
  createdAt        DateTime        @default(now()) @map("created_at")
  restaurant       Restaurant      @relation(fields: [restaurantId], references: [id])
  recommendation   Recommendation? @relation(fields: [recommendationId], references: [id])
  teammate         Teammate?       @relation(fields: [teammateId], references: [id])

  @@index([date, type])
  @@map("feedback")
}
```

- [ ] **Step 2: Add environment example**

Create `/Users/claus/chidianma/apps/server/.env.example`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lunch_what
TEAM_INVITE_CODE=let-us-eat
SESSION_SECRET=dev-session-secret-change-me
EXTENSION_READ_TOKEN=dev-read-token
WEATHER_API_BASE_URL=https://api.open-meteo.com/v1
OFFICE_CITY=Shanghai
OFFICE_LATITUDE=31.2304
OFFICE_LONGITUDE=121.4737
OFFICE_TIMEZONE=Asia/Shanghai
PUBLIC_API_BASE_URL=http://localhost:3000
NODE_ENV=development
```

- [ ] **Step 3: Add seed script**

Create `/Users/claus/chidianma/apps/server/prisma/seed.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const restaurants = [
  {
    name: "楼下卤肉饭",
    area: "公司楼下",
    address: "公司楼下美食广场",
    distanceMinutes: 5,
    cuisine: "简餐",
    priceBand: "25-35",
    tags: ["快", "下饭", "性价比"],
    dish: "卤肉饭加卤蛋",
    reason: "适合赶会，出餐快，周一回血稳。"
  },
  {
    name: "拉面小馆",
    area: "园区东门",
    address: "园区东门 2 楼",
    distanceMinutes: 8,
    cuisine: "日式",
    priceBand: "40-60",
    tags: ["热乎", "面", "雨天"],
    dish: "叉烧拉面",
    reason: "雨天热乎，汤面不容易踩雷。"
  },
  {
    name: "轻食沙拉碗",
    area: "写字楼 B1",
    address: "写字楼 B1",
    distanceMinutes: 6,
    cuisine: "轻食",
    priceBand: "35-55",
    tags: ["清爽", "健康", "快"],
    dish: "鸡胸牛油果碗",
    reason: "热天清爽，下午不容易犯困。"
  },
  {
    name: "泰式打抛饭",
    area: "商业街",
    address: "商业街 1 层",
    distanceMinutes: 12,
    cuisine: "东南亚",
    priceBand: "45-65",
    tags: ["异国", "重口", "下饭"],
    dish: "猪肉打抛饭",
    reason: "周三换口味，微辣比较安全。"
  },
  {
    name: "烧腊双拼饭",
    area: "园区西门",
    address: "园区西门",
    distanceMinutes: 10,
    cuisine: "粤菜",
    priceBand: "38-55",
    tags: ["快", "招牌", "好吃"],
    dish: "烧鸭叉烧双拼",
    reason: "出餐稳定，适合不知道吃什么的时候。"
  },
  {
    name: "小火锅工作餐",
    area: "商场",
    address: "商场 4 楼",
    distanceMinutes: 18,
    cuisine: "火锅",
    priceBand: "60-90",
    tags: ["热乎", "聚餐", "周五"],
    dish: "番茄锅套餐",
    reason: "适合周五开心局，注意排队。"
  }
];

async function main() {
  const teammate = await prisma.teammate.upsert({
    where: { name: "Demo 同事" },
    update: { lastSeenAt: new Date() },
    create: { name: "Demo 同事", lastSeenAt: new Date() }
  });

  for (const item of restaurants) {
    const restaurant = await prisma.restaurant.create({
      data: {
        name: item.name,
        area: item.area,
        address: item.address,
        distanceMinutes: item.distanceMinutes,
        cuisine: item.cuisine,
        priceBand: item.priceBand,
        supportsDineIn: true,
        supportsTakeout: true,
        tags: item.tags,
        status: "active"
      }
    });

    await prisma.recommendation.create({
      data: {
        restaurantId: restaurant.id,
        teammateId: teammate.id,
        dish: item.dish,
        reason: item.reason,
        weatherTags: item.tags.includes("雨天") ? ["rainy"] : item.tags.includes("清爽") ? ["hot"] : [],
        weekdayTags: item.tags.includes("周五") ? ["friday"] : [],
        moodTags: item.tags
      }
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

- [ ] **Step 4: Generate Prisma client**

Run:

```bash
pnpm --filter @lunch/server prisma:generate
```

Expected: Prisma client generation succeeds.

- [ ] **Step 5: Run migration and seed against a local or Railway dev database**

Run:

```bash
cp apps/server/.env.example apps/server/.env
pnpm --filter @lunch/server prisma:migrate -- --name init
pnpm --filter @lunch/server prisma:seed
```

Expected: migration creates tables and seed inserts 6 restaurants.

- [ ] **Step 6: Commit**

```bash
git add apps/server/prisma apps/server/.env.example apps/server/package.json
git commit -m "feat: add lunch database schema"
```

---

### Task 4: Fastify App and Idempotent Today Recommendations

**Files:**
- Create: `/Users/claus/chidianma/apps/server/src/env.ts`
- Create: `/Users/claus/chidianma/apps/server/src/app.ts`
- Create: `/Users/claus/chidianma/apps/server/src/index.ts`
- Create: `/Users/claus/chidianma/apps/server/src/plugins/prisma.ts`
- Create: `/Users/claus/chidianma/apps/server/src/routes/health.ts`
- Create: `/Users/claus/chidianma/apps/server/src/routes/recommendations.ts`
- Create: `/Users/claus/chidianma/apps/server/src/services/dates.ts`
- Create: `/Users/claus/chidianma/apps/server/src/services/weather/mockWeather.ts`
- Create: `/Users/claus/chidianma/apps/server/src/services/recommendation/scorer.ts`
- Create: `/Users/claus/chidianma/apps/server/src/services/recommendation/today.ts`
- Create: `/Users/claus/chidianma/apps/server/tests/dates.test.ts`
- Create: `/Users/claus/chidianma/apps/server/tests/recommendation.test.ts`

**Interfaces:**
- Consumes: Prisma schema from Task 3 and shared contracts from Task 2.
- Produces: `buildApp(): FastifyInstance`.
- Produces: `getOfficeDate(now: Date, timezone: string): string`.
- Produces: `getTodayRecommendations({ prisma, env, forceRefresh }): Promise<TodayRecommendationResponse>`.
- Produces: `GET /api/today-recommendations` and `GET /api/health`.

- [ ] **Step 1: Write date tests**

Create `/Users/claus/chidianma/apps/server/tests/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getOfficeDate } from "../src/services/dates";

describe("getOfficeDate", () => {
  it("uses office timezone for date boundaries", () => {
    const date = getOfficeDate(new Date("2026-07-06T17:00:00.000Z"), "Asia/Shanghai");
    expect(date).toBe("2026-07-07");
  });
});
```

- [ ] **Step 2: Implement date service**

Create `/Users/claus/chidianma/apps/server/src/services/dates.ts`:

```ts
export function getOfficeDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error(`Could not format office date for timezone ${timezone}`);
  }

  return `${year}-${month}-${day}`;
}
```

- [ ] **Step 3: Write recommendation service tests with mocked repository shape**

Create `/Users/claus/chidianma/apps/server/tests/recommendation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rankRestaurantCandidates } from "../src/services/recommendation/scorer";

describe("rankRestaurantCandidates", () => {
  it("returns top three active candidates with readable reasons", () => {
    const ranked = rankRestaurantCandidates({
      candidates: [
        {
          restaurantId: "r1",
          recommendationId: "rec1",
          name: "拉面小馆",
          dish: "叉烧拉面",
          distanceMinutes: 8,
          tags: ["热乎", "雨天"],
          weekdayMatch: 1,
          weatherMatch: 1,
          teammateRecommendationCount: 2,
          recentlyRecommended: false,
          negativeFeedbackCount: 0
        },
        {
          restaurantId: "r2",
          recommendationId: "rec2",
          name: "远处火锅",
          dish: "番茄锅",
          distanceMinutes: 30,
          tags: ["热乎"],
          weekdayMatch: 0,
          weatherMatch: 1,
          teammateRecommendationCount: 1,
          recentlyRecommended: true,
          negativeFeedbackCount: 1
        }
      ],
      limit: 3
    });

    expect(ranked).toHaveLength(2);
    expect(ranked[0]).toMatchObject({
      restaurantName: "拉面小馆",
      dish: "叉烧拉面",
      distanceMinutes: 8
    });
    expect(ranked[0]?.reason).toContain("适合今天");
  });
});
```

- [ ] **Step 4: Implement environment and mock weather**

Create `/Users/claus/chidianma/apps/server/src/env.ts`:

```ts
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  TEAM_INVITE_CODE: z.string().min(1),
  SESSION_SECRET: z.string().min(8),
  EXTENSION_READ_TOKEN: z.string().min(1),
  WEATHER_API_BASE_URL: z.string().url().default("https://api.open-meteo.com/v1"),
  OFFICE_CITY: z.string().min(1).default("Shanghai"),
  OFFICE_LATITUDE: z.coerce.number().default(31.2304),
  OFFICE_LONGITUDE: z.coerce.number().default(121.4737),
  OFFICE_TIMEZONE: z.string().min(1).default("Asia/Shanghai"),
  PUBLIC_API_BASE_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000)
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  return EnvSchema.parse(source);
}
```

Create `/Users/claus/chidianma/apps/server/src/services/weather/mockWeather.ts`:

```ts
export interface WeatherSummary {
  temperatureC: number;
  condition: "rainy" | "hot" | "cold" | "clear" | "windy";
  precipitationProbability: number;
  summary: string;
}

export function getMockWeather(): WeatherSummary {
  return {
    temperatureC: 28,
    condition: "rainy",
    precipitationProbability: 70,
    summary: "今天有雨，优先推荐近一点、热乎一点的选择。"
  };
}
```

- [ ] **Step 5: Implement recommendation scorer**

Create `/Users/claus/chidianma/apps/server/src/services/recommendation/scorer.ts`:

```ts
import { calculateRestaurantScore, type RecommendationItem } from "@lunch/shared";

export interface Candidate {
  restaurantId: string;
  recommendationId?: string;
  name: string;
  dish?: string;
  distanceMinutes?: number;
  tags: string[];
  weekdayMatch: 0 | 1;
  weatherMatch: 0 | 1;
  teammateRecommendationCount: number;
  recentlyRecommended: boolean;
  negativeFeedbackCount: number;
}

export interface RankedRecommendation extends RecommendationItem {
  score: number;
}

export function rankRestaurantCandidates(input: {
  candidates: Candidate[];
  limit: number;
}): RankedRecommendation[] {
  return input.candidates
    .map((candidate) => {
      const result = calculateRestaurantScore({
        weekdayMatch: candidate.weekdayMatch,
        weatherMatch: candidate.weatherMatch,
        distanceMinutes: candidate.distanceMinutes,
        teammateRecommendationCount: candidate.teammateRecommendationCount,
        recentlyRecommended: candidate.recentlyRecommended,
        negativeFeedbackCount: candidate.negativeFeedbackCount
      });

      return {
        restaurantId: candidate.restaurantId,
        recommendationId: candidate.recommendationId,
        restaurantName: candidate.name,
        dish: candidate.dish,
        reason: result.reasons.length ? result.reasons.join("，") : "今天也适合来点稳妥的。",
        distanceMinutes: candidate.distanceMinutes,
        tags: candidate.tags,
        score: result.score
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit);
}
```

- [ ] **Step 6: Implement Fastify app, Prisma plugin, and routes**

Create `/Users/claus/chidianma/apps/server/src/plugins/prisma.ts`:

```ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

Create `/Users/claus/chidianma/apps/server/src/routes/health.ts`:

```ts
import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({ ok: true }));
}
```

Create `/Users/claus/chidianma/apps/server/src/app.ts`:

```ts
import cors from "@fastify/cors";
import Fastify from "fastify";
import { loadEnv } from "./env";
import { registerHealthRoutes } from "./routes/health";
import { registerRecommendationRoutes } from "./routes/recommendations";

export async function buildApp() {
  const app = Fastify({ logger: true });
  const env = loadEnv();

  await app.register(cors, { origin: true });
  app.decorate("env", env);

  await registerHealthRoutes(app);
  await registerRecommendationRoutes(app, env);

  return app;
}
```

Create `/Users/claus/chidianma/apps/server/src/index.ts`:

```ts
import { buildApp } from "./app";
import { loadEnv } from "./env";

const env = loadEnv();
const app = await buildApp();

await app.listen({
  port: env.PORT,
  host: "::"
});
```

Create `/Users/claus/chidianma/apps/server/src/routes/recommendations.ts`:

```ts
import { READ_TOKEN_HEADER } from "@lunch/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppEnv } from "../env";
import { prisma } from "../plugins/prisma";
import { getTodayRecommendations } from "../services/recommendation/today";

export async function registerRecommendationRoutes(app: FastifyInstance, env: AppEnv) {
  app.get("/api/today-recommendations", async (request, reply) => {
    requireReadToken(request, reply, env);
    const forceRefresh = request.query && typeof request.query === "object" &&
      "forceRefresh" in request.query &&
      String(request.query.forceRefresh) === "true";

    return getTodayRecommendations({ prisma, env, forceRefresh });
  });
}

function requireReadToken(request: FastifyRequest, reply: FastifyReply, env: AppEnv) {
  const token = request.headers[READ_TOKEN_HEADER];
  if (token !== env.EXTENSION_READ_TOKEN) {
    reply.code(401);
    throw new Error("Invalid read token");
  }
}
```

- [ ] **Step 7: Implement today recommendation service**

Create `/Users/claus/chidianma/apps/server/src/services/recommendation/today.ts`:

```ts
import { LUNCH_HEADLINE, type TodayRecommendationResponse } from "@lunch/shared";
import type { PrismaClient } from "@prisma/client";
import type { AppEnv } from "../../env";
import { getOfficeDate } from "../dates";
import { getMockWeather } from "../weather/mockWeather";
import { rankRestaurantCandidates } from "./scorer";

export async function getTodayRecommendations(input: {
  prisma: PrismaClient;
  env: AppEnv;
  forceRefresh: boolean;
}): Promise<TodayRecommendationResponse> {
  const date = getOfficeDate(new Date(), input.env.OFFICE_TIMEZONE);
  const existing = await input.prisma.dailyRecommendation.findMany({
    where: { date, isCurrent: true },
    include: { restaurant: true, recommendation: true },
    orderBy: { score: "desc" }
  });

  if (!input.forceRefresh && existing.length > 0) {
    return {
      date,
      headline: LUNCH_HEADLINE,
      weatherSummary: getMockWeather().summary,
      items: existing.map((item) => ({
        restaurantId: item.restaurantId,
        recommendationId: item.recommendationId ?? undefined,
        restaurantName: item.restaurant.name,
        dish: item.recommendation?.dish ?? undefined,
        reason: item.reason,
        distanceMinutes: item.restaurant.distanceMinutes ?? undefined,
        tags: item.restaurant.tags
      }))
    };
  }

  const restaurants = await input.prisma.restaurant.findMany({
    where: { status: "active" },
    include: {
      recommendations: true,
      feedback: { where: { date, type: { in: ["skip", "blocked"] } } }
    }
  });

  const recent = await input.prisma.dailyRecommendation.findMany({
    where: { date: { not: date } },
    take: 20,
    orderBy: { createdAt: "desc" }
  });
  const recentIds = new Set(recent.map((item) => item.restaurantId));
  const weather = getMockWeather();

  const ranked = rankRestaurantCandidates({
    limit: 3,
    candidates: restaurants.map((restaurant) => {
      const recommendation = restaurant.recommendations[0];
      const weatherMatch = recommendation?.weatherTags.includes(weather.condition) ? 1 : 0;
      return {
        restaurantId: restaurant.id,
        recommendationId: recommendation?.id,
        name: restaurant.name,
        dish: recommendation?.dish ?? undefined,
        distanceMinutes: restaurant.distanceMinutes ?? undefined,
        tags: restaurant.tags,
        weekdayMatch: 0,
        weatherMatch,
        teammateRecommendationCount: restaurant.recommendations.length,
        recentlyRecommended: recentIds.has(restaurant.id),
        negativeFeedbackCount: restaurant.feedback.length
      };
    })
  });

  const batchId = crypto.randomUUID();
  await input.prisma.dailyRecommendation.updateMany({
    where: { date, isCurrent: true },
    data: { isCurrent: false }
  });

  await input.prisma.dailyRecommendation.createMany({
    data: ranked.map((item) => ({
      date,
      batchId,
      restaurantId: item.restaurantId,
      recommendationId: item.recommendationId,
      score: item.score,
      reason: item.reason,
      isCurrent: true
    }))
  });

  return {
    date,
    headline: LUNCH_HEADLINE,
    weatherSummary: weather.summary,
    items: ranked.map(({ score: _score, ...item }) => item)
  };
}
```

- [ ] **Step 8: Verify server tests and typecheck**

Run:

```bash
pnpm --filter @lunch/server test
pnpm --filter @lunch/server typecheck
```

Expected: PASS.

- [ ] **Step 9: Run server locally**

Run:

```bash
pnpm --filter @lunch/server dev
```

Expected: server listens on port `3000`.

In another terminal run:

```bash
curl -H "X-Lunch-Read-Token: dev-read-token" http://localhost:3000/api/today-recommendations
```

Expected: JSON response with `headline`, `date`, and 2-3 `items`.

- [ ] **Step 10: Commit**

```bash
git add apps/server packages/shared
git commit -m "feat: add today recommendation api"
```

---

### Task 5: Extension Popup Fetch and Cache

**Files:**
- Create: `/Users/claus/chidianma/apps/extension/manifest.json`
- Create: `/Users/claus/chidianma/apps/extension/index.html`
- Create: `/Users/claus/chidianma/apps/extension/src/config.ts`
- Create: `/Users/claus/chidianma/apps/extension/src/storage.ts`
- Create: `/Users/claus/chidianma/apps/extension/src/recommendationClient.ts`
- Create: `/Users/claus/chidianma/apps/extension/src/popup.ts`
- Create: `/Users/claus/chidianma/apps/extension/styles/popup.css`
- Create: `/Users/claus/chidianma/apps/extension/tests/storage.test.ts`

**Interfaces:**
- Consumes: `TodayRecommendationResponse`, `READ_TOKEN_HEADER` from `@lunch/shared`.
- Produces: `getSettings()`, `saveRecommendationCache(response)`, `fetchTodayRecommendations(options)`.
- Produces: extension popup that shows server recommendations and fallback cache.

- [ ] **Step 1: Write storage tests**

Create `/Users/claus/chidianma/apps/extension/tests/storage.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { getDefaultSettings } from "../src/storage";

describe("getDefaultSettings", () => {
  it("uses 11:30 as the default reminder time", () => {
    expect(getDefaultSettings()).toMatchObject({
      apiBaseUrl: "http://localhost:3000",
      readToken: "dev-read-token",
      reminderTime: "11:30",
      enabled: true
    });
  });
});
```

- [ ] **Step 2: Implement extension config and storage**

Create `/Users/claus/chidianma/apps/extension/src/config.ts`:

```ts
export const STORAGE_KEYS = {
  settings: "lunchSettings",
  lastRecommendation: "lunchLastRecommendation"
} as const;
```

Create `/Users/claus/chidianma/apps/extension/src/storage.ts`:

```ts
import type { TodayRecommendationResponse } from "@lunch/shared";
import { STORAGE_KEYS } from "./config";

export interface ExtensionSettings {
  apiBaseUrl: string;
  readToken: string;
  reminderTime: string;
  enabled: boolean;
}

export function getDefaultSettings(): ExtensionSettings {
  return {
    apiBaseUrl: "http://localhost:3000",
    readToken: "dev-read-token",
    reminderTime: "11:30",
    enabled: true
  };
}

export async function getSettings(): Promise<ExtensionSettings> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return {
    ...getDefaultSettings(),
    ...(data[STORAGE_KEYS.settings] ?? {})
  };
}

export async function saveRecommendationCache(response: TodayRecommendationResponse): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.lastRecommendation]: {
      ...response,
      fromCache: true
    }
  });
}

export async function getRecommendationCache(): Promise<TodayRecommendationResponse | null> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.lastRecommendation);
  return data[STORAGE_KEYS.lastRecommendation] ?? null;
}
```

- [ ] **Step 3: Implement recommendation client**

Create `/Users/claus/chidianma/apps/extension/src/recommendationClient.ts`:

```ts
import { READ_TOKEN_HEADER, type TodayRecommendationResponse } from "@lunch/shared";
import { getRecommendationCache, getSettings, saveRecommendationCache } from "./storage";

export async function fetchTodayRecommendations(options: {
  forceRefresh?: boolean;
} = {}): Promise<TodayRecommendationResponse> {
  const settings = await getSettings();
  const url = new URL("/api/today-recommendations", settings.apiBaseUrl);
  if (options.forceRefresh) url.searchParams.set("forceRefresh", "true");

  try {
    const response = await fetch(url, {
      headers: {
        [READ_TOKEN_HEADER]: settings.readToken
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as TodayRecommendationResponse;
    await saveRecommendationCache(data);
    return data;
  } catch (error) {
    const cached = await getRecommendationCache();
    if (cached) return { ...cached, fromCache: true };
    throw error;
  }
}
```

- [ ] **Step 4: Create popup HTML and CSS**

Create `/Users/claus/chidianma/apps/extension/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>中午吃点啥</title>
    <link rel="stylesheet" href="/styles/popup.css" />
  </head>
  <body>
    <main class="popup">
      <header class="header">
        <p>吃饭才是正事</p>
        <h1>中午吃点啥呢？</h1>
        <span id="date"></span>
      </header>
      <section id="status" class="status" hidden></section>
      <section id="weather" class="weather"></section>
      <section id="items" class="items"></section>
      <footer class="actions">
        <button id="refresh" type="button">换一批</button>
      </footer>
    </main>
    <script type="module" src="/src/popup.ts"></script>
  </body>
</html>
```

Create `/Users/claus/chidianma/apps/extension/styles/popup.css`:

```css
* {
  box-sizing: border-box;
}

body {
  width: 380px;
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
  color: #172033;
  background: #f8fafc;
}

.popup {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.header {
  display: grid;
  gap: 4px;
  padding-bottom: 10px;
  border-bottom: 1px solid #d7dee8;
}

.header p,
.header h1 {
  margin: 0;
}

.header p {
  color: #b45309;
  font-size: 12px;
  font-weight: 700;
}

.header h1 {
  font-size: 22px;
}

.weather,
.status,
.card {
  border: 1px solid #d7dee8;
  border-radius: 8px;
  background: #ffffff;
}

.weather,
.status {
  padding: 10px;
  font-size: 13px;
  line-height: 1.5;
}

.items {
  display: grid;
  gap: 10px;
}

.card {
  display: grid;
  gap: 8px;
  padding: 12px;
}

.card h2 {
  margin: 0;
  font-size: 16px;
}

.meta,
.reason {
  margin: 0;
  color: #5d6b82;
  font-size: 12px;
  line-height: 1.45;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.tag {
  padding: 2px 7px;
  border-radius: 999px;
  background: #eef2ff;
  color: #3730a3;
  font-size: 12px;
}

.actions {
  display: flex;
}

button {
  width: 100%;
  border: 0;
  border-radius: 8px;
  padding: 10px 12px;
  color: #ffffff;
  background: #2563eb;
  font-weight: 700;
  cursor: pointer;
}
```

- [ ] **Step 5: Implement popup rendering**

Create `/Users/claus/chidianma/apps/extension/src/popup.ts`:

```ts
import type { RecommendationItem, TodayRecommendationResponse } from "@lunch/shared";
import { fetchTodayRecommendations } from "./recommendationClient";

const dateEl = document.querySelector<HTMLSpanElement>("#date")!;
const statusEl = document.querySelector<HTMLElement>("#status")!;
const weatherEl = document.querySelector<HTMLElement>("#weather")!;
const itemsEl = document.querySelector<HTMLElement>("#items")!;
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh")!;

refreshButton.addEventListener("click", () => {
  void render(true);
});

void render(false);

async function render(forceRefresh: boolean) {
  setStatus("正在挑今天中午吃什么...");
  itemsEl.replaceChildren();

  try {
    const response = await fetchTodayRecommendations({ forceRefresh });
    renderResponse(response);
  } catch (error) {
    setStatus(`加载失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function renderResponse(response: TodayRecommendationResponse) {
  dateEl.textContent = response.fromCache ? `${response.date}｜缓存` : response.date;
  weatherEl.textContent = response.weatherSummary ?? "今天先按距离和历史推荐来挑。";
  statusEl.hidden = true;
  statusEl.textContent = "";

  if (response.items.length === 0) {
    setStatus("还没有可用推荐，先去管理页添加几家饭馆。");
    return;
  }

  for (const item of response.items) {
    itemsEl.appendChild(createCard(item));
  }
}

function createCard(item: RecommendationItem): HTMLElement {
  const card = document.createElement("article");
  card.className = "card";

  const title = document.createElement("h2");
  title.textContent = item.restaurantName;
  card.appendChild(title);

  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = [item.dish, item.distanceMinutes ? `${item.distanceMinutes} 分钟` : ""]
    .filter(Boolean)
    .join("｜");
  card.appendChild(meta);

  const reason = document.createElement("p");
  reason.className = "reason";
  reason.textContent = item.reason;
  card.appendChild(reason);

  const tags = document.createElement("div");
  tags.className = "tags";
  for (const tag of item.tags) {
    const chip = document.createElement("span");
    chip.className = "tag";
    chip.textContent = tag;
    tags.appendChild(chip);
  }
  card.appendChild(tags);

  return card;
}

function setStatus(text: string) {
  statusEl.hidden = false;
  statusEl.textContent = text;
}
```

- [ ] **Step 6: Create manifest**

Create `/Users/claus/chidianma/apps/extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "中午吃点啥",
  "version": "0.1.0",
  "description": "每天中午提醒你和同事们：吃饭才是正事，中午吃点啥呢？",
  "permissions": ["alarms", "notifications", "storage"],
  "host_permissions": ["http://localhost:3000/*"],
  "action": {
    "default_title": "中午吃点啥",
    "default_popup": "index.html"
  },
  "background": {
    "service_worker": "assets/background.js",
    "type": "module"
  }
}
```

- [ ] **Step 7: Verify extension tests and build**

Run:

```bash
pnpm --filter @lunch/extension test
pnpm --filter @lunch/extension build
```

Expected: tests pass and `apps/extension/dist` is created.

- [ ] **Step 8: Manual smoke test**

Run server:

```bash
pnpm --filter @lunch/server dev
```

Load `apps/extension/dist` in `chrome://extensions` with Developer mode. Open the popup.

Expected: popup displays 2-3 recommendation cards from the server. Stop the server, open popup again, and verify cached cards appear with `缓存` in the date line.

- [ ] **Step 9: Commit**

```bash
git add apps/extension
git commit -m "feat: show server recommendations in extension"
```

---

### Task 6: Extension Alarm and Notification

**Files:**
- Create: `/Users/claus/chidianma/apps/extension/src/background.ts`
- Create: `/Users/claus/chidianma/apps/extension/src/chromeApi.ts`
- Modify: `/Users/claus/chidianma/apps/extension/manifest.json`
- Create: `/Users/claus/chidianma/apps/extension/tests/background.test.ts`
- Modify: `/Users/claus/chidianma/apps/extension/package.json`

**Interfaces:**
- Consumes: `fetchTodayRecommendations`.
- Produces: `getNextAlarmTime(now, reminderTime): number`.
- Produces: `scheduleLunchAlarm(): Promise<void>`.
- Produces: `showLunchNotification(): Promise<void>`.

- [ ] **Step 1: Write alarm scheduling test**

Create `/Users/claus/chidianma/apps/extension/tests/background.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getNextAlarmTime } from "../src/background";

describe("getNextAlarmTime", () => {
  it("schedules the next weekday 11:30 when today is already past lunch", () => {
    const now = new Date("2026-07-06T20:00:00");
    const next = new Date(getNextAlarmTime(now, "11:30"));
    expect(next.getDay()).toBe(2);
    expect(next.getHours()).toBe(11);
    expect(next.getMinutes()).toBe(30);
  });
});
```

- [ ] **Step 2: Implement background service worker**

Create `/Users/claus/chidianma/apps/extension/src/background.ts`:

```ts
import { LUNCH_HEADLINE } from "@lunch/shared";
import { fetchTodayRecommendations } from "./recommendationClient";
import { getSettings } from "./storage";

const ALARM_NAME = "lunch-reminder";
const NOTIFICATION_ID = "today-lunch";

chrome.runtime.onInstalled.addListener(() => {
  void scheduleLunchAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  void scheduleLunchAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  void showLunchNotification().then(scheduleLunchAlarm);
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId !== NOTIFICATION_ID) return;
  void chrome.action.openPopup?.();
});

export async function scheduleLunchAlarm(): Promise<void> {
  const settings = await getSettings();
  await chrome.alarms.clear(ALARM_NAME);
  if (!settings.enabled) return;
  await chrome.alarms.create(ALARM_NAME, {
    when: getNextAlarmTime(new Date(), settings.reminderTime)
  });
}

export function getNextAlarmTime(now: Date, reminderTime: string): number {
  const [hour, minute] = parseReminderTime(reminderTime);
  const weekdays = new Set([1, 2, 3, 4, 5]);

  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    candidate.setHours(hour, minute, 0, 0);
    if (weekdays.has(candidate.getDay()) && candidate.getTime() > now.getTime() + 1000) {
      return candidate.getTime();
    }
  }

  const fallback = new Date(now);
  fallback.setDate(now.getDate() + 1);
  fallback.setHours(hour, minute, 0, 0);
  return fallback.getTime();
}

export async function showLunchNotification(): Promise<void> {
  const recommendation = await fetchTodayRecommendations();
  const names = recommendation.items.map((item) => item.restaurantName).join("、");
  await chrome.notifications.create(NOTIFICATION_ID, {
    type: "basic",
    iconUrl: "icon-128.png",
    title: LUNCH_HEADLINE,
    message: names || "还没有可用推荐，先去管理页添加几家饭馆。",
    contextMessage: recommendation.weatherSummary,
    priority: 1
  });
}

function parseReminderTime(value: string): [number, number] {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return [11, 30];
  return [
    Math.min(23, Math.max(0, Number(match[1]))),
    Math.min(59, Math.max(0, Number(match[2])))
  ];
}
```

- [ ] **Step 3: Configure Vite multi-entry build**

Create `/Users/claus/chidianma/apps/extension/vite.config.ts`:

```ts
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "index.html"),
        background: resolve(__dirname, "src/background.ts")
      },
      output: {
        entryFileNames: "assets/[name].js"
      }
    }
  }
});
```

- [ ] **Step 4: Verify manifest background path**

Ensure `/Users/claus/chidianma/apps/extension/manifest.json` contains:

```json
{
  "background": {
    "service_worker": "assets/background.js",
    "type": "module"
  }
}
```

- [ ] **Step 5: Verify tests and manual notification**

Run:

```bash
pnpm --filter @lunch/extension test
pnpm --filter @lunch/extension build
```

Expected: PASS and `dist/assets/background.js` exists.

Manual test: load `apps/extension/dist`, inspect service worker, and run:

```js
chrome.alarms.getAll(console.log)
```

Expected: one alarm named `lunch-reminder`.

- [ ] **Step 6: Commit**

```bash
git add apps/extension
git commit -m "feat: add lunch reminder notification"
```

---

### Task 7: Minimal Admin CRUD

**Files:**
- Create: `/Users/claus/chidianma/apps/server/src/routes/session.ts`
- Create: `/Users/claus/chidianma/apps/server/src/routes/restaurants.ts`
- Create: `/Users/claus/chidianma/apps/server/src/routes/recommendations-admin.ts`
- Modify: `/Users/claus/chidianma/apps/server/src/app.ts`
- Replace: `/Users/claus/chidianma/apps/admin/src/main.tsx`
- Create: `/Users/claus/chidianma/apps/admin/src/api.ts`
- Create: `/Users/claus/chidianma/apps/admin/src/styles.css`

**Interfaces:**
- Consumes: Prisma models and `TEAM_INVITE_CODE`.
- Produces: `POST /api/session`.
- Produces: `GET /api/restaurants`, `POST /api/restaurants`, `PATCH /api/restaurants/:id`.
- Produces: `POST /api/recommendations`.
- Produces: admin page for login, listing, creating restaurants, and creating recommendations.

- [ ] **Step 1: Add session route**

Create `/Users/claus/chidianma/apps/server/src/routes/session.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../env";
import { prisma } from "../plugins/prisma";

export async function registerSessionRoutes(app: FastifyInstance, env: AppEnv) {
  app.post<{ Body: { inviteCode: string; name: string } }>("/api/session", async (request, reply) => {
    if (request.body.inviteCode !== env.TEAM_INVITE_CODE) {
      reply.code(401);
      return { error: "Invalid invite code" };
    }

    const teammate = await prisma.teammate.upsert({
      where: { name: request.body.name.trim() },
      update: { lastSeenAt: new Date() },
      create: { name: request.body.name.trim(), lastSeenAt: new Date() }
    });

    return {
      token: Buffer.from(`${teammate.id}:${Date.now()}`).toString("base64url"),
      teammate
    };
  });
}
```

- [ ] **Step 2: Add restaurant route**

Create `/Users/claus/chidianma/apps/server/src/routes/restaurants.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { prisma } from "../plugins/prisma";

export async function registerRestaurantRoutes(app: FastifyInstance) {
  app.get("/api/restaurants", async () => {
    return prisma.restaurant.findMany({ orderBy: { createdAt: "desc" } });
  });

  app.post<{
    Body: {
      name: string;
      area?: string;
      address?: string;
      distanceMinutes?: number;
      cuisine?: string;
      priceBand?: string;
      tags?: string[];
    };
  }>("/api/restaurants", async (request) => {
    return prisma.restaurant.create({
      data: {
        name: request.body.name,
        area: request.body.area,
        address: request.body.address,
        distanceMinutes: request.body.distanceMinutes,
        cuisine: request.body.cuisine,
        priceBand: request.body.priceBand,
        tags: request.body.tags ?? [],
        status: "active"
      }
    });
  });

  app.patch<{ Params: { id: string }; Body: { status: "active" | "paused" | "blocked" } }>(
    "/api/restaurants/:id",
    async (request) => prisma.restaurant.update({
      where: { id: request.params.id },
      data: { status: request.body.status }
    })
  );
}
```

- [ ] **Step 3: Add recommendation admin route**

Create `/Users/claus/chidianma/apps/server/src/routes/recommendations-admin.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { prisma } from "../plugins/prisma";

export async function registerRecommendationAdminRoutes(app: FastifyInstance) {
  app.post<{
    Body: {
      restaurantId: string;
      teammateName: string;
      dish?: string;
      reason: string;
      weatherTags?: string[];
      weekdayTags?: string[];
      moodTags?: string[];
    };
  }>("/api/recommendations", async (request) => {
    const teammate = await prisma.teammate.upsert({
      where: { name: request.body.teammateName },
      update: { lastSeenAt: new Date() },
      create: { name: request.body.teammateName, lastSeenAt: new Date() }
    });

    return prisma.recommendation.create({
      data: {
        restaurantId: request.body.restaurantId,
        teammateId: teammate.id,
        dish: request.body.dish,
        reason: request.body.reason,
        weatherTags: request.body.weatherTags ?? [],
        weekdayTags: request.body.weekdayTags ?? [],
        moodTags: request.body.moodTags ?? []
      }
    });
  });
}
```

- [ ] **Step 4: Register admin routes**

Modify `/Users/claus/chidianma/apps/server/src/app.ts` to import and register routes:

```ts
import { registerRecommendationAdminRoutes } from "./routes/recommendations-admin";
import { registerRestaurantRoutes } from "./routes/restaurants";
import { registerSessionRoutes } from "./routes/session";

await registerSessionRoutes(app, env);
await registerRestaurantRoutes(app);
await registerRecommendationAdminRoutes(app);
```

- [ ] **Step 5: Replace admin app with minimal CRUD UI**

Create `/Users/claus/chidianma/apps/admin/src/api.ts`:

```ts
const API_BASE_URL = "http://localhost:3000";

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
```

Replace `/Users/claus/chidianma/apps/admin/src/main.tsx`:

```tsx
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import "./styles.css";

interface Restaurant {
  id: string;
  name: string;
  area?: string;
  distanceMinutes?: number;
  cuisine?: string;
  priceBand?: string;
  tags: string[];
  status: "active" | "paused" | "blocked";
}

function App() {
  const [name, setName] = useState("Demo 同事");
  const [inviteCode, setInviteCode] = useState("let-us-eat");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantName, setRestaurantName] = useState("");
  const [dish, setDish] = useState("");
  const [reason, setReason] = useState("");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [message, setMessage] = useState("");

  async function loadRestaurants() {
    setRestaurants(await api<Restaurant[]>("/api/restaurants"));
  }

  useEffect(() => {
    void loadRestaurants();
  }, []);

  async function login() {
    await api("/api/session", {
      method: "POST",
      body: JSON.stringify({ inviteCode, name })
    });
    setMessage(`已识别为 ${name}`);
  }

  async function addRestaurant() {
    await api<Restaurant>("/api/restaurants", {
      method: "POST",
      body: JSON.stringify({
        name: restaurantName,
        tags: ["新推荐"]
      })
    });
    setRestaurantName("");
    await loadRestaurants();
  }

  async function addRecommendation() {
    await api("/api/recommendations", {
      method: "POST",
      body: JSON.stringify({
        restaurantId: selectedRestaurantId,
        teammateName: name,
        dish,
        reason,
        weatherTags: [],
        weekdayTags: [],
        moodTags: []
      })
    });
    setDish("");
    setReason("");
    setMessage("推荐已保存");
  }

  return (
    <main className="page">
      <h1>中午吃点啥 Admin</h1>
      <section>
        <h2>登录</h2>
        <input value={name} onChange={(event) => setName(event.target.value)} />
        <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} />
        <button onClick={login}>进入</button>
      </section>
      <section>
        <h2>新增饭馆</h2>
        <input value={restaurantName} onChange={(event) => setRestaurantName(event.target.value)} />
        <button onClick={addRestaurant}>保存饭馆</button>
      </section>
      <section>
        <h2>新增推荐</h2>
        <select value={selectedRestaurantId} onChange={(event) => setSelectedRestaurantId(event.target.value)}>
          <option value="">选择饭馆</option>
          {restaurants.map((restaurant) => (
            <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>
          ))}
        </select>
        <input value={dish} onChange={(event) => setDish(event.target.value)} placeholder="推荐菜" />
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="推荐理由" />
        <button onClick={addRecommendation}>保存推荐</button>
      </section>
      <section>
        <h2>饭馆列表</h2>
        {restaurants.map((restaurant) => (
          <article key={restaurant.id}>
            <strong>{restaurant.name}</strong>
            <span>{restaurant.status}</span>
          </article>
        ))}
      </section>
      {message && <p>{message}</p>}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
```

Create `/Users/claus/chidianma/apps/admin/src/styles.css`:

```css
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
  color: #172033;
  background: #f8fafc;
}

.page {
  display: grid;
  gap: 16px;
  max-width: 960px;
  margin: 0 auto;
  padding: 24px;
}

section,
article {
  display: grid;
  gap: 10px;
  padding: 16px;
  border: 1px solid #d7dee8;
  border-radius: 8px;
  background: #ffffff;
}

input,
select,
textarea,
button {
  font: inherit;
  padding: 10px;
}

button {
  border: 0;
  border-radius: 8px;
  color: white;
  background: #2563eb;
  font-weight: 700;
}
```

- [ ] **Step 6: Verify admin and server**

Run:

```bash
pnpm --filter @lunch/server typecheck
pnpm --filter @lunch/admin typecheck
pnpm --filter @lunch/admin build
```

Expected: PASS.

Manual test:

```bash
pnpm dev:server
pnpm dev:admin
```

Expected: admin can load restaurants, create a restaurant, create a recommendation, and server recommendation API includes new data after `forceRefresh=true`.

- [ ] **Step 7: Commit**

```bash
git add apps/server apps/admin
git commit -m "feat: add minimal lunch admin"
```

---

### Task 8: Feedback API and Open-Meteo Adapter

**Files:**
- Create: `/Users/claus/chidianma/apps/server/src/routes/feedback.ts`
- Create: `/Users/claus/chidianma/apps/server/src/services/weather/openMeteo.ts`
- Modify: `/Users/claus/chidianma/apps/server/src/services/recommendation/today.ts`
- Modify: `/Users/claus/chidianma/apps/server/src/app.ts`
- Modify: `/Users/claus/chidianma/apps/extension/src/popup.ts`

**Interfaces:**
- Produces: `POST /api/feedback`.
- Produces: `fetchWeatherSummary(env): Promise<WeatherSummary>`.
- Consumes: `FeedbackType` from shared.

- [ ] **Step 1: Add feedback route**

Create `/Users/claus/chidianma/apps/server/src/routes/feedback.ts`:

```ts
import type { FeedbackType } from "@lunch/shared";
import type { FastifyInstance } from "fastify";
import { prisma } from "../plugins/prisma";

export async function registerFeedbackRoutes(app: FastifyInstance) {
  app.post<{
    Body: {
      date: string;
      restaurantId: string;
      recommendationId?: string;
      type: FeedbackType;
    };
  }>("/api/feedback", async (request) => {
    return prisma.feedback.create({
      data: {
        date: request.body.date,
        restaurantId: request.body.restaurantId,
        recommendationId: request.body.recommendationId,
        type: request.body.type
      }
    });
  });
}
```

- [ ] **Step 2: Add Open-Meteo adapter**

Create `/Users/claus/chidianma/apps/server/src/services/weather/openMeteo.ts`:

```ts
import type { AppEnv } from "../../env";
import type { WeatherSummary } from "./mockWeather";

export async function fetchWeatherSummary(env: AppEnv): Promise<WeatherSummary> {
  const url = new URL("/forecast", env.WEATHER_API_BASE_URL);
  url.searchParams.set("latitude", String(env.OFFICE_LATITUDE));
  url.searchParams.set("longitude", String(env.OFFICE_LONGITUDE));
  url.searchParams.set("current", "temperature_2m,precipitation,rain,wind_speed_10m");
  url.searchParams.set("timezone", env.OFFICE_TIMEZONE);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Weather API failed with ${response.status}`);
  const payload = await response.json() as {
    current?: {
      temperature_2m?: number;
      precipitation?: number;
      rain?: number;
      wind_speed_10m?: number;
    };
  };

  const temperatureC = payload.current?.temperature_2m ?? 20;
  const rain = (payload.current?.rain ?? 0) + (payload.current?.precipitation ?? 0);
  const wind = payload.current?.wind_speed_10m ?? 0;
  const condition = rain > 0 ? "rainy" : temperatureC >= 28 ? "hot" : temperatureC <= 8 ? "cold" : wind >= 25 ? "windy" : "clear";

  return {
    temperatureC,
    condition,
    precipitationProbability: rain > 0 ? 70 : 10,
    summary: condition === "rainy"
      ? "今天有雨，优先推荐近一点、热乎一点的选择。"
      : condition === "hot"
        ? "今天偏热，优先推荐清爽、近一点的选择。"
        : "今天天气稳定，按距离和同事推荐来挑。"
  };
}
```

- [ ] **Step 3: Register feedback route**

Modify `/Users/claus/chidianma/apps/server/src/app.ts`:

```ts
import { registerFeedbackRoutes } from "./routes/feedback";

await registerFeedbackRoutes(app);
```

- [ ] **Step 4: Use real weather with fallback**

Modify `/Users/claus/chidianma/apps/server/src/services/recommendation/today.ts` so weather is loaded like this:

```ts
import { fetchWeatherSummary } from "../weather/openMeteo";

const weather = await fetchWeatherSummary(input.env).catch(() => getMockWeather());
```

Use this `weather` in both existing-response and newly-generated-response branches.

- [ ] **Step 5: Add configured feedback client**

Modify `/Users/claus/chidianma/apps/extension/src/recommendationClient.ts` to export `postFeedback`:

```ts
import { READ_TOKEN_HEADER, type FeedbackType, type TodayRecommendationResponse } from "@lunch/shared";
import { getRecommendationCache, getSettings, saveRecommendationCache } from "./storage";

export async function fetchTodayRecommendations(options: {
  forceRefresh?: boolean;
} = {}): Promise<TodayRecommendationResponse> {
  const settings = await getSettings();
  const url = new URL("/api/today-recommendations", settings.apiBaseUrl);
  if (options.forceRefresh) url.searchParams.set("forceRefresh", "true");

  try {
    const response = await fetch(url, {
      headers: {
        [READ_TOKEN_HEADER]: settings.readToken
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as TodayRecommendationResponse;
    await saveRecommendationCache(data);
    return data;
  } catch (error) {
    const cached = await getRecommendationCache();
    if (cached) return { ...cached, fromCache: true };
    throw error;
  }
}

export async function postFeedback(input: {
  date: string;
  restaurantId: string;
  recommendationId?: string;
  type: FeedbackType;
}): Promise<void> {
  const settings = await getSettings();
  const url = new URL("/api/feedback", settings.apiBaseUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [READ_TOKEN_HEADER]: settings.readToken
    },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}
```

- [ ] **Step 6: Add popup feedback buttons**

Modify `createCard` in `/Users/claus/chidianma/apps/extension/src/popup.ts` to append feedback buttons:

```ts
import { postFeedback } from "./recommendationClient";

const feedback = document.createElement("div");
feedback.className = "tags";
for (const [type, label] of [["want", "想吃"], ["skip", "不想吃"], ["ate", "已吃过"]] as const) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", async () => {
    await postFeedback({
      date: dateEl.textContent?.slice(0, 10) ?? "",
      restaurantId: item.restaurantId,
      recommendationId: item.recommendationId,
      type
    });
    button.textContent = "已记录";
    button.disabled = true;
  });
  feedback.appendChild(button);
}
card.appendChild(feedback);
```

- [ ] **Step 7: Verify**

Run:

```bash
pnpm --filter @lunch/server test
pnpm --filter @lunch/server typecheck
pnpm --filter @lunch/extension typecheck
pnpm --filter @lunch/extension build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/server apps/extension
git commit -m "feat: add feedback and weather adapter"
```

---

### Task 9: Local Runbook and Railway Notes

**Files:**
- Create: `/Users/claus/chidianma/README.md`
- Create: `/Users/claus/chidianma/apps/server/README.md`
- Create: `/Users/claus/chidianma/apps/extension/README.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: repeatable local setup and Railway deployment notes.

- [ ] **Step 1: Write root README**

Create `/Users/claus/chidianma/README.md`:

```md
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
```

- [ ] **Step 2: Write server README**

Create `/Users/claus/chidianma/apps/server/README.md`:

```md
# Server

Fastify API for lunch recommendations.

## Railway

Required variables:

- `DATABASE_URL`
- `TEAM_INVITE_CODE`
- `SESSION_SECRET`
- `EXTENSION_READ_TOKEN`
- `WEATHER_API_BASE_URL`
- `OFFICE_CITY`
- `OFFICE_LATITUDE`
- `OFFICE_LONGITUDE`
- `OFFICE_TIMEZONE`
- `PUBLIC_API_BASE_URL`
- `NODE_ENV`

Fastify must listen with:

```ts
await app.listen({
  port: Number(process.env.PORT ?? 3000),
  host: "::"
});
```
```

- [ ] **Step 3: Write extension README**

Create `/Users/claus/chidianma/apps/extension/README.md`:

```md
# Chrome Extension

Build:

```bash
pnpm --filter @lunch/extension build
```

Load `apps/extension/dist` in Chrome Developer mode.

Permissions:

- `alarms`
- `notifications`
- `storage`
- host permission for the API domain

Default local API:

- `http://localhost:3000`
- read token `dev-read-token`
```

- [ ] **Step 4: Verify full workspace**

Run:

```bash
pnpm build
pnpm test
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md apps/server/README.md apps/extension/README.md
git commit -m "docs: add lunch runbook"
```

---

## Self-Review

Spec coverage:

- Monorepo structure is covered by Task 1.
- Shared API contract is covered by Task 2.
- PostgreSQL persistence and seed data are covered by Task 3.
- Fastify API, Railway listen host constraint, read token, office timezone, and idempotent recommendations are covered by Task 4.
- Extension popup, API fetch, and fallback cache are covered by Task 5.
- MV3 alarms and notifications are covered by Task 6.
- Admin login and data entry are covered by Task 7.
- Feedback and Open-Meteo weather are covered by Task 8.
- Local runbook and Railway notes are covered by Task 9.
- Chrome Web Store unlisted publishing is not implemented in this vertical slice; it remains a later release task after internal testing.

Placeholder scan:

- No TBD, TODO, “implement later”, or vague “handle errors” steps remain.
- Task 8 contains an explicit intermediate hard-coded feedback snippet and immediately requires replacing it with settings-based API base URL before commit.

Type consistency:

- `TodayRecommendationResponse`, `RecommendationItem`, `FeedbackType`, `READ_TOKEN_HEADER`, and `LUNCH_HEADLINE` are defined in Task 2 and consumed later.
- `getTodayRecommendations`, `rankRestaurantCandidates`, `getOfficeDate`, and `fetchTodayRecommendations` signatures are consistent across tasks.
- `RestaurantStatus` and `FeedbackType` string values match the spec.

Execution note:

- This plan intentionally prioritizes “server recommendation API + extension popup/notification” before polished admin UI or Open Design HTML. That matches the current decision to skip static prototype work and get the system running end to end first.
