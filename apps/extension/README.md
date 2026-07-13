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
- host permission for `http://localhost:3000/*`
- host permission for `https://*.up.railway.app/*`

Default local API:

- `http://localhost:3000`

Usage:

1. Build the extension and load `apps/extension/dist` as an unpacked extension in Chrome Developer mode.
2. Open the extension settings page.
3. Confirm the default API host or change it to the server you want to use.
4. Enter your display name, then create a group or join an existing group with an invite code.
5. Switch among the groups returned by the server from the settings page; you do not need to copy or paste tokens.
6. Configure the active group's local reminder override under "本机提醒".
7. Open the popup and, if the active group has no current batch for today, generate the missing current batch.

Connection and token behavior:

- Raw identity and group session tokens are intentionally hidden from the settings UI.
- Changing the API host clears host-specific connection state and cache, including identity, group sessions, active group, group summaries, last recommendation cache, and group-local reminder overrides.

Production config:

- Set API base URL in the extension options page to the Railway public domain.
- If using a custom API domain outside `*.up.railway.app`, update `apps/extension/public/manifest.json` host permissions before publishing.
