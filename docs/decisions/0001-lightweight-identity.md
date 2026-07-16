# ADR 0001: Lightweight Identity Boundary

Status: `Proposed`

Date: 2026-07-15

## Context

The product uses generated identities, local bearer Tokens, group membership and rotating group
invites. It intentionally has no email/OAuth account. Stage 7B must make this model credible for a
small internal beta without prematurely building a formal account system.

## Current facts

- Display name is presentation only and is not unique proof of identity.
- Identity/group Tokens are device/browser-local bearer capabilities.
- Group membership and role are revalidated on protected requests.
- There is no cross-device recovery or account merge.
- Member removal revokes one membership, not a real human across devices.
- Legacy shared-auth/unscoped routes do not match this model and must close before beta.

## Proposed decision boundary

Retain lightweight identity for the first controlled beta after Stage 7B closes legacy paths,
adds public API protections and documents reset/removal semantics. Do not add OAuth, email login or
account merging in 7B.

Before accepting this ADR, decide:

- the supported reset/rejoin path after device/storage loss;
- PII retention/export/deletion or anonymization semantics;
- operator support and abuse response;
- measurable Stage 7D thresholds that would trigger a formal-account decision.

## Consequences

The beta remains low-friction and small in scope, but cannot promise verified personal identity or
cross-device continuity. Stage 7D must measure duplicate identities and recovery/support requests.
