# Runbook: Suspected Group-Isolation Breach

1. Treat as a stop condition: pause rollout and avoid creating more affected data.
2. Record request route, group IDs, membership ID, revision and timestamps without bearer Tokens or
   invite codes.
3. Reproduce only with dedicated QA groups; do not inspect unrelated colleague data.
4. Run the read-only database verifier and retain sanitized `cross_group_relationships` evidence.
5. Inspect route authorization and every query/write filter for the affected relation.
6. Rotate exposed invites/capabilities if necessary through supported controls.
7. Roll back if the active revision introduced the issue.
8. Add a regression test covering cross-group ID spoofing before redeploy.
9. Document affected scope, containment, correction and user communication decision in `qa/`.
