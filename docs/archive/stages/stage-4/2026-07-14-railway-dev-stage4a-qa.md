# Stage 4A Railway Dev QA

Date: 2026-07-14

Tested commit: `2a5da230cfe2d12b04555f30f92cefd18b73cc81`

Branch: `main`

Railway API base URL: `https://lunchserver-production.up.railway.app`

Chrome version: `Google Chrome 150.0.7871.115`

## Scope

This is a post-deploy Railway dev smoke/manual QA for the Stage 4A extension wiring that was previously fully verified locally in `qa/2026-07-10-extension-prototype-ui-wiring-stage4a.md`.

Chrome extension pages still cannot be inspected by the automation layer, so extension UI evidence below is user-assisted.

## Deployment/API Checks

| Check | Exit | Observed result |
| --- | ---: | --- |
| `curl -sS -i https://lunchserver-production.up.railway.app/api/health` | 0 | HTTP 200, body `{"ok":true}`. |
| `curl -sS -i https://lunchserver-production.up.railway.app/api/groups` | 0 | HTTP 401, body `{"error":"missing_token","message":"Authorization bearer token is required"}`. |
| `rg -n 'https://\*\.up\.railway\.app/\*|\"permissions\": \[\"alarms\", \"notifications\", \"storage\"\]' apps/extension/dist/manifest.json` | 0 | Manifest keeps minimal permissions and includes `https://*.up.railway.app/*` host permission. |

## User-Assisted Manual QA

| Area | Result | Evidence / notes |
| --- | --- | --- |
| API host switch | PASS | Extension settings API host was changed to `https://lunchserver-production.up.railway.app`; host-specific connection state reset as expected. |
| Identity and first real group creation | PASS | User created identity `吕导` and group `TT和她的饭搭子们`. The one-time invite was missed, which is consistent with invite-only-on-create behavior. |
| Dedicated invite group creation | PASS | User created `Railway QA Invite Group`; settings displayed the one-time invite. Full invite code was captured during QA but intentionally omitted from this committed report. |
| Invite join and group list/switch | PASS | User disconnected, created `Railway QA B`, joined `Railway QA Invite Group` with the captured invite, and confirmed the second group flow passed. |
| No-current-batch / empty library / quick-add / ready popup | PASS | User opened popup against `Railway QA Invite Group`, added `Railway QA 面馆` with dish `番茄牛肉面`, then confirmed the popup reached a ready recommendation state. |
| Ready detail data | PASS | Detail showed score breakdown, recommendation reason, and dish information. The first minimal quick-add recommendation scored `0`; this is expected when distance, weekday/weather tags, and multiple recommender signals are absent. |
| Participation controls | PASS | User confirmed `今天参与` and `今天不吃` both changed state. |
| Feedback and decision controls | PASS | User clicked all four feedback buttons with no API/token errors, then clicked `就决定是你了`; no issues observed. |
| Positive scoring path | PASS | User added `Railway QA 快餐` with distance `8`, weekday tag `周二`, weather tag `炎热`, and scenario tag `赶时间`. Recommendation displayed `65 分`: weekday `+20`, weather `+25`, distance `+20`, with reasons `适合今天，适合当前天气，离办公室近`. |
| Standalone detail page | PASS | User opened the standalone `detail.html` fallback and confirmed it loaded against Railway dev without blank/error state. |
| Group-local reminder override | PASS | User changed and saved the active group reminder override in settings; refresh preserved the value. |
| Prototype exclusion visual check | PASS | User confirmed settings, popup, and detail did not show faux browser toolbar, prototype navigation, static people/restaurants/weather, or history view. |

## Not Repeated On Railway

These were already covered in the local Stage 4A QA report for the same tested commit, but were not repeated against Railway because they require service interruption, token-secret mutation, membership DB mutation, or request-level interception:

- Cached current-group-only read-only state after backend outage.
- Session-expired state.
- Removed-member state.
- Quick-add partial-success retry after failing only recommendation creation.
- Weather unavailable by temporarily removing the weather snapshot.

## Known Issues

- Browser automation cannot inspect or operate `chrome://extensions/` and `chrome-extension://...` pages in this environment, so extension UI evidence is user-assisted.
