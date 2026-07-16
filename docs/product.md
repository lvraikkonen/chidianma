# Product

Status: current as of 2026-07-15.

## Purpose

中午吃点啥 reduces small-team lunch decision friction. It preserves teammate restaurant/dish
knowledge and turns it into two or three explainable choices, not an endless discovery list.

## Actors

- **Member:** joins a group, contributes restaurants/recommendations, participates, decides and
  gives feedback.
- **Admin:** a member who can also manage group metadata, invite rotation, members, reminder
  defaults and scoring weights.
- **Operator:** deploys Railway, applies/verifies migrations, monitors the service and rolls back.

An Admin role is a group permission, not a formal global account.

## Core loop

1. A person creates a local lightweight identity.
2. The identity creates a group or joins with that group's invite code.
3. Members preserve group-specific restaurant and recommendation knowledge.
4. A member generates the current office-date recommendation batch.
5. The Server ranks up to three active choices and returns a readable reason and component scores.
6. Members mark participation, decide a restaurant and submit feedback.
7. History and Dashboard surfaces preserve the batch/weight snapshot and help tune future choices.

## Surfaces

- **Admin:** onboarding, Today, restaurant library, Dashboard, records, members and settings.
- **Extension popup/detail/settings:** active-group choice, current recommendations, quick-add,
  participation/decision/feedback, personal history and device reminder override.
- **Reminder runtime:** one primary notification and an optional second notification 20 minutes
  later only when the group still has no decision.

## Product rules

- Data is isolated by lunch group.
- The backend is the source of truth; Extension cache is only an offline fallback for the active
  group.
- Every recommendation needs a readable reason.
- Weather improves ranking but never blocks it.
- Old batches remain immutable review history when a new current batch is generated.
- At least one active Admin must remain in every group.
- Permissions remain minimal and reminders remain calm.

## Current beta boundary

Stage 7A freezes and documents the verified production baseline. Stage 7B must close legacy
compatibility and public API security blockers. Stage 7C produces the coherent distributable
client. Stage 7D is the controlled colleague beta and account-system decision.

## Non-goals

- Restaurant discovery marketplace, maps, delivery, payments or social reviews.
- Formal accounts, email login or OAuth before the lightweight model is evaluated in beta.
- Machine-learning ranking before explainable scoring is stable.
- Broad Chrome permissions or client-side weather calls.
