# Upgrades

There are two upgrade classes.

## Local Building Upgrades

Local upgrades occupy a building's `building_upgrade` slot.

Examples:

- Core Deep Roots
- Neural Core
- Heavy Condenser
- Geyser Condenser
- Bloom upgrades

Local upgrades can replace or add configured effects.

## Global Upgrades

Global upgrades are stored separately in `global_upgrades` and do not consume a local building upgrade slot.

Implemented global upgrades:

- Composting Instinct: changes Dismantle into Compost
- Autonomous Assimilators: Assimilators function while disconnected from Core

Global upgrade configs live in `backend/app/game_configs/global_upgrades`.
