# Game UI

The frontend renders backend public game state and does not own game rules.

Current UI responsibilities:

- show tile hydration and stress
- show nutrient markers on the board
- show selected tile nutrient type
- show selected element details
- show Assimilator extraction progress and projected rate
- show Strain counts, Triplets, and per-season Strain Maturity
- show active actions with icon costs
- separate local Core upgrades from global upgrades in the Core details panel

The board uses small colored markers for nutrients:

- Green: `#48bb78`
- Blue: `#4299e1`
- Purple: `#9f7aea`

Assimilator glyphs inherit the nutrient color of their tile.
