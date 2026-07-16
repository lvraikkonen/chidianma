# Internal Extension Distribution

Status: Stage 7C controlled unpacked candidate

Version: `0.2.0`

Extension ID: `bbkeaogleldgfnkgebdhdbiohlmonbkk`

Production service: `https://lunchserver-production.up.railway.app`

## Boundary

This is a controlled unpacked build for internal validation. It is not a Chrome
Web Store release and has no automatic update mechanism. Stage 7C produces and
validates a candidate; broad colleague distribution begins only in Stage 7D.

The Extension requests only `alarms`, `notifications` and `storage`, plus access
to the exact production service above. It does not request browsing-history or
all-sites access.

## Candidate files

The release operator runs from a clean, committed worktree:

```bash
pnpm package:extension:internal
```

The command creates:

```text
artifacts/extension/
  chidianma-extension-0.2.0-internal.zip
  chidianma-extension-0.2.0-internal.sha256
  chidianma-extension-0.2.0-internal.release.json
```

The ZIP root contains `manifest.json`. The release JSON follows
[the stable metadata schema](../schemas/extension-internal-release.schema.json)
and records commit, Extension ID, profile, permissions, exact host, file count,
SHA-256 and build time.

The repository contains only the public manifest key. Private key material must
remain outside the repository and is not needed to load this unpacked package.

## First installation

1. Verify the ZIP SHA-256 against the `.sha256` file.
2. Create a fixed loaded directory such as
   `~/Applications/chidianma-extension/current`.
3. Extract the ZIP directly into that directory. Confirm `manifest.json` is at
   the directory root.
4. Open `chrome://extensions`.
5. Enable **Developer mode**.
6. Select **Load unpacked** and choose the extracted directory.
7. Confirm:
   - name is `中午吃点啥（内部测试）`;
   - version is `0.2.0`;
   - ID is `bbkeaogleldgfnkgebdhdbiohlmonbkk`;
   - service shown in settings is the production URL above.
8. Pin the Extension if desired.
9. If replacing a Stage 7B build, create an identity connection code on an
   existing connected device and reconnect this `0.2.0` installation. The new
   fixed ID does not promise automatic migration of old Extension storage.

Do not load directly from Downloads or another directory that may be moved or
cleaned automatically.

## Upgrade

1. Keep the current extracted directory and previous ZIP as the rollback point.
2. Verify the new candidate checksum and release JSON.
3. Extract the new ZIP into a temporary staging directory.
4. In `chrome://extensions`, note the current ID and version.
5. Replace the contents of the currently loaded `current` directory with the
   staged candidate contents. Keep the loaded directory path unchanged.
6. Select **Reload** on the Extension card.
7. Confirm the same Extension ID, expected version, active identity/group,
   reminder settings and cached recommendation state.
8. Smoke test popup, detail, feedback, notification click and offline cache.

Changing the files under the same fixed-key Extension keeps the Extension ID.
Do not remove the existing installation during a normal upgrade, because remove
and reinstall clears its local storage.

## Rollback

1. Stop further candidate distribution.
2. Restore the previous approved ZIP contents to the fixed loaded directory.
3. Select **Reload** in `chrome://extensions`.
4. Confirm the previous version and the same Extension ID.
5. Re-run identity, active-group, recommendation, reminder and cache checks.
6. If the Extension must be removed, record that removal clears local Extension
   storage and requires reconnecting on a future install.

Application rollback does not roll back Server/database state. Railway rollback
continues to follow [the release record](../RELEASE.md) and
[rollback runbook](runbooks/rollback.md).

## Support checks

Ask the tester for:

- Chrome version;
- Extension version;
- Extension ID;
- service URL shown in settings;
- whether the issue followed install, Reload, identity connection or group
  switching;
- screenshot without invite codes, Tokens or private group data.

Never request raw identity Tokens, group-session Tokens or invite codes.
