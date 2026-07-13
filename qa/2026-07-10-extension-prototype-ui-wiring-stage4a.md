# Stage 4A Extension Prototype UI Wiring QA

Date: 2026-07-13

Tested commit: `00a6a9b60dff5010fe403c23e6266ac08db47e70`

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
| Inspect extension options page | blocked | Browser policy rejected access to `chrome-extension://niafjomckfokgndhechlhlnblecnjmfl/options.html`; extension pages could not be read or operated by automation. |

## Manual State Coverage

| Manual state | Result | Evidence / notes |
| --- | --- | --- |
| Disconnected popup and settings entry | BLOCKED | Extension options tab was visible, but `chrome-extension://.../options.html` access was blocked by browser policy before DOM inspection. |
| Identity creation, group creation, one-time invite display, and invite join | BLOCKED | Local server was available, but extension settings UI could not be operated by automation. |
| Group list and switch; failed switch leaves the previous group active | BLOCKED | Requires extension settings UI interaction; extension page access was blocked. |
| No-current-batch generate | BLOCKED | Requires popup UI interaction; extension pages could not be opened or inspected by automation. |
| Ready popup with weather available and unavailable | BLOCKED | Requires popup UI plus controlled server/weather states; extension pages were blocked. |
| Participation joining/away, decision, and four feedback types | BLOCKED | Requires popup/detail UI interaction; extension pages were blocked. |
| Cached current-group-only read-only state after stopping the server | BLOCKED | Requires a prior successful popup cache and server stop; extension pages were blocked. |
| Session-expired and removed-member state | BLOCKED | Requires extension UI state transitions; extension pages were blocked. |
| Empty recommendation state and quick-add | BLOCKED | Requires popup quick-add UI; extension pages were blocked. |
| Quick-add partial success by failing the recommendation request after restaurant creation, then retrying only recommendation creation | BLOCKED | Requires interactive quick-add flow and request failure control; extension pages were blocked. |
| Popup inline detail and standalone `detail.html` fallback | BLOCKED | Requires popup/detail UI; extension pages were blocked. |
| Reminder rescheduling after a group-local override | BLOCKED | Requires extension settings UI and Chrome alarm observation; extension pages were blocked. |
| No faux toolbar, prototype nav, static people/restaurants/weather, or history view | BLOCKED | Requires visual inspection of extension pages; extension pages were blocked. |

## Known Issues

- Chrome Developer Mode manual validation was not completed. Browser automation could see that `中午吃点啥设置` was open at `chrome-extension://niafjomckfokgndhechlhlnblecnjmfl/options.html`, but policy blocked reading or operating extension pages.
- Because the manual Chrome state coverage is blocked, Stage 4A is not marked complete.
