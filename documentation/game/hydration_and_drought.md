# Hydration and Drought

Hydration is an integer tile state. The base range is configured in `rules/base.json` and is currently `-3` to `+3`.

Dry tiles at the minimum hydration level act as drought spread points. A dry tile no longer spreads once hydrated above the minimum. This means there are no permanent drought-source tiles.

Drought resolution:

- runs on configured season cadence
- starts from tiles at `hydration_min`
- chooses neighboring targets with higher hydration
- respects rock and forest resistance rules
- uses wind to break directional ties
- reduces target hydration by 1

Forests can accumulate terrain stress while dry. When forest stress reaches its threshold, the tile becomes neutral and terrain stress is cleared.

Condensers push hydration through a configured `hydration_push` effect. Heavy Condensers replace that effect with a two-iteration version.
