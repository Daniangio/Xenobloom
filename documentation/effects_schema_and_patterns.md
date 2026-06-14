# Astralia Chronicles — Ability & Effect Schema Guide

This document is the **source of truth** for how to specify card abilities in the JSON card database.
It aims to mirror what the current engine supports (backend) and what the UI can drive (frontend).

Card data lives under `backend/engine/data/cards/<expansion_code>/**`.

---

## 1) Ability Objects

Every ability is a JSON object with the following top-level shape:

```json
{
  "ability_id": "SOME_UNIQUE_ID",
  "name": "Display Name",
  "type": "ACTIVATED | TRIGGERED | REPLACEMENT_EFFECT | PASSIVE | STATIC | ACTION",
  "copy_count_payload_key": "optional dynamic copy count payload key",
  "copy_base_payload_keys": ["optional payload keys reused by copies"],
  "optional": true,
  "worn_only": true,
  "field_only": true,
  "trigger": { "...": "see Triggers" },
  "cost": { "...": "see Costs" },
  "target_selector": { "...": "see Target Selectors" },
  "event_constraints": [ { "...": "see Constraints" } ],
  "once_per_turn": true,
  "condition": { "...": "see Conditions" },
  "resolution_chain": [ { "...": "see Effects" } ]
}
```

Notes:
- `resolution_chain` is required for schema-driven abilities (most abilities).
- `copy_count_payload_key` lets an action derive extra copies from a payload value generated during resolution.
- `copy_base_payload_keys` preserves selected payload entries for those follow-up copies.
- `once_per_turn` is enforced per-card-instance; it uses `ability_id` (or `name` fallback) as the key.
- For `ACTIVATED` / `ACTION` abilities, reusing a `once_per_turn` ability raises an error.
- For `TRIGGERED` / `REPLACEMENT_EFFECT` abilities, `once_per_turn` silently stops further resolutions that turn.
- `trigger` is required for `TRIGGERED` and `REPLACEMENT_EFFECT`.
- `optional: true` forces the engine to queue the triggered ability on the stack so the client can **Confirm** or **Skip**.
- `worn_only: true` marks an ability as “wearer-granted” (it is not shown/usable on the item while it is sitting in a slot).
- `field_only: true` marks an ability as only usable while the card is on the field (e.g. an equipment “Wear” ability).

---

## 2) Triggers

### 2.1 Trigger object

```json
{
  "type": "ON_EVENT",
  "event_type": "ENTER | LEAVE_PLAY | SHATTER | PRE_SHATTER | TURN_START | TURN_END | GAME_START | PRE_TAKE_DAMAGE | ATTACK_DECLARED | BLOCK_DECLARED | COMBAT_PRE_DAMAGE | LIFESTEAL | COUNTER_GAINED | CARD_DISCARDED | OBLIVIATED | ACTION_RESOLVED | SPELL_RESOLVED",
  "target": "SELF",
  "scope": "GLOBAL",
  "reason": "optional reason string or list",
  "counter": "quest",
  "min_amount": 1,
  "source_self": true,
  "source_owner": "SELF | ENEMY",
  "event_owner": "SELF | ENEMY",
  "source_is_attacker": true,
  "source_has_keyword": "ISOLATE",
  "declared_target_owner": "SELF | ENEMY",
  "declared_target_type": "CHARACTER | PROTAGONIST | SCENOGRAPHY | ..."
}
```

Engine behavior:
- Abilities can be evaluated as **LOCAL** (only the event target) or **GLOBAL** (all entities on board that declare `trigger.scope = "GLOBAL"`).
- `target: "SELF"` means the triggered ability only fires when the event's `target` is the same entity.
- `counter` / `min_amount` are currently used with `COUNTER_GAINED` to filter which counter changed and by how much.
- If the ability has `optional: true`, it is always queued on the stack (even if it has no target selector) so the player can skip it.

### 2.2 Events currently emitted by the engine

Common:
- `ENTER` — after a card enters a grid slot (played or flipped back).
- `LEAVE_PLAY` — on retire/shatter cleanup.
- `SHATTER` — when damage reaches effective HP.
- `PRE_SHATTER` — replacement window before a card would shatter.
- `TURN_START` — emitted on the active player's protagonist at start turn.
- `TURN_END` — emitted on the active player's protagonist at end of turn.
- `GAME_START` — emitted once for each protagonist during setup.
- `ACTION_RESOLVED` — emitted when an action card resolves.
- `SPELL_RESOLVED` — emitted when a resolved action has trait `Spell` (legacy convenience event; prefer `ACTION_RESOLVED` + `event_constraints` such as `HAS_TRAIT: Spell` for new card data).

Combat:
- `ATTACK_DECLARED` — emitted when an attacker and target are chosen.
- `BLOCK_DECLARED` — emitted when a blocker is declared.
- `COMBAT_PRE_DAMAGE` — emitted right before combat damage exchange for each combatant.

Damage interception:
- `PRE_TAKE_DAMAGE` — emitted internally before damage is applied (replacement window).

Counters:
- `COUNTER_GAINED` — emitted when a card's counter value increases (from `ADD_COUNTER` costs/effects).
- `CARD_DISCARDED` — emitted when a card is discarded from hand (cost/effect path).
- `OBLIVIATED` — emitted whenever a card is moved to oblivion.

---

## 3) Costs

Costs are applied before `resolution_chain`.

### 3.1 Supported cost types

#### `COMPLEX_COST` (`BLOOD_TITHE`)

```json
{ "type": "COMPLEX_COST", "mechanic": "BLOOD_TITHE", "value": 3 }
```

The client supplies `payload.tithe` distribution; engine validates exact sum.

#### `ADD_COUNTER`

```json
{ "type": "ADD_COUNTER", "counter": "frazzle", "amount": 2 }
```

Notes:
- When `counter == "frazzle"`, the source must not already be frazzled.
- When the counter value increases, the engine emits a `COUNTER_GAINED` event with `{ counter, amount }`.

#### `SPEND_COUNTER`

```json
{ "type": "SPEND_COUNTER", "counter": "quest", "amount": 1, "target_preset": "OWNER_PROTAGONIST" }
```

Supported `target_preset`:
- `OWNER_PROTAGONIST` (spend from your protagonist)
- otherwise defaults to spending from the ability `source`

#### `SPEND_COUNTER_MATCH_PERSONA_COST`

Used for “Remove X Quest counters: attach persona relic of cost X”.

```json
{
  "type": "SPEND_COUNTER_MATCH_PERSONA_COST",
  "counter": "quest",
  "persona_payload_key": "persona_card_id",
  "target_preset": "OWNER_PROTAGONIST"
}
```

#### `SPEND_COUNTER_MATCH_SELECTED_CARD_COST`

Used when the paid counter amount must equal the cost of a selected card from one of the owner's zones.

```json
{
  "type": "SPEND_COUNTER_MATCH_SELECTED_CARD_COST",
  "counter": "training",
  "payload_key": "deploy_choice",
  "zones": ["PERSONA", "OBLIVION"],
  "constraints": [{ "predicate": "HAS_TRAIT", "value": "Mecha" }],
  "requires_choice": true
}
```

Notes:
- Client payload must provide `{ "zone": "...", "card_id": "..." }` under `payload_key`.
- Engine validates both zone membership and constraints before spending counters.
- `target_preset` works the same way as with `SPEND_COUNTER`.

#### `PAY_OR_DAMAGE_PROTAGONIST`

```json
{ "type": "PAY_OR_DAMAGE_PROTAGONIST", "value": 1, "damage": 2 }
```

Client supplies `payload.choice` of `fragment` or `damage` (or skips).

#### `PAY_FRAGMENTS`

```json
{ "type": "PAY_FRAGMENTS", "amount": 1 }
```

Consumes fragments from the ability owner.

#### `SHATTER_TARGET`

```json
{
  "type": "SHATTER_TARGET",
  "payload_key": "target",
  "zone": "FIELD",
  "constraints": [{ "predicate": "HAS_TRAIT", "value": "Supporter" }],
  "store_cost_as": "supporter_cost"
}
```

Notes:
- Uses the target stored in `payload[payload_key]` (defaults to `target`) and requires that target to actually shatter.
- `zone` and `constraints` let frontend target inference and backend validation treat the cost as a first-class field target selection.
- `store_cost_as` optionally stores the shattered card cost in payload.

#### `RETIRE_SELF`

Moves the source entity back to the bottom of its owner's main deck.

#### `DISCARD_FROM_HAND`

```json
{
  "type": "DISCARD_FROM_HAND",
  "payload_key": "discard_card_id",
  "constraints": [{ "predicate": "HAS_TRAIT", "value": "Mage" }]
}
```

Notes:
- Discards one matching card from the owner's hand.
- If `payload[payload_key]` is omitted, the engine discards the first valid candidate.
- The discarded id is written to payload as `_discarded_card_id` for downstream effects.
- `store_cost_as` optionally stores the discarded card cost in payload.

#### `OBLIVIATE_FROM_GRAVEYARD`

```json
{
  "type": "OBLIVIATE_FROM_GRAVEYARD",
  "payload_key": "obliviate_ids",
  "constraints": [{ "predicate": "HAS_TRAIT", "value": "Drone" }],
  "requires_choice": false
}
```

Notes:
- Moves selected cards from graveyard to oblivion.
- Stores `_obliviated_ids` and `_obliviated_total_cost` in payload for downstream effects.

---

## 4) Target Selectors

### 4.1 Basic selectors

```json
{ "selector_type": "SINGLE_TARGET", "zone": "FIELD", "constraints": [ ... ] }
{ "selector_type": "SELF" }
{ "selector_type": "AUTO", "zone": "FIELD", "constraints": [ ... ] }
{ "selector_type": "AUTO_ENEMY", "zone": "FIELD", "constraints": [ ... ] }
{ "selector_type": "ALL", "zone": "FIELD", "constraints": [ ... ] }
```

### 4.2 Presets

```json
{ "preset": "OWNER_PROTAGONIST" }
{ "preset": "EVENT_SOURCE" }
{ "preset": "EVENT_TARGET" }
```

Returns the protagonist entity of the ability owner.

Additional preset behavior:
- `EVENT_SOURCE` resolves to the entity that caused the triggering event, when available.
- `EVENT_TARGET` resolves to the event target when it is still on the field, or from the event slot metadata when it can be reconstructed.

### 4.3 Adjacency selector

```json
{ "selector_type": "ADJACENT", "zone": "FIELD", "include_self": true }
```

Uses orthogonal neighbors in the 2x3 grid.

---

## 5) Constraints (Predicates)

Constraints appear in target selectors and in some persona selection flows.

Supported predicates:
- `IS_TYPE` (e.g. `CHARACTER`, `PROTAGONIST`, `SCENOGRAPHY`, `RELIC`, `BLOOD_TITHE`)
- `IS_ID` (exact card id match)
- `HAS_TRAIT` / `HAS_SUBTYPE` (engine maps both to card traits)
- `HAS_KEYWORD`
- `NOT_HAS_WORN_ABILITY`
- `MAX_COST`, `MIN_COST`
- `OWNER` with value `SELF` or `ENEMY`
- `NOT_SELF` (exclude the ability source)
- `ASSIGNED_TO_SELF` (target mecha must be assigned to the source pilot)
- `ASSIGNED_TO_MECHA` (target pilot must currently be assigned to a mecha you control)
- `NOT_HAS_TRAIT` (inverse trait match)
- `ANY` (logical OR over nested constraints)
- `ALL` (logical AND over nested constraints; mostly useful as a wrapper)

Note:
- `HAS_KEYWORD` is exact-match when used in id-based checks (`_matches_constraints_id`).
- `NOT_HAS_WORN_ABILITY` works for both field-entity checks and card-id based zone selection flows.

Example:

```json
[
  { "predicate": "IS_TYPE", "value": "CHARACTER" },
  { "predicate": "OWNER", "value": "ENEMY" },
  { "predicate": "MIN_COST", "value": 5 }
]
```

---

## 6) Effects (Resolution Chain)

Effects are applied in order. Each effect is a JSON object with a `type`.

### 6.1 Common effects

#### `MODIFY_STAT`

```json
{ "type": "MODIFY_STAT", "stat": "ATK", "operator": "ADD", "value": 1, "duration": "END_OF_TURN" }
```

#### `ADD_COUNTER`

```json
{ "type": "ADD_COUNTER", "counter": "quest", "amount": 1, "target_selector": { "preset": "OWNER_PROTAGONIST" } }
```

Notes:
- Frazzle counters never go below 0.
- When the counter value increases, the engine emits a `COUNTER_GAINED` event with `{ counter, amount }`.

#### `DEAL_DAMAGE`

```json
{ "type": "DEAL_DAMAGE", "value": 2 }
```

Optional:

```json
{ "type": "DEAL_DAMAGE", "value": 2, "ignore_shield": true }
```

Can also use `value_source`:
- `TRIGGER_EVENT_VALUE`
- `EVENT_TARGET_COST`
- `TARGET_DAMAGE`
- `PAYLOAD_INT` (reads `payload[payload_key]`)
- (Any `value_source` supported by **Value Sources** below)

#### `HEAL`

```json
{ "type": "HEAL", "value": 2 }
```

Or computed via `value_source` (see below).

#### `DRAW`

```json
{ "type": "DRAW", "amount": 1 }
```

`DRAW` also supports computed amounts via `value_source` / `multiplier` / `base` (same value pipeline as stat and damage effects).

#### `MOVE_TOP_DECK_TO_GRAVEYARD`

```json
{ "type": "MOVE_TOP_DECK_TO_GRAVEYARD", "amount": 2 }
```

Moves cards from the top of the effect owner's main deck to graveyard. Supports
`amount` / `value` or any normal `value_source` such as `TRIGGER_EVENT_VALUE`.

#### `CARD_NUMERIC_MODIFIER`

Static/passive marker that boosts numeric fields (`value`, `amount`, `count`, `base`, `multiplier`)
of effects resolved from matching cards.

```json
{
  "type": "CARD_NUMERIC_MODIFIER",
  "required_traits": ["Spell", "Enchantment"],
  "amount": 1,
  "target_constraints": [
    { "predicate": "OWNER", "value": "SELF" },
    { "predicate": "IS_TYPE", "value": "PROTAGONIST" }
  ]
}
```

Notes:
- Matching is done against the card being resolved, not the card that owns the passive.
- `required_types` / `types` and `required_traits` / `traits` are both accepted.
- `target_constraints` filters which effect target receives the boosted numbers.

#### `PUT_FROM_SELECTED_ZONE_TO_PLAY`

Summons a previously selected card from one of several owner-relative zones.

```json
{
  "type": "PUT_FROM_SELECTED_ZONE_TO_PLAY",
  "payload_key": "deploy_choice",
  "zones": ["PERSONA", "OBLIVION"],
  "constraints": [{ "predicate": "HAS_TRAIT", "value": "Mecha" }],
  "requires_choice": true,
  "assign_to_source": true
}
```

Supported options:
- `payload_key`
- `zones`
- `constraints`
- `requires_choice`
- `requires_slot`
- `slot_payload_key`
- `max_cost`
- `max_cost_source`
- `pay_cost_from_fragments`
- `assign_to_target`
- `assign_to_source`
- `assign_to_source_pilot`

Notes:
- `zones` currently resolve against the effect owner's `PERSONA`, `OBLIVION`, `GRAVEYARD`, `HAND`, or `DECK`.
- When an assignment flag resolves to a Pilot, the summoned Mecha enters on that Pilot's slot and the Pilot becomes an attachment.

#### `ADD_FRAGMENTS`

```json
{ "type": "ADD_FRAGMENTS", "amount": 1 }
```

Recovers fragments for the owner (bounded by the current turn fragment cap).

`ADD_FRAGMENTS` also supports computed amounts via `value_source`; in particular:

```json
{ "type": "ADD_FRAGMENTS", "value_source": "PAYLOAD_INT", "payload_key": "_value" }
```

#### `PAY_FRAGMENTS`

```json
{ "type": "PAY_FRAGMENTS", "amount": 3 }
```

Spends fragments from the effect owner (raises if insufficient).  
Also supports `value_source` (including `PAYLOAD_INT` + `payload_key`).

#### `DISCARD_FROM_HAND`

```json
{
  "type": "DISCARD_FROM_HAND",
  "target_owner": "SELF | ENEMY",
  "payload_key": "discard_card_id",
  "constraints": [],
  "requires_choice": false,
  "optional": false
}
```

Discards one matching hand card and emits `CARD_DISCARDED` with reason `effect`.

#### `ADD_NEXT_PLAY_DISCOUNT`

```json
{ "type": "ADD_NEXT_PLAY_DISCOUNT", "amount": 1 }
```

Reduces the next played card's fragment cost by `amount` (then resets).

#### `GRANT_ABILITY`

```json
{
  "type": "GRANT_ABILITY",
  "duration": "END_OF_TURN",
  "ability_payload": { "...": "a full ability object" }
}
```

Used for temporary triggered/replacement effects.
Supported temporary durations currently include `END_OF_TURN` and `END_OF_COMBAT`.
Supports `target_selector` to grant the ability to multiple targets:

```json
{
  "type": "GRANT_ABILITY",
  "duration": "END_OF_TURN",
  "ability_payload": { "...": "a full ability object" },
  "target_selector": {
    "selector_type": "ALL",
    "zone": "FIELD",
    "constraints": [ { "predicate": "OWNER", "value": "SELF" } ]
  }
}
```

#### `CHOOSE`

Selects one sub-chain based on a string payload value.

```json
{
  "type": "CHOOSE",
  "payload_key": "mode",
  "options": {
    "MODE_A": [ { "type": "DRAW", "amount": 1 } ],
    "MODE_B": [ { "type": "ADD_COUNTER", "counter": "quest", "amount": 1, "target_selector": { "preset": "OWNER_PROTAGONIST" } } ]
  }
}
```

Engine behavior:
- Reads `payload[payload_key]` (default key is `"mode"`).
- Matches option keys case-insensitively.
- Applies the chosen chain in order.

UI note:
- `frontend/src/pages/game/castInference.js` infers `modeOptions` from `CHOOSE.options` and drives the mode buttons dynamically.

#### `ALLOCATE_EFFECT`

Lets the player divide a computed total `X` across any number of targets, then applies an effect scaled by each allocation amount.

**Payload format** (`payload[payload_key]`):

```json
[
  { "owner_id": "p1", "row": 0, "col": 0, "amount": 2 },
  { "owner_id": "p2", "row": 1, "col": 1, "amount": 1 }
]
```

Example: remove `X` Frazzle counters distributed among targets (capped by total available Frazzle on the field):

```json
{
  "type": "ALLOCATE_EFFECT",
  "payload_key": "frazzle_allocations",
  "value_source": "CONTROLLED_RELIC_COUNT",
  "cap_total_by_counter": "frazzle",
  "require_exact": true,
  "target_selector": {
    "selector_type": "SINGLE_TARGET",
    "zone": "FIELD",
    "payload_key": "frazzle_allocations",
    "constraints": []
  },
  "per_point_effect": { "type": "ADD_COUNTER", "counter": "frazzle", "amount": -1 }
}
```

Example: heal `X` distributed among targets:

```json
{
  "type": "ALLOCATE_EFFECT",
  "payload_key": "heal_allocations",
  "value_source": "CONTROLLED_RELIC_COUNT",
  "require_exact": true,
  "target_selector": {
    "selector_type": "SINGLE_TARGET",
    "zone": "FIELD",
    "payload_key": "heal_allocations",
    "constraints": []
  },
  "per_point_effect": { "type": "HEAL", "value": 1 }
}
```

Engine behavior:
- Computes `X` from `value_source` (or `total`).
- If `cap_total_by_counter` is set, the required total becomes `min(X, total_available_counter_among_eligible_targets)`.
- Validates the allocation sum (exactly `X` / required total when `require_exact: true`).
- Applies `per_point_effect` once, scaled by each entry's `amount`.

#### `PREVENT_DAMAGE`

Sets `event.prevent = true` during `PRE_TAKE_DAMAGE` interception.

#### `PREVENT_SHATTER`

Sets `event.prevent = true` during `PRE_SHATTER` interception.

#### `SHATTER_SELF_INSTEAD`

Marks the replacement source as the new shatter target during `PRE_SHATTER`.

```json
{ "type": "SHATTER_SELF_INSTEAD", "clear_target_damage": true }
```

With `clear_target_damage: true`, prevented target damage is clamped to `effective_hp - 1`.

#### `CAP_EVENT_AMOUNT`

Used inside `PRE_TAKE_DAMAGE` replacement chains to clamp incoming damage:

```json
{ "type": "CAP_EVENT_AMOUNT", "max": 5 }
```

#### `REDUCE_EVENT_AMOUNT`

Used inside `PRE_TAKE_DAMAGE` replacement chains to reduce incoming damage before shield is applied:

```json
{ "type": "REDUCE_EVENT_AMOUNT", "value": 1 }
```

#### `ATTACH_FROM_PERSONA_ZONE`

Moves a persona card from `persona_zone` and attaches it to the selected target.

```json
{
  "type": "ATTACH_FROM_PERSONA_ZONE",
  "payload_key": "persona_card_id",
  "constraints": [ { "predicate": "IS_TYPE", "value": "RELIC" } ]
}
```

Engine behavior:
- Creates an attachment entity and adds it to `target.attachments`.
- Grants the attachment's abilities to the wearer (including `PASSIVE`/`STATIC`), excluding abilities marked `field_only: true`.
- When granting, the engine strips `worn_only` / `field_only` flags from the granted ability payload.

#### `ATTACH_SELF_TO_TARGET`

Moves the **ability source** (which must currently occupy a field slot) into the target's sub-slots.

```json
{ "type": "ATTACH_SELF_TO_TARGET" }
```

Engine behavior:
- Removes the source entity from its current slot and appends it to `target.attachments`.
- Grants the attachment's abilities to the wearer (same rules as `ATTACH_FROM_PERSONA_ZONE`).

#### `PUT_FROM_PERSONA_ZONE_TO_PLAY`

Moves a selected persona card from `persona_zone` into an **empty** grid slot.

```json
{
  "type": "PUT_FROM_PERSONA_ZONE_TO_PLAY",
  "payload_key": "persona_card_id",
  "slot_payload_key": "slot",
  "constraints": [ { "predicate": "IS_TYPE", "value": "RELIC" } ]
}
```

Client supplies `payload[slot_payload_key] = { "row": 0, "col": 2 }`.

Notes:
- If no slot payload is provided, the engine will attempt to choose the first empty slot.
- Optional knobs:
  - `requires_choice` (default `true`)
  - `optional` — when true, resolving with no selected persona card skips this step instead of erroring.
  - `max_cost` / `max_cost_source`
  - `pay_cost_from_fragments`
  - `assign_to_target`, `assign_to_source`, `assign_to_source_pilot`
  - `queue_remaining_on_stack` — resolves the put-play step first, then pushes the rest of the parent ability as a follow-up trigger on the stack. Use this when the entered card must trigger before later effects (for example, Jianyi putting a Ritual into play before its damage/heal/draw follow-up resolves).
  - `queue_remaining_on_skip` — same as above, but still queues the follow-up even when the optional summon step was skipped.

#### `PUT_FROM_OBLIVION_TO_PLAY`

```json
{
  "type": "PUT_FROM_OBLIVION_TO_PLAY",
  "payload_key": "oblivion_card_id",
  "constraints": [{ "predicate": "HAS_TRAIT", "value": "Mecha" }]
}
```

Moves a card from your oblivion to play (slot optional; defaults to first empty).

#### `MOVE_FROM_OBLIVION_TO_GRAVEYARD`

```json
{
  "type": "MOVE_FROM_OBLIVION_TO_GRAVEYARD",
  "payload_key": "oblivion_card_id",
  "constraints": [{ "predicate": "HAS_TRAIT", "value": "Drone" }]
}
```

Moves one matching oblivion card to graveyard.

#### `SET_SHATTER_DESTINATION`

```json
{ "type": "SET_SHATTER_DESTINATION", "destination": "OBLIVION" }
```

Marks where a shattered card is sent during cleanup (`GRAVEYARD` or `OBLIVION`).

#### `FLIP_SELF`

```json
{ "type": "FLIP_SELF", "reset_damage": true, "emit_enter": true }
```

Flips the source/target to its `alt_id`.

Optional:

```json
{ "type": "FLIP_SELF", "require_alter_ego_ready": true }
```

When `require_alter_ego_ready` is true, the flip is skipped unless the destination `alt_id` passes ALTER_EGO turn gating.

#### `MOVE_FROM_PERSONA_ZONE_TO_HAND`

```json
{
  "type": "MOVE_FROM_PERSONA_ZONE_TO_HAND",
  "payload_key": "persona_card_id",
  "constraints": [{ "predicate": "HAS_TRAIT", "value": "Spell" }],
  "requires_choice": true,
  "optional": false
}
```

Moves one matching card from the owner's persona zone to hand.

Notes:
- If `requires_choice: true`, client must provide `payload[payload_key]`.
- If `optional: true` and no choice is provided, this step resolves as skip.
- Constraint mismatch raises `Persona choice does not meet constraints`.

#### `DEAL_DAMAGE_TO_COMBAT_OPPONENT`

```json
{ "type": "DEAL_DAMAGE_TO_COMBAT_OPPONENT", "value": 2 }
```

Deals damage to the current combat opponent of the source during `COMBAT_PRE_DAMAGE`.

#### `OBLIVIATE_ASSIGNED_PILOT`

```json
{ "type": "OBLIVIATE_ASSIGNED_PILOT", "payload_key": "_pilot_obliviated" }
```

Obliviates the pilot assigned to the source mecha and writes a boolean payload flag.

#### `APPLY_IF_PAYLOAD_TRUE`

```json
{
  "type": "APPLY_IF_PAYLOAD_TRUE",
  "payload_key": "_pilot_obliviated",
  "effect": { "type": "MODIFY_STAT", "stat": "ATK", "operator": "ADD", "value": 2 }
}
```

Executes nested effect only when payload flag is truthy.

`APPLY_IF_PAYLOAD_TRUE` supports either:
- `effect` (single nested effect), or
- `effects` (array of nested effects applied in order).

#### `APPLY_IF_PAYLOAD_FALSE`

```json
{
  "type": "APPLY_IF_PAYLOAD_FALSE",
  "payload_key": "_dealt_shattering_damage",
  "effect": { "type": "MODIFY_STAT", "stat": "ATK", "operator": "ADD", "value": -1, "duration": "END_OF_TURN" }
}
```

Executes nested effect only when the payload flag is missing or falsy.

#### `SET_PAYLOAD_FLAG_IF_PERSONA_MATCH`

```json
{
  "type": "SET_PAYLOAD_FLAG_IF_PERSONA_MATCH",
  "payload_key": "_has_persona_spell",
  "constraints": [{ "predicate": "HAS_TRAIT", "value": "Spell" }]
}
```

Writes a boolean payload flag indicating whether the owner currently has at least one persona-zone card matching the constraints.

Use this with `APPLY_IF_PAYLOAD_TRUE` / `APPLY_IF_PAYLOAD_FALSE` to build declarative persona-branch logic (instead of custom effect types).

#### `STORE_FROM_GRAVEYARD_AS_SUBSLOTS`

```json
{
  "type": "STORE_FROM_GRAVEYARD_AS_SUBSLOTS",
  "count": 3,
  "constraints": [{ "predicate": "HAS_TRAIT", "value": "Drone" }]
}
```

Stores selected cards as face-down subslot attachments on the target/source card.

#### `SUMMON_SUBSLOT_INSTEAD`

```json
{ "type": "SUMMON_SUBSLOT_INSTEAD", "prevent_damage": true }
```

Replaces damage by summoning one stored face-down subslot card to an empty slot.

#### `AURA_MODIFY_STAT`

Applies a continuous stat bonus to matching entities while the aura source is controlled.

```json
{
  "type": "AURA_MODIFY_STAT",
  "stat": "ATK",
  "operator": "ADD",
  "value": 1,
  "target_selector": { "selector_type": "ALL", "zone": "FIELD", "constraints": [ ... ] }
}
```

Engine behavior:
- This effect is interpreted during effective-stat computation (it is not applied as a one-time mutation).

#### `LOOK_TOP`

```json
{ "type": "LOOK_TOP", "count": 2, "revealed_payload_key": "_revealed_cards" }
```

Stores the top `count` cards in a revealed-card payload for later chained effects. It does not move cards by itself.

#### `PICK_FROM_REVEALED`

```json
{
  "type": "PICK_FROM_REVEALED",
  "payload_key": "choice_id",
  "revealed_payload_key": "_revealed_cards",
  "requires_choice": true
}
```

Selects one or more cards from the currently revealed set.

Optional filters:
- `required_trait`
- `required_type`
- `constraints`

If `optional: true` and no revealed cards match, the effect resolves with no selection.

#### `MOVE_PICKED_TO_HAND`

```json
{
  "type": "MOVE_PICKED_TO_HAND",
  "payload_key": "choice_id",
  "revealed_payload_key": "_revealed_cards"
}
```

Moves the selected revealed card(s) to hand and removes them from the revealed set.

#### `MOVE_PICKED_TO_DECK`

```json
{
  "type": "MOVE_PICKED_TO_DECK",
  "payload_key": "choice_id",
  "revealed_payload_key": "_revealed_cards",
  "position": "TOP"
}
```

Moves the selected revealed card(s) back into the deck, either on top or bottom.

#### `MOVE_REVEALED_TO_DECK`

```json
{
  "type": "MOVE_REVEALED_TO_DECK",
  "revealed_payload_key": "_revealed_cards",
  "position": "BOTTOM"
}
```

Moves every still-revealed card back into the deck, preserving the revealed order.

#### `MOVE_REVEALED_TO_GRAVEYARD`

```json
{
  "type": "MOVE_REVEALED_TO_GRAVEYARD",
  "revealed_payload_key": "_revealed_cards"
}
```

Moves every still-revealed card to graveyard.

#### `SCRY_REVEALED`

```json
{
  "type": "SCRY_REVEALED",
  "payload_key": "scry_choice",
  "revealed_payload_key": "_revealed_cards",
  "requires_choice": true
}
```

Reorders the revealed cards and returns them to the deck.

Client supplies `payload[payload_key]`:
- single card: `"keep"` or `"bottom"`
- multiple cards: `{ "top": [...], "bottom": [...] }`

The combined `top` + `bottom` order must exactly match the remaining revealed cards.

#### `PUT_TOP_TO_PLAY_IF_TRAIT`

```json
{
  "type": "PUT_TOP_TO_PLAY_IF_TRAIT",
  "trait": "Drone",
  "result_payload_key": "_summoned"
}
```

If deck top matches trait, summons it to play and writes a boolean payload result flag.

#### `PUT_FROM_HAND_TO_PLAY`

```json
{
  "type": "PUT_FROM_HAND_TO_PLAY",
  "payload_key": "hand_card_id",
  "constraints": [{ "predicate": "HAS_TRAIT", "value": "Drone" }]
}
```

Summons a matching card from hand to play (slot optional; defaults to first empty).

#### `RETURN_TARGET_TO_HAND`

Returns the selected field target to its owner's hand and emits `LEAVE_PLAY` with reason `return_to_hand`.

#### `OBLIVIATE_TARGET`

Obliviates the selected field target immediately and emits `LEAVE_PLAY` with reason `obliviate`.
Optional `store_cost_as` writes the target cost into payload.
Optional `store_card_id_as` writes the target card id into payload (`append_store_card_id: true` appends into a list).

#### `OBLIVIATE_FROM_HAND`

Obliviates one matching card from hand.

Key options:
- `target_owner`: `SELF` or `ENEMY`
- `payload_key`, `constraints`, `requires_choice`, `optional`
- `store_cost_as`
- `store_card_id_as` + `append_store_card_id`

#### `OBLIVIATE_FROM_HAND_OR_GRAVEYARD`

Obliviates up to `max` cards chosen from your hand and/or graveyard.  
Stores the total moved amount in `store_count_as` (default `_obliviated_count`).

#### `OBLIVIATE_SELF_AND_SUBSLOTS`

Obliviates the source card plus all cards in its subslots/attachments.

#### `MOVE_FROM_OBLIVION_TO_GRAVEYARD_UP_TO_COST`

Moves any number of matching oblivion cards to graveyard up to a total cost cap (`max_total_cost` or `max_total_cost_source`).

#### `MOVE_EVENT_CARD`

Moves `event.card_id` across zones (`from_zone` → `to_zone`) for event-owner-controlled effects.

#### `TRIGGER_ENTER`

Forces an `ENTER` event on the selected target (used for “trigger enter ability again” effects).

#### `DEAL_DAMAGE_TO_EVENT_TARGET`

Deals damage directly to `event.target` (useful for attack-declaration reactive effects).

#### `APPLY_TO_EVENT_TARGET`

Wraps a nested effect and applies it with `event.target` as the effect target.

#### `MARK_FORCE_OPPONENT_TARGET`

Marks the source/target card as mandatory target for the next valid opposing single-target action/ability.

#### `SWITCH_ASSIGNED_PILOT_FROM_HAND`

Switches a targeted assigned pilot with a pilot from hand and reassigns the mecha.

#### `CHECK_SHATTER`

Immediately runs shatter cleanup mid-chain (useful after intentional lethal damage effects).

#### `REPLACE_PROTAGONIST_FROM_PERSONA`

```json
{
  "type": "REPLACE_PROTAGONIST_FROM_PERSONA",
  "constraints": [{ "predicate": "IS_TYPE", "value": "PROTAGONIST" }]
}
```

Replaces your current protagonist with the lowest ready ALTER EGO protagonist found in persona zone.

Supports targeted replacement by supplying:
- `payload_key` (default `persona_card_id`)
- `requires_choice` (true forces explicit payload choice)
- standard persona `constraints`

#### `REMOVE_KEYWORD_UNTIL_END_OF_TURN`

Removes one active keyword from the selected target until turn cleanup.  
Supports:
- `payload_key` (default `keyword`)

If no keyword payload is provided, the engine removes the first valid keyword.
For UI-driven abilities, send explicit `payload[payload_key]` so the player chooses which active keyword is removed.

#### `OBLIVIATE_ALL_CONTROLLED_CHARACTERS`

Obliviates every character controlled by the effect owner.

#### `OBLIVIATE_ENTIRE_HAND`

Obliviates every card in the effect owner's hand.

#### `RETURN_TRIGGER_SOURCE_FROM_GRAVE_TO_PLAY`

Returns the trigger source card from graveyard to the first empty slot.  
Optional `frazzle` (or `frazzle_amount`) applies Frazzle counters on entry.

#### `RETURN_TRIGGER_SOURCE_FROM_GRAVE_OR_OBLIVION_TO_PLAY`

Same as above, but the trigger source may be returned from either graveyard or oblivion.

#### `REMOVE_UP_TO_COUNTERS_FROM_PROTAGONIST`

Removes up to `max` counters from the owner's protagonist and stores the removed total in payload (`store_removed_as`).

#### `ADD_KEYWORDS_FROM_PAYLOAD_CARD_IDS`

Reads card ids from `payload[payload_key]` and grants all those cards' printed keywords to the selected target(s).

#### `REDIRECT_ATTACK_TO_SOURCE`

During combat, changes the current attack target to the ability source card.

#### `PHASE_OUT_TARGET_UNTIL_OPPONENT_MOVE`

Marks a target as phased out (not considered in play) until the opponent declares any move.

#### `PUT_ALL_COPIES_FROM_ZONES_TO_PLAY`

Puts all copies of the source card id (or explicit `card_id`) from listed `zones` (`DECK`, `HAND`, `GRAVEYARD`) into empty slots.

#### `WIN_GAME`

Marks the effect owner as winner immediately (state-level forced winner).

#### Additional utility effects

Also supported:
- `SEARCH_DECK_ADD_TO_HAND`
- `MOVE_FROM_GRAVEYARD_TO_HAND`
- `HYPE_HAND_FILTER_DRAW`
- `SWAP_WITH_HAND_SAME_COST`
- `TRIGGER_ENTER_OF_DISCARDED`
- `REVIVE_FIRST_FROM_GRAVEYARD`
- `REVIVE_UP_TO_N_FROM_GRAVEYARD`
- `REVIVE_ALL_FROM_GRAVEYARD`
- `REVIVE_FROM_GRAVEYARD`
- `CAST_COPY_FROM_GRAVEYARD`
- `CAST_COPY_FIRST_FROM_GRAVEYARD`
- `LOOK_TOP`
- `PICK_FROM_REVEALED`
- `MOVE_PICKED_TO_HAND`
- `MOVE_PICKED_TO_DECK`
- `MOVE_REVEALED_TO_DECK`
- `MOVE_REVEALED_TO_GRAVEYARD`
- `SCRY_REVEALED`
- `AURA_REMOVE_KEYWORD`
- `RESTRICT_PLAY` (static/passive marker)
- `ACTION_NUMERIC_MODIFIER` (static/passive marker)
- `CARD_NUMERIC_MODIFIER` (static/passive marker applied to effect numbers based on the source card being resolved)
- `REPLACE_GRAVEYARD_TO_OBLIVION` (static/passive replacement marker)
- `ALLOW_PLAY_AS_RESPONSE` (static/passive play-rule marker)
- `ALLOW_PLAY_FROM_OBLIVION` (static/passive play-rule marker)
- `SET_PAYLOAD_FLAG_IF_PERSONA_MATCH`

Notes:
- `SEARCH_DECK_ADD_TO_HAND` supports `requires_choice`, `payload_key`, `constraints`, and `reveal_to_opponent` (adds a reveal entry visible to the opponent UI).
- `PUT_FROM_DECK_TO_PLAY` supports `requires_choice`, `payload_key` (default `summon`), `constraints`, `pay_cost_from_fragments`, and `requires_slot_selection` (UI hint: if `false`, selection confirms the card without a slot-pick step).
- `CAST_COPY_FROM_GRAVEYARD` supports `requires_choice`, `payload_key`, and `constraints`; after the copied spell is chosen, its own nested resolution choices are exposed through the same decision-context flow used by normal spells.
- The preferred top-deck flow is the primitive chain `LOOK_TOP` → `PICK_FROM_REVEALED` → `MOVE_PICKED_*` / `MOVE_REVEALED_*` / `SCRY_REVEALED`, which is what the current player UI and decision enumeration are built around.
- Legacy custom effect `PERSONA_DRAW_OR_FLIP` has been removed. Use composable primitives (`SET_PAYLOAD_FLAG_IF_PERSONA_MATCH` + `APPLY_IF_*` + `MOVE_FROM_PERSONA_ZONE_TO_HAND` / `FLIP_SELF`).

---

## 7) Value Sources

Many effects can compute numbers via `value_source` (optionally combined with `multiplier` and `base`):

```json
{ "value_source": "PROTAGONIST_COUNTER", "counter": "quest", "cap": 3, "base": 2 }
```

Supported value sources:
- `TARGET_DAMAGE` — uses the target entity's damage counters.
- `EFFECTIVE_ATK` — uses the target entity's effective ATK (base stats + modifiers).
- `SOURCE_COST` — uses source/anchor card cost.
- `HAND_SIZE` — number of cards in the source owner's hand.
- `HAND_EMPTY_BONUS` — `1` when source owner's hand is empty, else `0`.
- `OWNER_OBLIVION_COUNT` — cards in the source owner's oblivion.
- `TOTAL_OBLIVION_COUNT` — total cards across both players' oblivion zones.
- `BLOOD_TITHE_COUNT` — count of `BLOOD_TITHE` cards in your graveyard.
- `GRAVEYARD_CHARACTER_COUNT` — count of character cards in your graveyard.
- `OTHER_CHARACTER_COUNT` — count of other characters you control on the field.
- `CONTROLLED_RELIC_COUNT` — count of relics you control (including attached relics).
- `CONTROLLED_TRAIT_COUNT` — count of cards you control on the field (including attachments) with the configured `trait`.
- `RELIC_NOT_WORN_BY_PROTAGONIST_COUNT` — controlled relics minus protagonist-worn relics.
- `PROTAGONIST_COUNTER` — value of a named protagonist counter (e.g. `quest`) with optional `cap`.
- `SUBSLOT_FACE_DOWN_COUNT` — number of face-down stored subslot cards on the source.
- `ASSIGNED_PILOT_DAMAGE_HALF_UP` — half the assigned pilot's damage, rounded up.

Modifiers:
- `multiplier` multiplies the computed value.
- `base` adds after multiplier.
- Any effect node can set `numeric_bonus_exempt_keys` to keep specific numeric fields unchanged when `ACTION_NUMERIC_MODIFIER` is applied.

---

## 8) Passive “Rule” Effects

These are not executed like normal effects; they inform validations.

### `CANNOT_BE_ATTACKED_WHILE_COUNTER`

Used as a passive effect to block attack declaration:

```json
{ "type": "CANNOT_BE_ATTACKED_WHILE_COUNTER", "counter": "frazzle", "min": 1 }
```

---

## 9) Practical Examples

### 9.1 Enter: Quest 1, then heal X (X = quest counters)

```json
{
  "type": "TRIGGERED",
  "trigger": { "type": "ON_EVENT", "event_type": "ENTER", "target": "SELF" },
  "target_selector": { "selector_type": "SINGLE_TARGET", "zone": "FIELD", "constraints": [ { "predicate": "OWNER", "value": "SELF" } ] },
  "resolution_chain": [
    { "type": "ADD_COUNTER", "counter": "quest", "amount": 1, "target_selector": { "preset": "OWNER_PROTAGONIST" } },
    { "type": "HEAL", "value_source": "PROTAGONIST_COUNTER", "counter": "quest" }
  ]
}
```

### 9.2 “Frazzle, Frazzle: remove 1 frazzle from a target”

```json
{
  "type": "ACTIVATED",
  "cost": { "type": "ADD_COUNTER", "counter": "frazzle", "amount": 2 },
  "target_selector": { "selector_type": "SINGLE_TARGET", "zone": "FIELD" },
  "resolution_chain": [ { "type": "ADD_COUNTER", "counter": "frazzle", "amount": -1 } ]
}
```

### 9.3 Persona retrieval-or-flip (decomposed pattern)

```json
{
  "resolution_chain": [
    {
      "type": "SET_PAYLOAD_FLAG_IF_PERSONA_MATCH",
      "payload_key": "_has_persona_match",
      "constraints": [{ "predicate": "IS_TYPE", "value": "BLOOD_TITHE" }]
    },
    {
      "type": "APPLY_IF_PAYLOAD_TRUE",
      "payload_key": "_has_persona_match",
      "effect": {
        "type": "MOVE_FROM_PERSONA_ZONE_TO_HAND",
        "payload_key": "persona_card_id",
        "requires_choice": true,
        "constraints": [{ "predicate": "IS_TYPE", "value": "BLOOD_TITHE" }]
      }
    },
    {
      "type": "APPLY_IF_PAYLOAD_FALSE",
      "payload_key": "_has_persona_match",
      "effect": {
        "type": "FLIP_SELF",
        "require_alter_ego_ready": true,
        "emit_enter": true
      }
    }
  ]
}
```

---

## 10) Condition Types (Ability `condition`)

Currently used condition types include:
- `CONTROLS_TRAIT`
- `CONTROLS_TRAIT_TOTAL_ATK_AT_LEAST`
- `CONTROLS_TRAIT_MAX`
- `CONTROLS_TYPE_MAX`
- `CONTROLS_CARD_NAME_MAX`
- `GRAVEYARD_HAS_TYPE`
- `PROTAGONIST_HAS_TRAIT`
- `PROTAGONIST_HAS_ANY_TRAIT`
- `TURN_FLAG`
- `TURN_EVENT_MATCH`

---

## 11) Ability Authoring Checklist

Use this checklist when adding or refactoring abilities:

1. **Prefer primitives over custom effects**
   - Compose behavior with existing effect nodes (`CHOOSE`, `APPLY_IF_*`, selector-based effects, revealed-card flow).
   - Add new engine effect types only when composition cannot express the rule cleanly.

2. **Define interaction timing explicitly**
   - Cast-time choice: keep selection at ability/cost level or with cast-time effect timing.
   - Resolve-time choice: use effects that naturally defer to resolution context (`requires_choice`, `requires_slot`, `requires_confirmation`).

3. **Model optional branches declaratively**
   - Use `optional: true` where skip is legal.
   - Use payload flags + `APPLY_IF_PAYLOAD_TRUE/FALSE` for conditional branches.

4. **Keep payload keys stable and specific**
   - Use clear keys (`persona_card_id`, `graveyard_card_id`, `scry_choice`, etc.).
   - Reuse standard keys unless multiple independent selections require separate names.

5. **Use constraints as the legality source**
   - Put legality in `constraints` / selectors, not in frontend assumptions.
   - Keep constraints consistent across costs, cast inference, and resolution effects.

6. **Avoid hidden side effects**
   - If later steps depend on earlier results, write to payload with explicit keys.
   - For top-deck/reveal pipelines, keep `revealed_payload_key` consistent end-to-end.

7. **Validate with targeted tests**
   - Add one happy-path test and one edge/failure test (no legal targets, optional skip, invalid choice, etc.).
   - Prefer tests that verify both state mutation and stack/trigger progression.

## 12) Stack & Priority (Client Integration)

The engine exposes a single stack in `BoardState.stack`. Entries have a `kind`:

- `TRIGGER` — queued triggered/choice-required abilities that must be resolved (Confirm/Skip, choose targets, choose modes, etc).
- `ACTION` — “moves” that open a response window (play card, cast action, activate ability, declare attack/block, retire, end turn).

### 12.1 `ACTION` entries

`ACTION` entries are produced by `backend/engine/turn_manager.py`.

Payload shape examples:

- Play a card:
  - `{ "type": "PLAY_CARD", "card_id": "...", "row": 0, "col": 2, "is_response": false }`
- Cast an action card:
  - `{ "type": "CAST_ACTION", "card_id": "...", "payload": { ... }, "is_response": false }`
- Activate an ability:
  - `{ "type": "ABILITY", "row": 0, "col": 0, "ability": 1, "payload": { ... }, "is_response": true, "no_response": false }`
- Declare attack/block:
  - `{ "type": "DECLARE_ATTACK", "attacker": { "row": 0, "col": 0 }, "target": { "row": 0, "col": 1 }, "is_response": false }`
  - `{ "type": "DECLARE_BLOCK", "blocker": { "row": 0, "col": 0 } | null, "is_response": false }`

Rule notes:
- A move can receive **at most one** response (`ACTION` stack depth max 2).
- A response can be `CAST_ACTION`, `ABILITY`, or `PLAY_CARD` when the card has static `ALLOW_PLAY_AS_RESPONSE`.
- The player with `BoardState.priority_holder` may act or pass.

UI note:
- The frontend derives the stack preview and target highlights from these payloads (no per-card hardcoded logic).
