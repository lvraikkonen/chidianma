# Stage 4A Extension Prototype UI Wiring QA

Date: 2026-07-13

Tested commit: `d45878dd8a0d69b7368722a292793ac28ffe3423`

Chrome version: `Google Chrome 150.0.7871.114`

- `chrome://version` could not be read by the browser automation layer because Chrome internal URLs are blocked by policy.
- Version above was captured from `node scripts/installed-browsers.js --check`.

Server URL used: `http://localhost:3000`

- `pnpm dev:server` in the sandbox failed with `listen EPERM` on the `tsx watch` local pipe.
- `pnpm dev:server` was rerun with approved escalation and logged `Server listening at http://[::]:3000`.
- `curl --noproxy '*' -sS -i http://localhost:3000/api/groups` from the same non-sandbox context exited 0 and returned `401 Unauthorized` with `{"error":"missing_token","message":"Authorization bearer token is required"}`.

## Automated Verification

| Command | Exit | Observed result |
| --- | ---: | --- |
| `pnpm --filter @lunch/shared test` | 0 | Vitest: 2 files passed, 14 tests passed. |
| `pnpm --filter @lunch/extension test` | 0 | Vitest: 13 files passed, 175 tests passed. |
| `pnpm --filter @lunch/extension typecheck` | 0 | `tsc -p tsconfig.json --noEmit` completed. |
| `pnpm --filter @lunch/extension build` | 0 | Vite built 29 modules and emitted extension dist files. |
| `test -f apps/extension/dist/manifest.json` | 0 | Manifest exists. |
| `rg -n '"permissions": \["alarms", "notifications", "storage"\]' apps/extension/dist/manifest.json` | 0 | Matched line 6: `"permissions": ["alarms", "notifications", "storage"],`. |
| `rg -n 'identityToken\|groupSessionToken' apps/extension/dist/options.html` | 1 | No matches, as expected for hidden raw-token fields. |

## Handoff Regression

| Command | Exit | Observed result |
| --- | ---: | --- |
| `pnpm test` | 0 | Recursive tests passed: shared 14, admin 3, extension 175, server 157. Tool output was truncated, but package summaries were visible. |
| `pnpm typecheck` | 0 | Shared, admin, extension, and server typechecks completed. |
| `pnpm build` | 0 | Shared, extension, admin, and server builds completed. Extension build transformed 29 modules. |

## Chrome Diagnostics

| Check | Exit | Observed result |
| --- | ---: | --- |
| `chrome-is-running.js --check` | 0 | Google Chrome running: yes. |
| `node scripts/installed-browsers.js --check` | 0 | Google Chrome installed at `/Applications/Google Chrome.app`, version `150.0.7871.114`. |
| `check-extension-installed.js --json` | 0 | ChatGPT Chrome Extension installed and enabled in the selected `Default` profile. |
| `node scripts/check-native-host-manifest.js --json` | 0 | Native host manifest exists and is correct. |
| Open Chrome selected profile and retry connection | 0 | Opened Chrome `Default` profile and Chrome browser-control connection recovered. |
| Chrome open tabs | 0 | Saw `chrome://extensions/` plus `chrome-extension://niafjomckfokgndhechlhlnblecnjmfl/options.html`, title `中午吃点啥设置`. |
| Inspect extension options page by automation | blocked | Browser policy rejected access to `chrome-extension://niafjomckfokgndhechlhlnblecnjmfl/options.html`; extension pages could not be read or operated by automation. User-assisted manual QA was used for the extension pages. |

## Manual QA Execution Notes

- Manual validation was performed with the user operating the Chrome extension because the automation layer cannot inspect `chrome://extensions/` or `chrome-extension://...` pages.
- Extension ID observed in Chrome: `niafjomckfokgndhechlhlnblecnjmfl`.
- Test identity/group flow:
  - `QA A` created `QA Group A`.
  - One-time invite displayed after group creation: `LUNCH-UHP9HK`.
  - `QA B` joined `QA Group A`, then created and switched to `QA Group B`.
- Server-side evidence from local Fastify logs included identity creation, group create/join/session requests, `GET /today-recommendations` returning 404 before generation, refresh/generate returning 200, restaurant/recommendation creation returning 200, participation reads/updates returning 200, and session-expired returning 401 under a temporary invalid signing secret.
- Removed-member was simulated by temporarily setting membership `cmrj9j5xz000b0jjojp8c5qp7` (`QA B` in `QA Group B`) to `removed`, then restoring it to `active`.
- Session-expired was simulated by stopping the normal server and starting it with `SESSION_SECRET=qa-session-expired-secret`; the extension reported `连接已失效，请重新建立身份。`.
- Quick-add partial success was simulated with a local one-shot QA proxy:
  - Real server: `http://localhost:3002`.
  - Proxy exposed to extension: `http://localhost:3000`.
  - Proxy failed only the first `POST /api/groups/:groupId/recommendations` with 503, while forwarding all other requests.
  - User saw `餐厅已保存，推荐尚未保存。`, then clicked retry and the recommendation creation succeeded.
  - Database verification for `QA 粥铺` returned `restaurantCount: 1` and `recommendationCount: 1`, confirming retry did not duplicate the restaurant.
- Weather available evidence: current `QA Group B` batch `cmrj9oz8f000l0jjopg2t3pa7` had `weatherSnapshotId: cmrj9m0x3000d0jjoiv0iwsxm`; the snapshot was `Shanghai`, `hot`, `29.1°C`, precipitation probability `10`.
- Weather unavailable was simulated by temporarily deleting that local weather snapshot; popup displayed `天气暂不可用，今天已按其他真实因素推荐。`; the snapshot was then restored with the same id and values.

## Manual State Coverage

| Manual state | Result | Evidence / notes |
| --- | --- | --- |
| Disconnected popup and settings entry | PASS | User started from the extension settings connection flow and completed the first group setup. |
| Identity creation, group creation, one-time invite display, and invite join | PASS | `QA A` created `QA Group A`; settings displayed `小组已创建。请立即保存邀请码：LUNCH-UHP9HK`; `QA B` joined with that invite. |
| Group list and switch; failed switch leaves the previous group active | PASS | User confirmed the second group flow passed, including group list/switch between `QA Group A` and `QA Group B`; after stopping the server, a failed switch did not replace the current cached group state. |
| No-current-batch generate | PASS | User confirmed the third group passed from no-current-batch through generate; server logs showed `GET /today-recommendations` 404 followed by refresh 200 for `QA Group B`. |
| Ready popup with weather available and unavailable | PASS | Ready popup was validated during the fourth group. Weather available was backed by current batch `weatherSnapshotId` `cmrj9m0x3000d0jjoiv0iwsxm`; after temporarily deleting that snapshot, popup displayed `天气暂不可用，今天已按其他真实因素推荐。`; snapshot was restored. |
| Participation joining/away, decision, and four feedback types | PASS | User confirmed the fourth group passed; server logs showed participation read/update requests returning 200, and the user completed participation, decision, and four feedback controls in the popup/detail flow. |
| Cached current-group-only read-only state after stopping the server | PASS | User confirmed the fifth group passed after the server was stopped; popup used the current group's cached recommendations and did not expose normal write behavior. |
| Session-expired and removed-member state | PASS | Removed-member simulation displayed `先连接一个午饭小组` after refreshing popup. Temporary invalid `SESSION_SECRET` produced `连接已失效，请重新建立身份。`; server logged `GET /api/groups` 401. |
| Empty recommendation state and quick-add | PASS | User confirmed the third group passed and created a new restaurant/recommendation (`QA 面馆`, dish `番茄牛肉面`, reason `手动 QA 推荐，出餐快`). |
| Quick-add partial success by failing the recommendation request after restaurant creation, then retrying only recommendation creation | PASS | One-shot local QA proxy failed only the first recommendation create. User saw `餐厅已保存，推荐尚未保存。`; retry succeeded. DB verification for `QA 粥铺` returned one restaurant and one recommendation. |
| Popup inline detail and standalone `detail.html` fallback | PASS | User confirmed the fourth group popup inline detail passed. User opened `chrome-extension://niafjomckfokgndhechlhlnblecnjmfl/detail.html`; standalone detail page loaded and showed `今日第 1 选 QA 面馆`. |
| Reminder rescheduling after a group-local override | PASS | User saved the active group local reminder override in settings and confirmed the eighth group passed. |
| No faux toolbar, prototype nav, static people/restaurants/weather, or history view | PASS | User visually inspected settings, popup, and detail and confirmed none of the excluded prototype/demo surfaces were present. |

## Known Issues

- Browser automation cannot inspect or operate `chrome://extensions/` and `chrome-extension://...` pages in this environment, so Chrome extension UI evidence is user-assisted rather than automation-captured.
- Standalone `detail.html` is functional, but manual QA noted it is visually plain compared with the rest of the extension.
