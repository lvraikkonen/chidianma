# ADR 0002: Internal Extension Distribution

Status: `Accepted for Stage 7C internal beta`

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
- Supports the official Chrome Web Store rollback flow.

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

## Decision

Use a **versioned unpacked internal package** for Stage 7C and the first controlled Stage 7D cohort.
The internal profile uses a fixed public manifest key so different directories and machines receive
the same Extension ID, fixes the production API origin, removes editable host controls and ships
with a checksum plus install/upgrade/rollback instructions.

The private key remains outside the repository. The public manifest key is not a secret and is
committed so the unpacked ID remains stable. Chrome Web Store unlisted distribution is reconsidered
after the first cohort provides evidence about installation and update friction.

References:

- [Chrome Extension manifest key](https://developer.chrome.com/docs/extensions/reference/manifest/key)
- [Chrome Extension distribution](https://developer.chrome.com/docs/extensions/how-to/distribute)

`v0.1.0-internal` remains the Stage 6 audit tag. Stage 7C produces the first versioned colleague
candidate, `0.2.0`.
