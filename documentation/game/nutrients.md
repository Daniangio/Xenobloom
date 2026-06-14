# Alien Hex Colony — Nutrient / Assimilator / Strain Implementation Spec

## 1. Purpose of This Update

This update adds a positive scoring engine to the current prototype.

The existing game loop is mainly:

```text
Build colony → manage Life → survive Hydration/Drought pressure → accumulate Maturity
```

The new layer adds:

```text
Reach nutrient tiles → build Assimilators → generate Strains → score high Maturity through Strain patterns
```

The goal is to make the game less about passive survival and more about strategic development.

The new terms are:

```text
Assimilator = building placed on nutrient tiles to extract nutrient progress.
Strain = permanent global item produced by an Assimilator.
Triplet = one complete set of Green + Blue + Purple Strains.
```

## 2. New Tile Properties

Each tile gains one optional nutrient property.

### Add to tile data

```ts
nutrientType: null | "green" | "blue" | "purple";
```

No nutrient richness for now.

There is no nutrient level.

A nutrient tile is simply:

```text
This tile contains Green nutrient.
This tile contains Blue nutrient.
This tile contains Purple nutrient.
```

Nutrients do not diffuse, grow, decay, or get consumed in this version.

They are static map features.

## 3. Map Generation

At map generation, add nutrient deposits.

Suggested first implementation:

```text
3 Green nutrient tiles
3 Blue nutrient tiles
3 Purple nutrient tiles
```

These should be placed away from the Core, preferably distance 2 or more.

Avoid placing nutrients on:

```text
Core tile
Rock tile
Existing building tile
```

Nutrients may appear on:

```text
neutral terrain
forest terrain
moist terrain
dry terrain
```

A forest tile with nutrient still counts as a nutrient tile.

The forest does not block extraction openness unless it contains a building.

## 4. New Global State

Add global Strain counts.

```ts
const [strains, setStrains] = useState({
  green: 0,
  blue: 0,
  purple: 0
});
```

Add optional global upgrade state.

```ts
const [globalUpgrades, setGlobalUpgrades] = useState({
  composting: false,
  autonomousAssimilators: false,
  autonomousConnectors: false,
  autonomousCondensers: false,
  autonomousBlooms: false
});
```

This can later be expanded.

## 5. New Building: Assimilator

### Building identity

```text
Assimilator
```

Suggested visual:

```text
triangle / spiral / hex-ring icon
colored according to nutrientType of its tile
```

### Build requirements

Assimilator can be built if:

```text
selected tile has no building
selected tile has nutrientType != null
selected tile is connected to colony adjacency
actionsLeft >= 1
availableLife >= 1
```

Recommended cost:

```text
1 action
1 Life
```

Recommended sustain:

```text
1 Life per season
```

Assimilator does not directly produce Life.

Assimilator does not directly produce Maturity.

Its purpose is to produce Strains.

## 6. Assimilator Data

Each Assimilator stores extraction progress.

Add to tile data:

```ts
extractionProgress: number; // default 0
```

Only meaningful for Assimilator buildings.

When an Assimilator is removed, its progress is lost unless later upgrades say otherwise.

## 7. Extraction Progress

Each active Assimilator extracts nutrient progress at the end of each season.

Completion threshold:

```text
STRAIN_THRESHOLD = 5
```

This is a tuning knob.

If Strain scoring becomes too strong, increase to:

```text
STRAIN_THRESHOLD = 6
```

### Empty-neighbor rule

Count adjacent empty tiles.

```text
empty neighbor = adjacent tile with no building
```

Important:

```text
Forest counts as empty if it has no building.
Lake counts as empty if it has no building.
Rock counts as empty if it has no building.
Nutrient tiles count as empty if they have no building.
Connector is a building, so it does not count as empty.
```

Extraction openness rate:

```text
4–6 empty neighbors: +2 progress
2–3 empty neighbors: +1 progress
0–1 empty neighbors: +0 progress
```

This is the harsher mode.

### Hydration modifier

Let `H = tile.hydration`.

```text
If H >= 0:
  no extraction penalty

If H <= -1:
  extraction rate -1, minimum 0

If H <= -2:
  Assimilator also gains +1 Stress
```

Final extraction rate:

```text
baseRate = opennessRate
if H <= -1: baseRate -= 1
rate = max(0, baseRate)
```

Then:

```text
extractionProgress += rate
```

If:

```text
extractionProgress >= STRAIN_THRESHOLD
```

then:

```text
create 1 Strain of tile nutrient color
extractionProgress -= STRAIN_THRESHOLD
```

Use subtraction rather than reset, so overflow is preserved.

Example:

```text
Assimilator has 4/5 progress.
This season it extracts +2.
Progress becomes 6.
Create 1 Strain.
Remaining progress = 1/5.
```

## 8. Strain Scoring

Strains produce Maturity every season.

Let:

```text
G = number of Green Strains
B = number of Blue Strains
P = number of Purple Strains
T = min(G, B, P)
```

Per-season Strain Maturity:

```text
strainMaturity = G² + B² + P² + 10T
```

Examples:

```text
G=1, B=0, P=0:
1² = +1 Maturity/season

G=2, B=0, P=0:
2² = +4 Maturity/season

G=1, B=1, P=1:
1 + 1 + 1 + 10 = +13 Maturity/season

G=2, B=2, P=1:
4 + 4 + 1 + 10 = +19 Maturity/season

G=2, B=2, P=2:
4 + 4 + 4 + 20 = +32 Maturity/season
```

This is intentionally powerful.

Balance lever:

```text
If scoring scales too fast, increase STRAIN_THRESHOLD from 5 to 6.
```

Do not soften the formula yet unless testing shows the scoring completely dominates the game.

## 9. When Strain Scoring Is Applied

Apply Strain Maturity once per season during Maturity calculation.

Current Maturity sources remain:

```text
Core Maturity
Bloom Maturity
Bloom upgrades
Core upgrades
```

Add:

```text
newMaturity += calculateStrainMaturity(strains)
```

The UI should show this separately.

Example summary:

```text
Season Maturity:
Core: +1
Blooms: +4
Strains: +13
Total: +18
```

## 10. Strain UI

Add a Strain panel to the status UI.

Suggested display:

```text
Strains
Green: 2
Blue: 1
Purple: 1
Triplets: 1
Strain Score: +16 / season
```

Use colored icons or small circles.

For Assimilator tile inspection, show:

```text
Assimilator
Nutrient: Green
Progress: 3 / 5
Projected extraction: +2 next season
Reason:
+2 openness
0 hydration penalty
```

If dry:

```text
Projected extraction: +1
Reason:
+2 openness
-1 dry tile
```

If surrounded:

```text
Projected extraction: +0
Reason:
+0 openness
```

This is important for player understanding.

## 11. Core Connectivity

Buildings only function if connected to the Core.

Connectivity is determined by adjacency through colony buildings.

A building is active if:

```text
it is reachable from the Core through adjacent tiles containing buildings
```

Connectors count as buildings for connectivity.

Disconnected buildings:

```text
produce no Life
produce no Maturity
do not extract nutrients
do not emit Hydration
do not apply adjacency effects
do not count for expansion adjacency
```

Disconnected buildings do not decay automatically.

They may still receive environmental Stress from Hydration/Drought/Toxin rules if applicable.

### Autonomous property

Some buildings may later work while disconnected if they have the `Autonomous` property.

Autonomous can be assigned in two ways:

```text
1. Individual building upgrade
2. Global Core upgrade affecting all buildings of a type
```

For this implementation, support global autonomous upgrades.

Example:

```text
Autonomous Assimilators:
All Assimilators function even if disconnected from Core.

Autonomous Condensers:
All Condensers emit Hydration even if disconnected.

Autonomous Connectors:
Connectors remain valid expansion anchors even if disconnected.
```

Recommended first global autonomous upgrade:

```text
Autonomous Assimilators
```

This creates a meaningful strategy for remote nutrient outposts.

## 12. Connectivity Implementation

At the start of each season resolution, compute active buildings.

Pseudo-code:

```ts
function computeConnectedKeys(grid, globalUpgrades) {
  const connected = new Set<string>();
  const queue = ["0,0"];

  while (queue.length > 0) {
    const key = queue.shift();
    if (connected.has(key)) continue;

    const hex = grid[key];
    if (!hex || !hex.building) continue;

    connected.add(key);

    for (const n of getNeighbors(hex.q, hex.r)) {
      const nKey = `${n.q},${n.r}`;
      const nHex = grid[nKey];
      if (nHex?.building && !connected.has(nKey)) {
        queue.push(nKey);
      }
    }
  }

  return connected;
}
```

Then:

```ts
function isBuildingActive(hex, key, connectedKeys, globalUpgrades) {
  if (!hex.building) return false;
  if (connectedKeys.has(key)) return true;

  if (hex.building === "assimilator" && globalUpgrades.autonomousAssimilators) return true;
  if (hex.building === "condenser" && globalUpgrades.autonomousCondensers) return true;
  if (hex.building === "connector" && globalUpgrades.autonomousConnectors) return true;
  if (hex.building === "bloom" && globalUpgrades.autonomousBlooms) return true;

  return false;
}
```

All production/effects should check `isBuildingActive`.

## 13. New Building: Connector

If not already implemented, add Connector as a simple expansion building.

### Connector rules

```text
Cost: 1 action
Life cost: 0 or 1, depending on balance
Sustain cost: 0
Maturity: 0
Effect: counts as colony building for connectivity and expansion
```

Recommended first version:

```text
Cost: 1 action
Life cost: 0
Sustain cost: 0
```

This makes Connectors a cheap way to reach nutrient patches.

Connector restrictions:

```text
Can be built on neutral terrain.
Can be built if adjacent to active colony building.
Does not require Hydration >= 0 unless testing shows too much expansion.
```

Possible stricter version:

```text
Can be built on H >= -1.
```

## 14. Dismantle / Destroy Action

Add a universal removal action.

### Base action: Dismantle

```text
Cost: 1 action
Life cost: 0
Effect: remove selected building
```

Rules:

```text
Cannot dismantle Core.
Can dismantle any other building.
No refund.
No Hydration effect.
No Maturity effect.
Lost extraction progress if Assimilator is removed.
```

This gives players control over bad placements and blocked Assimilators.

## 15. Composting Upgrade

Composting should be a global Core upgrade, not a default rule.

### Global Core upgrade: Composting Instinct

Cost:

```text
1 action
4 Life
```

or, later:

```text
1 action
Adaptation cost
```

For now use Life if Adaptation is not implemented.

Effect:

```text
Dismantle becomes Compost.
```

When Compost is used:

```text
Remove selected building.
Add +1 Hydration to the building tile.
Add +1 Hydration to 2 adjacent tiles.
```

The 2 adjacent tiles should be chosen by the player if UI is easy.

Simpler first implementation:

```text
Choose the 2 adjacent tiles with lowest Hydration.
If tie, resolve by wind or random.
```

Recommended first implementation:

```text
automatic targeting: two adjacent tiles with lowest Hydration
```

This keeps mobile UI simple.

Compost cannot raise Hydration above +3.

Compost cannot be used on Core.

## 16. Core Global Upgrades

Core upgrades must be visually and mechanically distinct from local building upgrades.

Current prototype already has Core upgrades such as Life and Maturity. Global upgrades should be explicitly marked.

### UI requirement

In the Core action panel, separate:

```text
Core Upgrade
Global Upgrade
```

Example UI:

```text
Core Upgrade:
- Deep Roots: Core produces more Life.
- Neural Core: Core produces more Maturity.

Global Upgrade:
- Composting Instinct: Dismantle becomes Compost.
- Autonomous Assimilators: Assimilators work while disconnected.
```

### Data model

Local Core upgrade:

```ts
buildingUpgrade: "life" | "maturity" | null
```

Global upgrades:

```ts
globalUpgrades: {
  composting: boolean,
  autonomousAssimilators: boolean,
  autonomousConnectors: boolean,
  autonomousCondensers: boolean,
  autonomousBlooms: boolean
}
```

Global upgrades should not consume the local Core upgrade slot unless intentionally designed later.

For now:

```text
Core can have one local upgrade and multiple global upgrades.
```

## 17. Recommended First Global Upgrades

Add only two at first.

### Composting Instinct

```text
Cost: 1 action, 4 Life
Effect: Dismantle becomes Compost.
```

### Autonomous Assimilators

```text
Cost: 1 action, 5 Life
Effect: Assimilators function even if disconnected from Core.
```

Do not add autonomous upgrades for every building immediately.

Add them later if needed.

## 18. Updated Season Resolution Order

Suggested order:

```text
1. Compute Core connectivity.
2. Determine active buildings.
3. Resolve Condenser Hydration effects from active Condensers.
4. Resolve Drought spread / Hydration changes.
5. Apply building environmental Stress.
6. Compute Life production from active buildings.
7. Compute sustain from active buildings.
8. Apply deficit Stress if sustain > production.
9. Resolve active Assimilator extraction.
10. Create Strains if progress reaches threshold.
11. Add Maturity:
    - Core
    - Blooms
    - upgrades
    - Strain scoring
12. Check collapse / win / loss.
13. Recompute next season economy snapshot.
```

Important:

```text
Disconnected buildings should not contribute to Life production or sustain.
```

Rationale:

If a building is disconnected and inactive, it should not be consuming colony Life. Otherwise isolated outposts punish the player even though they are not functioning.

Exception can be added later, but for now:

```text
inactive = no production, no sustain, no effects
```

## 19. Updated Economy Calculation

Modify `calculateEconomy`.

Current logic computes production and sustain over all buildings.

New logic should compute connectivity first.

Pseudo-logic:

```ts
const connectedKeys = computeConnectedKeys(currentGrid);

Object.entries(currentGrid).forEach(([key, hex]) => {
  if (!hex.building) return;

  const active = isBuildingActive(hex, key, connectedKeys, globalUpgrades);
  if (!active) return;

  // production and sustain only for active buildings
});
```

Assimilator:

```text
production: 0 Life
sustain: 1 Life
```

Connector:

```text
production: 0 Life
sustain: 0 Life
```

## 20. Updated Action List

For empty tile:

```text
Grow Bloom
Grow Condenser
Grow Connector
Grow Assimilator, only if nutrientType != null
```

For existing non-Core building:

```text
Repair
Dismantle / Compost
Upgrade, if available
```

For Core:

```text
Repair, if allowed
Local Core Upgrade
Global Upgrade
```

## 21. Assimilator Action Requirements

```text
Grow Assimilator:
- selected tile has no building
- selected tile has nutrientType != null
- selected tile is adjacent to active colony building
- actionsLeft >= 1
- availableLife >= 1
```

Cost:

```text
1 action
1 Life
```

Add log:

```text
Built Green Assimilator at q,r.
```

If the nutrient type is Green.

## 22. Strain Creation Log

When progress completes:

```text
Green Assimilator produced 1 Green Strain.
```

If multiple complete in same season:

```text
2 Strains produced this season: Green + Purple.
```

Strain creation should be visually satisfying.

Suggested animation:

```text
colored pulse from Assimilator to top-left Strain panel
```

## 23. Suggested Colors

```text
Green Strain: #48bb78
Blue Strain: #4299e1
Purple Strain: #9f7aea
```

Nutrient tile visual:

```text
small colored dot or ring on tile
```

Assimilator visual:

```text
building icon inherits nutrient color
progress bar shown in selected tile panel
```

## 24. Tuning Knobs

Keep these constants configurable.

```ts
const STRAIN_THRESHOLD = 5;

const ASSIMILATOR_BUILD_LIFE_COST = 1;
const ASSIMILATOR_SUSTAIN = 1;

const CONNECTOR_BUILD_LIFE_COST = 0;
const CONNECTOR_SUSTAIN = 0;

const TRIPLET_MATURITY_BONUS = 10;
```

If nutrients dominate too hard, change in this order:

```text
1. Increase STRAIN_THRESHOLD from 5 to 6.
2. Increase Assimilator sustain from 1 to 2.
3. Reduce Triplet bonus from 10 to 7.
4. Cap quadratic score only if still necessary.
```

Do not start with caps, because the current design intentionally wants late-game Maturity acceleration.

## 25. Design Rationale

The Assimilator system creates four useful pressures.

### 1. Expansion pressure

Nutrient tiles may be far away, so Connectors matter.

### 2. Openness pressure

Assimilators extract faster when exposed.

This prevents the best strategy from being “surround every valuable tile with buildings.”

### 3. Hydration pressure

Drought does not only threaten survival. It slows extraction and can stress Assimilators.

### 4. Score pressure

Strains create high late-game scoring.

The player now has a reason to build beyond immediate survival.

## 26. Example Gameplay Sequence

Season 4:

```text
Player builds Connector toward Purple nutrient.
Player builds Assimilator on Green nutrient.
Player builds Condenser to keep the area hydrated.
```

Season 5:

```text
Green Assimilator has 4 empty neighbors.
Hydration is 0.
Extraction +2.
Progress: 2/5.
```

Season 6:

```text
Drought makes tile H = -1.
Assimilator has 4 empty neighbors.
Base extraction +2, drought penalty -1.
Extraction +1.
Progress: 3/5.
```

Season 7:

```text
Player builds Condenser nearby.
Hydration returns to 0.
Extraction +2.
Progress reaches 5/5.
Green Strain created.
Progress resets to 0/5.
```

Season 8:

```text
Green Strains = 1.
Strain Maturity = 1² = +1 per season.
```

Later:

```text
Green = 1, Blue = 1, Purple = 1.
Strain Maturity = 1 + 1 + 1 + 10 = +13 per season.
```

This creates the intended late-game acceleration.

## 27. Immediate Implementation Checklist

### Data

```text
Add nutrientType to tiles.
Add extractionProgress to tiles.
Add strains global state.
Add globalUpgrades state.
```

### Map

```text
Generate Green/Blue/Purple nutrient tiles.
Render nutrient markers.
```

### Buildings

```text
Add connector.
Add assimilator.
```

### Economy

```text
Update calculateEconomy with connectivity.
Add Assimilator sustain.
Add Connector sustain = 0.
```

### Connectivity

```text
Compute connected buildings from Core.
Inactive disconnected buildings do not work.
Add Autonomous Assimilators global upgrade.
```

### Actions

```text
Build Connector.
Build Assimilator.
Dismantle.
Compost if global upgrade is active.
Core global upgrades.
```

### Season Resolution

```text
Resolve active Assimilator extraction.
Create Strains.
Add Strain Maturity.
```

### UI

```text
Show nutrient markers on map.
Show Strain counts.
Show Triplet count.
Show Strain Maturity per season.
Show Assimilator progress and projected extraction.
Separate Core local upgrades from global upgrades.
```
