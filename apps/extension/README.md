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
2. Enter a display name to create a lightweight local identity.
3. Create a group or join one with its invite code.
4. Switch groups without copying tokens, then configure the active group's
   local reminder override if needed.
5. Use the popup/detail pages for recommendations, participation, decisions and
   feedback; use options for personal history and reminder settings.

Raw identity and group-session tokens are intentionally hidden from the UI.
Changing the Server URL clears host-specific identity, group sessions, caches
and reminder context.

## Current beta boundary

The normal group flow uses the active group's bearer session. The built code
still contains an unscoped API/read-token fallback for pre-group storage. That
is a known Stage 7B blocker, not a supported colleague-beta path. The default
localhost and development read-token values are development compatibility
residue and must be removed or disabled before Stage 7C produces a distributable
build.

For a custom production API domain, update and review the exact host permission
in `public/manifest.json`; do not add `<all_urls>`.
