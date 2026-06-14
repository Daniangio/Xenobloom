# Nutrients and Strains

Nutrients are static tile features. A nutrient tile has one `nutrient_type`: `green`, `blue`, or `purple`.

Assimilators built on nutrient tiles extract progress at the end of each season while active.

## Extraction

Current threshold: `5`.

Open-neighbor rate:

- 4 to 6 empty neighbors: +2 progress
- 2 to 3 empty neighbors: +1 progress
- 0 to 1 empty neighbors: +0 progress

Hydration modifier:

- hydration >= 0: no penalty
- hydration <= -1: extraction rate -1, minimum 0
- hydration <= -2: Assimilator also gains +1 stress

When progress reaches the threshold, the Assimilator creates one Strain of its tile nutrient color. Overflow progress is preserved.

## Strain Maturity

Strains produce Maturity each season.

```text
G = Green strains
B = Blue strains
P = Purple strains
T = min(G, B, P)

strainMaturity = G^2 + B^2 + P^2 + 10T
```

This scoring is intentionally strong to create late-game acceleration.
