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
- read token `dev-read-token`

Production config:

- Set API base URL in the extension options page to the Railway public domain.
- Set the read token in the extension options page to the Railway `EXTENSION_READ_TOKEN` value.
- If using a custom API domain outside `*.up.railway.app`, update `apps/extension/public/manifest.json` host permissions before publishing.
