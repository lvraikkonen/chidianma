# ADR 0002: Internal Extension Distribution

Status: `Proposed`

Date: 2026-07-15

## Context

Stage 6 validated an unpacked Chrome build. Ordinary colleague beta needs a versioned, understandable
install/upgrade/rollback path after Stage 7B security hardening and Stage 7C visual consistency.

## Options

### Versioned unpacked package

- Lowest publishing overhead and transparent artifact/checksum.
- Requires Developer mode and controlled manual upgrade/reload.
- No automatic updates; support must confirm installed version.

### Chrome Web Store unlisted

- Link-only distribution and automatic updates.
- Requires store account/review, privacy copy, listing assets and update/retraction operations.
- Extension ID/origin becomes stable and can inform a stricter CORS policy.

## Decision criteria

- Cohort size and expected update frequency.
- Whether Developer mode is acceptable for non-developer colleagues.
- Store review lead time and privacy/maintenance cost.
- Stable Extension origin requirements.
- Required rollback and emergency update speed.

## Acceptance branches

- If unpacked: produce a versioned archive/checksum plus install, manual upgrade, version check and
  removal/rollback instructions. Do not claim automatic update.
- If unlisted: verify store link, stable ID, privacy/listing copy, automatic update and rollback/
  disable procedure.

No option is accepted until Stage 7C review. `v0.1.0-internal` is only the pre-hardening audit tag.
