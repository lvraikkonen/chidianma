# Runbook: Reminder Not Firing

1. Confirm the active group, local timezone/date, reminder enabled state and local/group override.
2. Confirm Chrome notification permission and that the Extension remains enabled.
3. Inspect `chrome.storage.local` state through Extension DevTools without copying Tokens.
4. Confirm the expected `chrome.alarms` primary/second alarm exists and its scheduled time is future.
5. Close Extension pages/worker DevTools, restart Chrome and verify startup restoration.
6. Check `/api/ready` and whether the active group has a current batch/decision state.
7. Reproduce once with a near-future local override; record Chrome/Extension version and sanitized
   console error text.
8. If multiple users are affected, pause reminder-related rollout and follow rollback.

Stage 7D will add operator-visible delivery/failure observation; until then this is a client-assisted
diagnostic path.
