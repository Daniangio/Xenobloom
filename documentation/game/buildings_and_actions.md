# Buildings and Actions

## Buildings

Current building configs live in `backend/app/game_configs/buildings`.

- Core: starting building and local/global upgrade anchor
- Bloom: Life and Maturity production with dry stress rules
- Condenser: hydration support through `hydration_push`
- Connector: cheap expansion and connectivity building
- Assimilator: nutrient extraction building

## Build Actions

Empty tiles can offer build actions when requirements are met.

Assimilator build requirements:

- tile has no building
- tile has `nutrient_type`
- tile is adjacent to an active colony building
- enough actions remain
- enough Life is available

## Removal Actions

Non-Core buildings can be removed with Dismantle.

If `Composting Instinct` is unlocked, Dismantle becomes Compost:

- removes the selected building
- adds +1 hydration to that tile
- adds +1 hydration to the two adjacent tiles with lowest hydration

Assimilator extraction progress is lost when the building is removed or collapses.
