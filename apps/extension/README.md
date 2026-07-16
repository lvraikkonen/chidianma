# Chrome Extension

Manifest V3 Extension for daily recommendations, participation, decisions,
feedback, personal history and calm lunch reminders.

## Build profiles

The default build is the controlled internal candidate:

```bash
pnpm --filter @lunch/shared build
pnpm --filter @lunch/extension build
```

It produces `apps/extension/dist` with:

- name `中午吃点啥（内部测试）`;
- version `0.2.0`;
- fixed service `https://lunchserver-production.up.railway.app`;
- exact production host permission;
- public manifest key and stable Extension ID
  `bbkeaogleldgfnkgebdhdbiohlmonbkk`;
- read-only version/service information and no editable API address.

For local development:

```bash
pnpm --filter @lunch/extension build:dev
```

The dev profile is named `中午吃点啥（开发版）`, has no internal manifest key,
allows localhost plus the exact production host and exposes advanced API address
editing. It can coexist with the internal build.

Permissions stay limited to:

- `alarms`
- `notifications`
- `storage`

The internal host permission is only:

- `https://lunchserver-production.up.railway.app/*`

## Internal install and upgrade

The supported unpacked install, upgrade and rollback procedure is documented in
[Internal Extension Distribution](../../docs/extension-internal-distribution.md).
Load a fixed extracted directory, not a temporary download directory.

Adding the fixed public key changes the ID from earlier Stage 7B unpacked
installations. The first `0.2.0` install reconnects through an existing identity
connection code; automatic migration from the old Extension storage is not
promised.

## Use

1. Create a lightweight identity or enter a one-time identity connection code.
2. Create a group or join one with its invite code.
3. Switch groups without copying tokens.
4. Use the popup/detail pages for recommendations, participation, decisions and
   feedback.
5. Use settings for personal history, local reminder customization and support
   version/service checks.

Raw identity and group-session tokens are intentionally hidden from the UI.
The internal profile cannot switch service origin.

## Build and release checks

```bash
pnpm --filter @lunch/extension test
pnpm --filter @lunch/extension typecheck
pnpm --filter @lunch/extension build:dev
pnpm --filter @lunch/extension build:internal
STAGE7C_REQUIRE_ARTIFACTS=0 pnpm check:stage7c-release
```

The final package command is stricter:

```bash
pnpm package:extension:internal
```

It only runs from a clean, committed worktree and writes the ignored ZIP,
SHA-256 and release metadata under `artifacts/extension/`.
