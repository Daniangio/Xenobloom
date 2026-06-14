# Connectivity

Buildings function only while active.

A building is active when it is reachable from the Core through adjacent tiles containing buildings. Connectors count as buildings for this traversal.

Inactive disconnected buildings:

- do not produce Life or Maturity
- do not consume sustain
- do not emit hydration
- do not extract nutrients
- do not count as expansion anchors

Global upgrades may make building classes autonomous. The first implemented autonomous upgrade is `Autonomous Assimilators`, which lets Assimilators function while disconnected from the Core.
