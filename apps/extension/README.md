# Chrome Extension

Manifest V3 extension for the daily recommendation, participation, decision,
feedback, history, and reminder experience.

## Build and load

```bash
pnpm --filter @lunch/shared build
pnpm --filter @lunch/extension build
```

Load `apps/extension/dist` through `chrome://extensions` in Developer mode.
This unpacked route is for developers and reviewers only; the colleague-beta
distribution choice and installation guide are Stage 7C decisions.

Permissions stay limited to:

- `alarms`
- `notifications`
- `storage`
- `http://localhost:3000/*`
- `https://*.up.railway.app/*`

## Use

1. Open Extension options and set the Server URL.
2. Enter a display name to create a lightweight identity, or enter a one-time
   identity link code from another connected device.
3. Create a group or join one with its invite code.
4. Switch groups without copying tokens, then configure the active group's
   local reminder override if needed.
5. Use the popup/detail pages for recommendations, participation, decisions and
   feedback; use options for personal history and reminder settings.

Raw identity and group-session tokens are intentionally hidden from the UI.
Changing the Server URL clears host-specific identity, group sessions, caches
and reminder context.

## Current beta boundary

The normal group flow uses the active group's bearer session. Startup renews
the Identity Token, group 401s share one session renewal and retry once, and a
removed membership clears only that group. Without an active group the
Extension shows onboarding, clears old alarms and makes no recommendation or
notification request. A one-time storage migration removes legacy read-token,
global recommendation cache and legacy alarm context.

This remains a developer/reviewer build until Stage 7B production rollout and
Stage 7C distribution work pass; it is not a colleague-beta artifact.

For a custom production API domain, update and review the exact host permission
in `public/manifest.json`; do not add `<all_urls>`.
