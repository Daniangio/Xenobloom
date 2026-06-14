# Economy and Season Resolution

Economy is calculated from active buildings only.

Current resources:

- Life production
- Life sustain
- available Life
- Maturity
- Strains

Inactive disconnected buildings do not produce or consume sustain.

Season resolution order:

1. Compute Core connectivity.
2. Resolve hydration effects from active Condensers.
3. Resolve drought spread when scheduled.
4. Compute active-building Life production and sustain.
5. Apply deficit stress if sustain exceeds production.
6. Resolve active Assimilator extraction.
7. Apply building stress and building Maturity production.
8. Add Strain Maturity.
9. Advance season and reset actions.
10. Recompute the next season economy snapshot.
11. Check win/loss conditions.
