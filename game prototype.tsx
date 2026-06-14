import React, { useState, useEffect } from 'react';
import { ShieldAlert, Droplets, Flame, RefreshCcw, Info, Wind, ArrowUpCircle } from 'lucide-react';

// --- HEX MATH & UTILS ---
const HEX_SIZE = 22;
const MAP_RADIUS = 4;

const DIRECTIONS = [
  { q: 1, r: 0, name: 'E' },    // 0
  { q: 0, r: 1, name: 'SE' },   // 1
  { q: -1, r: 1, name: 'SW' },  // 2
  { q: -1, r: 0, name: 'W' },   // 3
  { q: 0, r: -1, name: 'NW' },  // 4
  { q: 1, r: -1, name: 'NE' }   // 5
];

const getNeighbors = (q, r) => DIRECTIONS.map((d, i) => ({ q: q + d.q, r: r + d.r, dirIndex: i }));
const hexDistance = (q1, r1, q2, r2) => (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
const angularDistance = (dir1, dir2) => {
  const diff = Math.abs(dir1 - dir2);
  return Math.min(diff, 6 - diff);
};

// Generate Hex Grid
const generateGrid = () => {
  const grid = {};
  for (let q = -MAP_RADIUS; q <= MAP_RADIUS; q++) {
    for (let r = Math.max(-MAP_RADIUS, -q - MAP_RADIUS); r <= Math.min(MAP_RADIUS, -q + MAP_RADIUS); r++) {
      grid[`${q},${r}`] = {
        q, r,
        terrain: 'neutral',
        hydration: 0,
        building: null,
        buildingUpgrade: null, // Track upgrades
        stress: 0,
        terrainStress: 0
      };
    }
  }

  const hexes = Object.values(grid);
  grid['0,0'].building = 'core';

  const distantHexes = hexes.filter(h => hexDistance(0, 0, h.q, h.r) >= 2);
  const edgeHexes = hexes.filter(h => hexDistance(0, 0, h.q, h.r) === MAP_RADIUS);
  
  const popRandom = (arr) => arr.splice(Math.floor(Math.random() * arr.length), 1)[0];

  // 3 Rocks
  let available = [...distantHexes];
  for(let i=0; i<3; i++) if(available.length) popRandom(available).terrain = 'rock';
  
  // 3 Forests
  for(let i=0; i<3; i++) {
    if(available.length) {
      let f = popRandom(available);
      f.terrain = 'forest';
      f.hydration = 1;
    }
  }
  // 5 Random Moist tiles (1 to 3)
  for(let i=0; i<5; i++) if(available.length) popRandom(available).hydration = Math.floor(Math.random() * 3) + 1;
  
  // 3 Drought Initial Centers on EDGES ONLY
  let edgeAvailable = [...edgeHexes];
  for(let i=0; i<3; i++) if(edgeAvailable.length) popRandom(edgeAvailable).hydration = -3;

  return grid;
};

// -- ECONOMY CALCULATIONS --
const calculateEconomy = (currentGrid) => {
  let prod = 0, sustain = 0;
  Object.values(currentGrid).forEach(hex => {
    if (!hex.building) return;
    
    if (hex.building === 'core') {
      prod += (hex.buildingUpgrade === 'life' ? 5 : 3);
    } 
    else if (hex.building === 'bloom') {
      sustain += 1;
      let p = 0;
      if (hex.hydration === 3) p = 2;
      else if (hex.hydration >= 1) p = 1;
      
      if (hex.buildingUpgrade === 'resilient' && hex.hydration >= 0) p += 1;
      prod += p;
    } 
    else if (hex.building === 'condenser') {
      sustain += 1;
    }
  });
  return { prod, sustain };
};

// --- MAIN COMPONENT ---
export default function AlienHexColony() {
  const [grid, setGrid] = useState(generateGrid());
  const [season, setSeason] = useState(1);
  const [windDir, setWindDir] = useState(Math.floor(Math.random() * 6));
  const [actionsLeft, setActionsLeft] = useState(3);
  const [maturity, setMaturity] = useState(0);
  
  // Economy State
  const [baseEcon, setBaseEcon] = useState({ prod: 3, sustain: 0 }); // Turn Start snapshot
  const [spentLife, setSpentLife] = useState(0);
  
  const [selectedHexKey, setSelectedHexKey] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [logs, setLogs] = useState(["Colony initialized."]);

  const addLog = (msg) => setLogs(prev => [msg, ...prev].slice(0, 8));

  // Initialize Base Econ on Mount
  useEffect(() => {
    if (season === 1 && maturity === 0) {
      setBaseEcon(calculateEconomy(grid));
    }
  }, []);

  const liveEcon = calculateEconomy(grid);
  const prodDelta = liveEcon.prod - baseEcon.prod;
  const sustainDelta = liveEcon.sustain - baseEcon.sustain;
  const availableLife = Math.max(0, baseEcon.prod - baseEcon.sustain) - spentLife;

  // -- LOGIC UTILS --
  const isForestAura = (g, q, r) => {
    if (g[`${q},${r}`]?.terrain === 'forest') return true;
    return getNeighbors(q, r).some(n => g[`${n.q},${n.r}`]?.terrain === 'forest');
  };

  const resolveTiesWithWind = (targetsArr) => {
    if (targetsArr.length === 1) return targetsArr[0];
    let bestAngular = Infinity;
    let angularTies = [];

    targetsArr.forEach(pt => {
      const dist = angularDistance(pt.dirIndex, windDir);
      if (dist < bestAngular) {
        bestAngular = dist;
        angularTies = [pt];
      } else if (dist === bestAngular) {
        angularTies.push(pt);
      }
    });
    return angularTies[Math.floor(Math.random() * angularTies.length)];
  };

  // -- ACTIONS EXECUTION --
  const handleBuild = (type) => {
    const key = selectedHexKey;
    setGrid(prev => ({ ...prev, [key]: { ...prev[key], building: type, buildingUpgrade: null, stress: 0 } }));
    setSpentLife(prev => prev + 1);
    setActionsLeft(prev => prev - 1);
    addLog(`Built ${type} at ${grid[key].q},${grid[key].r}.`);
  };

  const handleRepair = () => {
    const key = selectedHexKey;
    setGrid(prev => ({ ...prev, [key]: { ...prev[key], stress: Math.max(0, prev[key].stress - 1) } }));
    setActionsLeft(prev => prev - 1);
    addLog(`Repaired structure at ${grid[key].q},${grid[key].r}.`);
  };

  const handleUpgrade = (upgradeId, cost) => {
    const key = selectedHexKey;
    setGrid(prev => {
      let next = { ...prev, [key]: { ...prev[key], buildingUpgrade: upgradeId } };
      if (upgradeId === 'geyser') {
         next[key].hydration = Math.min(3, next[key].hydration + 3);
      }
      return next;
    });
    setSpentLife(prev => prev + cost);
    setActionsLeft(prev => prev - 1);
    addLog(`Upgraded to ${upgradeId} at ${grid[key].q},${grid[key].r}.`);
  };

  // -- END SEASON RESOLUTION --
  const endSeason = () => {
    if (gameOver) return;
    let nextGrid = JSON.parse(JSON.stringify(grid));
    let newMaturity = maturity;
    let turnLogs = [];
    
    // Wind Change (Season > 1, Odd Turns)
    let currentWindDir = windDir;
    if (season > 1 && season % 2 !== 0) {
      currentWindDir = Math.floor(Math.random() * 6);
      setWindDir(currentWindDir);
      turnLogs.push(`Wind shifted to ${DIRECTIONS[currentWindDir].name}.`);
    }

    // 1. Condenser Action
    Object.values(nextGrid).forEach(hex => {
      if (hex.building === 'condenser') {
        const iterations = hex.buildingUpgrade === 'heavy' ? 2 : 1;
        
        for (let i = 0; i < iterations; i++) {
          let possibleTargets = [];
          let minH = Infinity;

          getNeighbors(hex.q, hex.r).forEach(n => {
            const target = nextGrid[`${n.q},${n.r}`];
            if (!target) return;
            const delta = Math.abs(hex.hydration - target.hydration);
            if (target.terrain === 'rock' && delta < 3) return; 

            if (target.hydration < minH) {
              minH = target.hydration;
              possibleTargets = [{ target, dirIndex: n.dirIndex }];
            } else if (target.hydration === minH) {
              possibleTargets.push({ target, dirIndex: n.dirIndex });
            }
          });

          if (possibleTargets.length > 0) {
            const bestTarget = resolveTiesWithWind(possibleTargets).target;
            if (bestTarget.terrain === 'rock') bestTarget.hydration = Math.min(1, Math.max(-1, bestTarget.hydration + 1));
            else bestTarget.hydration = Math.min(3, bestTarget.hydration + 1);
          }
        }
      }
    });

    // 2. Drought Spread (Even Turns Only)
    if (season % 2 === 0) {
      let activeDroughtSources = Object.values(grid).filter(h => h.hydration <= -1);
      for (let i = activeDroughtSources.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [activeDroughtSources[i], activeDroughtSources[j]] = [activeDroughtSources[j], activeDroughtSources[i]];
      }

      activeDroughtSources.forEach(sourceHex => {
        const hex = nextGrid[`${sourceHex.q},${sourceHex.r}`];
        let possibleTargets = [];
        let maxH = -Infinity;

        getNeighbors(hex.q, hex.r).forEach(n => {
          const target = nextGrid[`${n.q},${n.r}`];
          if (!target) return;
          const delta = target.hydration - hex.hydration;
          if (delta <= 0) return;
          if (target.terrain === 'rock' && delta < 3) return;
          if ((isForestAura(nextGrid, target.q, target.r) || isForestAura(nextGrid, hex.q, hex.r)) && delta < 2) return;

          if (target.hydration > maxH) {
            maxH = target.hydration;
            possibleTargets = [{ target, dirIndex: n.dirIndex }];
          } else if (target.hydration === maxH) {
            possibleTargets.push({ target, dirIndex: n.dirIndex });
          }
        });

        if (possibleTargets.length > 0) {
          const bestTarget = resolveTiesWithWind(possibleTargets).target;
          bestTarget.hydration = Math.max(-3, bestTarget.hydration - 1); // Auto-catalysis
        } else {
          hex.hydration = Math.max(-3, hex.hydration - 1); 
        }
      });
      turnLogs.push("Drought replicated.");
    }

    // 3. Economy Sustain & Deficit Damage
    const projectedEcon = calculateEconomy(nextGrid);
    if (projectedEcon.sustain > projectedEcon.prod) {
      let deficit = projectedEcon.sustain - projectedEcon.prod;
      turnLogs.push(`Deficit of ${deficit} Life! Structures strained.`);
      const activeBuildings = Object.values(nextGrid).filter(h => h.building && h.building !== 'core');
      for (let i=0; i<deficit; i++) {
        if(activeBuildings.length > 0) activeBuildings[Math.floor(Math.random() * activeBuildings.length)].stress += 1;
      }
    }

    // 4. Stress Assessment & Maturity Calculation
    let coreDied = false;
    Object.values(nextGrid).forEach(hex => {
      // Forest
      if (hex.terrain === 'forest') {
        if (hex.hydration <= 0) hex.terrainStress += 1;
        if (hex.terrainStress >= 3) {
           hex.terrain = 'neutral';
           turnLogs.push(`Forest at ${hex.q},${hex.r} withered.`);
        }
      }

      if (!hex.building) return;
      let gotStressThisTurn = false;

      if (hex.building === 'bloom') {
        if (hex.hydration <= -2) { hex.stress += 2; gotStressThisTurn = true; }
        else if (hex.hydration === -1) { hex.stress += 1; gotStressThisTurn = true; }
      }
      if (hex.building === 'condenser' && hex.hydration <= -2) {
        hex.stress += 1; gotStressThisTurn = true;
      }

      if (hex.stress >= 3) {
        if (hex.building === 'core') coreDied = true;
        turnLogs.push(`${hex.building} at ${hex.q},${hex.r} collapsed!`);
        hex.building = null;
        hex.stress = 0;
        hex.buildingUpgrade = null;
      }

      // Calculate Maturity
      if (hex.building === 'core') {
         newMaturity += 1;
         if (hex.buildingUpgrade === 'maturity') newMaturity += 1;
      }
      if (hex.building === 'bloom' && hex.hydration >= 0 && !gotStressThisTurn) {
         newMaturity += 1;
         if (hex.buildingUpgrade === 'scoring' && hex.hydration === 3) newMaturity += 1;
      }
    });

    setGrid(nextGrid);
    setMaturity(newMaturity);
    setSeason(s => s + 1);
    setActionsLeft(3);
    setSpentLife(0);
    setBaseEcon(calculateEconomy(nextGrid)); // Lock in the new economy for the turn
    
    if (turnLogs.length > 0) setLogs(prev => [...turnLogs, ...prev].slice(0, 8));

    // Win/Loss Validation
    if (coreDied) setGameOver('lose');
    else if (newMaturity >= 100 || season >= 25) {
       if (newMaturity >= 100) setGameOver('win');
       else setGameOver('lose');
    }
  };

  // -- UI RENDERERS --
  const renderActionPanel = () => {
    if (!selectedHexKey) return <div className="text-sm text-gray-500 italic p-2">Select a hex to view valid actions.</div>;
    
    const hex = grid[selectedHexKey];
    const neighbors = getNeighbors(hex.q, hex.r).map(n => grid[`${n.q},${n.r}`]).filter(Boolean);
    const isAdjacentToColony = neighbors.some(n => n.building !== null);
    
    if (hex.building === null) {
      return (
        <div className="flex flex-col gap-2">
          <button 
            className="p-2 border rounded flex items-center gap-2 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:bg-gray-100"
            onClick={() => handleBuild('bloom')}
            disabled={actionsLeft < 1 || availableLife < 1 || hex.terrain !== 'neutral' || !isAdjacentToColony || hex.hydration < 0}
          >
            <div className="w-4 h-4 rounded-full bg-green-500 shrink-0"></div>
            <div className="text-left flex-grow">
              <div className="font-bold text-sm text-gray-900">Grow Bloom</div>
              <div className="text-xs text-gray-500">1 Act, 1 Life | Req: Neutral, Adj, H≥0</div>
            </div>
          </button>
          <button 
            className="p-2 border rounded flex items-center gap-2 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:bg-gray-100"
            onClick={() => handleBuild('condenser')}
            disabled={actionsLeft < 1 || availableLife < 1 || hex.terrain !== 'neutral' || !isAdjacentToColony}
          >
            <div className="w-4 h-4 bg-gray-300 shrink-0"></div>
            <div className="text-left flex-grow">
              <div className="font-bold text-sm text-gray-900">Grow Condenser</div>
              <div className="text-xs text-gray-500">1 Act, 1 Life | Req: Neutral, Adj</div>
            </div>
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2">
        <button 
          className="p-2 border rounded flex items-center gap-2 transition-colors hover:bg-orange-50 border-orange-200 disabled:opacity-50 disabled:bg-gray-100"
          onClick={handleRepair}
          disabled={actionsLeft < 1 || hex.stress === 0 || hex.building === 'core'}
        >
          <ShieldAlert size={16} className="text-orange-500 shrink-0" />
          <div className="text-left flex-grow">
            <div className="font-bold text-sm text-gray-900">Repair</div>
            <div className="text-xs text-gray-500">1 Act, 0 Life | Removes 1 Stress</div>
          </div>
        </button>

        {!hex.buildingUpgrade && hex.building === 'condenser' && (
          <>
            <button className="p-2 border rounded border-blue-200 bg-blue-50/50 hover:bg-blue-100 disabled:opacity-50 text-left" onClick={() => handleUpgrade('heavy', 2)} disabled={actionsLeft < 1 || availableLife < 2}>
              <div className="font-bold text-sm text-blue-900 flex items-center gap-1"><ArrowUpCircle size={14}/> Heavy Condenser</div>
              <div className="text-xs text-blue-700">1 Act, 2 Life | Pushes +2H per season</div>
            </button>
            <button className="p-2 border rounded border-blue-200 bg-blue-50/50 hover:bg-blue-100 disabled:opacity-50 text-left" onClick={() => handleUpgrade('geyser', 2)} disabled={actionsLeft < 1 || availableLife < 2}>
              <div className="font-bold text-sm text-blue-900 flex items-center gap-1"><ArrowUpCircle size={14}/> Geyser Condenser</div>
              <div className="text-xs text-blue-700">1 Act, 2 Life | Instant +3H locally</div>
            </button>
          </>
        )}

        {!hex.buildingUpgrade && hex.building === 'bloom' && (
          <>
            <button className="p-2 border rounded border-green-200 bg-green-50/50 hover:bg-green-100 disabled:opacity-50 text-left" onClick={() => handleUpgrade('resilient', 3)} disabled={actionsLeft < 1 || availableLife < 3}>
              <div className="font-bold text-sm text-green-900 flex items-center gap-1"><ArrowUpCircle size={14}/> Resilient Bloom</div>
              <div className="text-xs text-green-700">1 Act, 3 Life | +1 Life if H≥0</div>
            </button>
            <button className="p-2 border rounded border-green-200 bg-green-50/50 hover:bg-green-100 disabled:opacity-50 text-left" onClick={() => handleUpgrade('scoring', 3)} disabled={actionsLeft < 1 || availableLife < 3}>
              <div className="font-bold text-sm text-green-900 flex items-center gap-1"><ArrowUpCircle size={14}/> Scoring Bloom</div>
              <div className="text-xs text-green-700">1 Act, 3 Life | +1 Mat if H=3</div>
            </button>
          </>
        )}

        {!hex.buildingUpgrade && hex.building === 'core' && (
          <>
            <button className="p-2 border rounded border-yellow-200 bg-yellow-50/50 hover:bg-yellow-100 disabled:opacity-50 text-left" onClick={() => handleUpgrade('life', 4)} disabled={actionsLeft < 1 || availableLife < 4}>
              <div className="font-bold text-sm text-yellow-900 flex items-center gap-1"><ArrowUpCircle size={14}/> Deep Roots</div>
              <div className="text-xs text-yellow-800">1 Act, 4 Life | Core produces +5 Life</div>
            </button>
            <button className="p-2 border rounded border-yellow-200 bg-yellow-50/50 hover:bg-yellow-100 disabled:opacity-50 text-left" onClick={() => handleUpgrade('maturity', 4)} disabled={actionsLeft < 1 || availableLife < 4}>
              <div className="font-bold text-sm text-yellow-900 flex items-center gap-1"><ArrowUpCircle size={14}/> Neural Core</div>
              <div className="text-xs text-yellow-800">1 Act, 4 Life | Core produces +2 Maturity</div>
            </button>
          </>
        )}
      </div>
    );
  };

  const getHexColor = (terrain, hydration) => {
    if (terrain === 'rock') return '#4a5568'; 
    if (terrain === 'forest') return '#2f855a'; 
    const colors = {
      '-3': '#742a2a', '-2': '#9b2c2c', '-1': '#e53e3e',
      '0': '#718096',  
      '1': '#63b3ed',  '2': '#4299e1',  '3': '#2b6cb0',
    };
    return colors[hydration] || '#718096';
  };

  const renderHexagons = () => {
    return Object.values(grid).map(hex => {
      const x = HEX_SIZE * Math.sqrt(3) * (hex.q + hex.r / 2);
      const y = HEX_SIZE * 3/2 * hex.r;
      const isSelected = selectedHexKey === `${hex.q},${hex.r}`;

      const points = [];
      for (let i = 0; i < 6; i++) {
        const angle = 2 * Math.PI / 6 * (i - 0.5);
        points.push(`${x + HEX_SIZE * Math.cos(angle)},${y + HEX_SIZE * Math.sin(angle)}`);
      }

      return (
        <g key={`${hex.q},${hex.r}`} onClick={() => setSelectedHexKey(`${hex.q},${hex.r}`)} className="cursor-pointer transition-transform hover:opacity-80">
          <polygon 
            points={points.join(' ')} 
            fill={getHexColor(hex.terrain, hex.hydration)}
            stroke={isSelected ? '#fbbf24' : '#1a202c'}
            strokeWidth={isSelected ? 3 : 1}
          />
          {/* Elements */}
          {hex.terrain === 'rock' && <circle cx={x} cy={y} r={HEX_SIZE*0.5} fill="#2d3748" />}
          {hex.terrain === 'forest' && <path d={`M${x},${y-8} L${x-6},${y+4} L${x+6},${y+4} Z`} fill="#1c4532"/>}

          {/* Buildings */}
          {hex.building === 'core' && (
             <g>
               <circle cx={x} cy={y} r={HEX_SIZE * 0.4} fill="#ecc94b" />
               {hex.buildingUpgrade && <circle cx={x} cy={y} r={HEX_SIZE * 0.2} fill="#744210" />}
             </g>
          )}
          {hex.building === 'bloom' && (
             <g>
               <circle cx={x} cy={y} r={HEX_SIZE * 0.4} fill="#48bb78" />
               {hex.buildingUpgrade === 'resilient' && <circle cx={x} cy={y} r={HEX_SIZE * 0.2} fill="#22543d" />}
               {hex.buildingUpgrade === 'scoring' && <circle cx={x} cy={y} r={HEX_SIZE * 0.2} fill="#9ae6b4" />}
             </g>
          )}
          {hex.building === 'condenser' && (
             <g>
               <rect x={x - HEX_SIZE*0.3} y={y - HEX_SIZE*0.3} width={HEX_SIZE*0.6} height={HEX_SIZE*0.6} fill="#e2e8f0" />
               {hex.buildingUpgrade === 'heavy' && <rect x={x - HEX_SIZE*0.15} y={y - HEX_SIZE*0.15} width={HEX_SIZE*0.3} height={HEX_SIZE*0.3} fill="#4a5568" />}
               {hex.buildingUpgrade === 'geyser' && <circle cx={x} cy={y} r={HEX_SIZE * 0.2} fill="#2b6cb0" />}
             </g>
          )}
          
          {/* Stress Indicators */}
          {(hex.stress > 0 || hex.terrainStress > 0) && (
            <text x={x} y={y + 4} textAnchor="middle" fontSize="12" fill="#fff" fontWeight="bold" stroke="#000" strokeWidth="1">
              {'!'.repeat(Math.max(hex.stress, hex.terrainStress))}
            </text>
          )}
        </g>
      );
    });
  };

  const selectedHex = selectedHexKey ? grid[selectedHexKey] : null;

  return (
    <div className="flex flex-col md:flex-row w-full max-w-6xl mx-auto h-screen p-4 gap-4 font-sans bg-gray-50 text-gray-900">
      <div className="w-full md:w-80 flex flex-col gap-4">
        
        {/* TOP STATUS PANEL */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <h1 className="text-2xl font-bold mb-4 tracking-tight">Alien Hex Colony</h1>
          
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-gray-100 p-2 rounded text-center">
              <span className="text-xs uppercase font-bold text-gray-500">Season</span>
              <div className="text-xl font-bold">{season} / 25</div>
              <div className="text-[9px] font-bold uppercase flex flex-col mt-1 gap-1">
                <span className={season % 2 === 0 ? "text-red-600" : "text-gray-400"}>Drought {season % 2 === 0 ? 'Active' : 'Wait'}</span>
                <span className={season > 1 && season % 2 !== 0 ? "text-blue-600" : "text-gray-400"}>Wind {season > 1 && season % 2 !== 0 ? 'Shift' : 'Wait'}</span>
              </div>
            </div>
            <div className="bg-green-100 p-2 rounded text-center">
              <span className="text-xs uppercase font-bold text-green-700">Maturity</span>
              <div className="text-2xl font-bold text-green-800 pt-2">{maturity} / 100</div>
            </div>
            <div className="bg-blue-100 p-2 rounded text-center flex items-center justify-center flex-col relative overflow-hidden">
              <span className="text-xs uppercase font-bold text-blue-700">Wind Vector</span>
              <div className="text-lg font-bold text-blue-800 flex items-center gap-1 z-10 pt-1">
                <Wind size={16} /> {DIRECTIONS[windDir].name}
              </div>
            </div>
            <div className="bg-purple-100 p-2 rounded text-center">
              <span className="text-xs uppercase font-bold text-purple-700">Actions Left</span>
              <div className="text-2xl font-bold text-purple-800 pt-2">{actionsLeft} / 3</div>
            </div>
          </div>

          {/* ECONOMY UI */}
          <div className="mb-4 bg-slate-800 text-white rounded-lg p-3">
             <div className="text-xs uppercase font-bold text-slate-400 mb-2 tracking-wider flex justify-between">
                <span>Economy (Next Turn)</span>
             </div>
             <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Produced:</span>
                  <div className="font-bold text-green-400">
                     {baseEcon.prod}
                     {prodDelta !== 0 && <span className={`text-[10px] ml-1 ${prodDelta > 0 ? 'text-green-300' : 'text-red-400'}`}>({prodDelta > 0 ? '+' : ''}{prodDelta})</span>}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Allocated:</span>
                  <div className="font-bold text-orange-400">
                     {baseEcon.sustain}
                     {sustainDelta !== 0 && <span className={`text-[10px] ml-1 ${sustainDelta > 0 ? 'text-red-300' : 'text-green-400'}`}>({sustainDelta > 0 ? '+' : ''}{sustainDelta})</span>}
                  </div>
                </div>
                <div className="flex justify-between border-t border-slate-600 pt-1 mt-1 col-span-2">
                  <span className="text-slate-300 font-bold">Current Available Life:</span>
                  <span className="font-bold text-blue-400 text-lg">{availableLife}</span>
                </div>
             </div>
          </div>

          <button 
            className="w-full py-3 bg-gray-900 text-white rounded-lg font-bold hover:bg-gray-800 disabled:opacity-50 transition-colors"
            onClick={endSeason} disabled={!!gameOver}
          >
            End Season
          </button>
        </div>

        {/* CONTEXTUAL ACTION PANEL */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex-grow flex flex-col">
          <h2 className="text-lg font-bold mb-3 border-b pb-2">Target Actions</h2>
          <div className="flex-grow">
            {renderActionPanel()}
          </div>

          <div className="mt-4 pt-4 border-t">
            <h3 className="text-sm font-bold mb-2 flex items-center gap-1 text-gray-500"><Info size={14}/> Event Logs</h3>
            <div className="text-xs font-mono bg-gray-100 p-2 rounded h-24 overflow-y-auto flex flex-col gap-1 shadow-inner">
              {logs.map((log, i) => (
                <div key={i} className={i === 0 ? 'text-gray-900 font-bold' : 'text-gray-500'}>{log}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-grow bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative flex flex-col">
        {gameOver && (
          <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center">
            <h2 className={`text-4xl font-black mb-2 ${gameOver === 'win' ? 'text-green-600' : 'text-red-600'}`}>
              {gameOver === 'win' ? 'VICTORY' : 'COLLAPSE'}
            </h2>
            <p className="text-xl mb-6">Maturity: {maturity} / 100</p>
            <button 
              className="px-6 py-3 bg-gray-900 text-white font-bold rounded-lg hover:bg-gray-700 flex items-center gap-2"
              onClick={() => window.location.reload()}
            >
              <RefreshCcw size={18} /> Restart Mission
            </button>
          </div>
        )}
        
        <div className="flex-grow flex items-center justify-center overflow-auto p-4 bg-slate-100/50">
          <svg viewBox="-250 -200 500 400" className="w-full h-full min-w-[400px]">
             {renderHexagons()}
          </svg>
        </div>

        <div className="h-16 bg-gray-900 text-white flex items-center justify-between px-6 shrink-0 shadow-lg z-10">
          {selectedHex ? (
            <>
              <div className="flex items-center gap-4">
                <div className="font-mono text-sm bg-gray-800 px-2 py-1 rounded">[{selectedHex.q}, {selectedHex.r}]</div>
                <div className="text-sm uppercase tracking-widest text-gray-400 font-bold">{selectedHex.terrain}</div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-1" title="Hydration">
                  <Droplets size={16} className={selectedHex.hydration > 0 ? "text-blue-400" : selectedHex.hydration < 0 ? "text-red-400" : "text-gray-400"} />
                  <span className="font-bold">{selectedHex.hydration > 0 ? '+' : ''}{selectedHex.hydration}</span>
                </div>
                <div className="flex items-center gap-1" title="Building">
                  <span className="font-bold capitalize text-gray-300">
                    {selectedHex.building ? `${selectedHex.buildingUpgrade ? selectedHex.buildingUpgrade + ' ' : ''}${selectedHex.building}` : 'None'}
                  </span>
                </div>
                <div className="flex items-center gap-1" title="Stress">
                  <Flame size={16} className={(selectedHex.stress > 0 || selectedHex.terrainStress > 0) ? "text-orange-500" : "text-gray-600"} />
                  <span className="font-bold">{Math.max(selectedHex.stress, selectedHex.terrainStress)}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="text-gray-400 text-sm italic">Click any tile to inspect environment and issue commands.</div>
          )}
        </div>
      </div>
    </div>
  );
}