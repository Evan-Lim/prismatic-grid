import React, { useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts';
import {
  LayoutGrid, Zap, Folder, Laptop, Sparkles, Maximize2,
  ArrowUpRight, Droplet, Leaf, AlertTriangle, Calendar, Send, X
} from 'lucide-react';
import './App.css';

const API_BASE = 'http://127.0.0.1:8000';
const WS_URL = 'ws://127.0.0.1:8000/ws/live';

// Built-in fallback buildings so the 3D scene works immediately even without backend
const DEFAULT_BUILDINGS = [
  { id: 'terrace_a', name: 'Elmina Green Terrace Zone A', type: 'terrace', floors: 2, current_kw: 12.4, baseline_kw: 12.0, current_water_lph: 185 },
  { id: 'condo_b', name: 'Serenia Sky Residence (Block B)', type: 'condo', floors: 12, current_kw: 88.5, baseline_kw: 85.0, current_water_lph: 1490 },
  { id: 'commercial_c', name: 'Bukit Raja Commercial Hub (Block C)', type: 'commercial', floors: 4, current_kw: 142.0, baseline_kw: 140.0, current_water_lph: 960 },
  { id: 'common_d', name: 'Township Community Clubhouse & Park', type: 'common', floors: 2, current_kw: 36.2, baseline_kw: 35.0, current_water_lph: 410 },
  { id: 'ev_station_e', name: 'SDP Fast EV Charging Hub', type: 'ev', floors: 1, current_kw: 52.0, baseline_kw: 50.0, current_water_lph: 22 }
];

// Default waveform matching the preview image sparklines
const INITIAL_WAVE = [
  { t: '01:00', kw: 1.8, water: 41, co2: 1.3, baseline_kw: 145, optimized_kw: 112 },
  { t: '03:00', kw: 1.9, water: 43, co2: 1.4, baseline_kw: 138, optimized_kw: 108 },
  { t: '05:00', kw: 1.85, water: 42, co2: 1.35, baseline_kw: 140, optimized_kw: 110 },
  { t: '07:00', kw: 2.2, water: 46, co2: 1.6, baseline_kw: 165, optimized_kw: 125 },
  { t: '09:00', kw: 2.35, water: 47, co2: 1.75, baseline_kw: 190, optimized_kw: 130 },
  { t: '11:00', kw: 2.1, water: 44, co2: 1.5, baseline_kw: 210, optimized_kw: 128 },
  { t: '13:00', kw: 2.3, water: 46.5, co2: 1.65, baseline_kw: 230, optimized_kw: 135 },
  { t: '15:00', kw: 2.65, water: 51, co2: 1.95, baseline_kw: 225, optimized_kw: 140 },
  { t: '17:00', kw: 2.75, water: 52, co2: 2.05, baseline_kw: 215, optimized_kw: 148 },
  { t: '19:00', kw: 2.4, water: 48, co2: 1.75, baseline_kw: 195, optimized_kw: 142 },
  { t: '21:00', kw: 2.55, water: 49.5, co2: 1.88, baseline_kw: 180, optimized_kw: 136 },
  { t: '23:00', kw: 2.4, water: 48.7, co2: 1.8, baseline_kw: 160, optimized_kw: 122 }
];

/* ============================================================================
   3D ARCHITECTURAL SCENE COMPONENTS (Matching Preview Prismatic.jpg)
   ============================================================================ */

function GlowingSolarPanel({ position, rotation = [-0.35, 0, 0], size = [2.2, 0.08, 1.4], color = '#00f5d4' }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={2.1}
          roughness={0.15}
          metalness={0.8}
        />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(...size)]} />
        <lineBasicMaterial color="#042f2e" />
      </lineSegments>
    </group>
  );
}

function Tree({ position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.08, 0.12, 0.6, 8]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <mesh position={[0, 0.85, 0]}>
        <sphereGeometry args={[0.48, 12, 12]} />
        <meshStandardMaterial color="#112229" roughness={0.85} />
      </mesh>
      <mesh position={[0.2, 0.7, 0.15]}>
        <sphereGeometry args={[0.35, 10, 10]} />
        <meshStandardMaterial color="#152c35" roughness={0.85} />
      </mesh>
    </group>
  );
}

function MiniCar({ position, rotation = [0, 0, 0], glowing = false }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[0.85, 0.25, 0.46]} />
        <meshStandardMaterial color="#27323f" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[-0.05, 0.34, 0]}>
        <boxGeometry args={[0.48, 0.2, 0.4]} />
        <meshStandardMaterial
          color={glowing ? '#00f5d4' : '#334155'}
          emissive={glowing ? '#00f5d4' : '#000000'}
          emissiveIntensity={glowing ? 0.5 : 0}
        />
      </mesh>
    </group>
  );
}

function PowerLineCurve({ start, end, sag = 0.45 }) {
  const geometry = useMemo(() => {
    const mid = [
      (start[0] + end[0]) / 2,
      Math.min(start[1], end[1]) - sag,
      (start[2] + end[2]) / 2
    ];
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(...start),
      new THREE.Vector3(...mid),
      new THREE.Vector3(...end)
    );
    return new THREE.BufferGeometry().setFromPoints(curve.getPoints(20));
  }, [start, end, sag]);

  return (
    <line geometry={geometry}>
      <lineBasicMaterial color="#00f5d4" transparent opacity={0.38} />
    </line>
  );
}

// 1. Center High-Rise Tower (Serenia Sky Residence - Condo Block B)
function HighRiseCondo({ position, isSelected, hasAlert, onSelect, building }) {
  const glowColor = hasAlert ? '#ff4d6d' : '#00f5d4';

  return (
    <group
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onSelect('condo_b');
      }}
    >
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[6.4, 0.24, 6.4]} />
        <meshStandardMaterial color={isSelected ? '#133b42' : '#181e26'} roughness={0.8} />
      </mesh>

      <mesh position={[0, 4.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.2, 8.2, 4.2]} />
        <meshStandardMaterial color="#2c3540" roughness={0.55} metalness={0.2} />
      </mesh>

      {[-1.5, 1.5].map((xPos, i) => (
        <mesh key={i} position={[xPos, 4.2, 2.12]} castShadow>
          <boxGeometry args={[0.85, 8.0, 0.22]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
      ))}

      {[1.2, 2.3, 3.4, 4.5, 5.6, 6.7, 7.6].map((y, rIdx) =>
        [-1.3, -0.45, 0.45, 1.3].map((x, cIdx) => {
          const isLit = (rIdx + cIdx) % 3 === 0 || rIdx === 0;
          return (
            <group key={`${rIdx}-${cIdx}`}>
              <mesh position={[x, y, 2.13]}>
                <boxGeometry args={[0.38, 0.55, 0.04]} />
                <meshStandardMaterial
                  color={isLit ? glowColor : '#111827'}
                  emissive={isLit ? glowColor : '#000000'}
                  emissiveIntensity={isLit ? 1.8 : 0}
                />
              </mesh>
              <mesh position={[-2.12, y, x]}>
                <boxGeometry args={[0.04, 0.55, 0.38]} />
                <meshStandardMaterial
                  color={isLit ? glowColor : '#111827'}
                  emissive={isLit ? glowColor : '#000000'}
                  emissiveIntensity={isLit ? 1.6 : 0}
                />
              </mesh>
            </group>
          );
        })
      )}

      <mesh position={[-1.4, 0.85, 2.14]}>
        <boxGeometry args={[0.9, 1.4, 0.06]} />
        <meshStandardMaterial color={glowColor} emissive={glowColor} emissiveIntensity={2.4} />
      </mesh>

      <mesh position={[0.9, 8.55, 0.8]}>
        <boxGeometry args={[0.95, 0.55, 0.95]} />
        <meshStandardMaterial color="#10b981" roughness={0.4} />
      </mesh>

      <GlowingSolarPanel position={[-0.9, 8.7, -1.1]} size={[1.8, 0.08, 1.1]} color={glowColor} />
      <GlowingSolarPanel position={[-0.9, 8.7, 0.1]} size={[1.8, 0.08, 1.1]} color={glowColor} />
      <GlowingSolarPanel position={[-0.9, 8.7, 1.3]} size={[1.8, 0.08, 1.1]} color={glowColor} />

      <Tree position={[-2.5, 0.2, 2.4]} scale={0.85} />
      <Tree position={[2.5, 0.2, 2.2]} scale={0.75} />

      {isSelected && (
        <Html position={[0, 10.2, 0]} center distanceFactor={28}>
          <div style={{
            background: 'rgba(6, 22, 27, 0.92)',
            border: '1px solid #00f5d4',
            padding: '4px 10px',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '11px',
            whiteSpace: 'nowrap',
            boxShadow: '0 0 12px rgba(0,245,212,0.4)'
          }}>
            {building?.name || 'Zone B'}: <strong>{building?.current_kw || 88.5} kW</strong>
          </div>
        </Html>
      )}
    </group>
  );
}

// 2. Left Pitched-Roof Terrace Houses (Elmina Green Terrace Zone A)
function TerraceHouseCluster({ position, isSelected, onSelect }) {
  return (
    <group
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onSelect('terrace_a');
      }}
    >
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[6.4, 0.24, 6.4]} />
        <meshStandardMaterial color={isSelected ? '#133b42' : '#181e26'} roughness={0.8} />
      </mesh>

      <group position={[0.4, 0.24, -0.4]}>
        <mesh position={[0, 1.1, 0]} castShadow>
          <boxGeometry args={[3.1, 2.2, 2.6]} />
          <meshStandardMaterial color="#2a333e" />
        </mesh>
        <mesh position={[0, 2.65, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[2.45, 1.3, 4]} />
          <meshStandardMaterial color="#1e252e" />
        </mesh>
        <GlowingSolarPanel
          position={[0, 2.72, 0.68]}
          rotation={[0.58, 0, 0]}
          size={[2.3, 0.07, 1.25]}
        />
        {[-0.8, 0.8].map((x, idx) => (
          <mesh key={idx} position={[x, 1.3, 1.32]}>
            <boxGeometry args={[0.55, 0.65, 0.04]} />
            <meshStandardMaterial color="#00f5d4" emissive="#00f5d4" emissiveIntensity={2.0} />
          </mesh>
        ))}
      </group>

      <group position={[-1.4, 0.24, 1.1]}>
        <mesh position={[0, 0.75, 0]} castShadow>
          <boxGeometry args={[2.1, 1.5, 2.0]} />
          <meshStandardMaterial color="#252e38" />
        </mesh>
        <GlowingSolarPanel
          position={[0, 1.65, 0.3]}
          rotation={[0.4, 0, 0]}
          size={[1.6, 0.06, 0.95]}
        />
      </group>

      <MiniCar position={[0.3, 0.24, 2.1]} rotation={[0, 0.2, 0]} />
      <Tree position={[-2.2, 0.24, -1.8]} scale={1.1} />
      <Tree position={[-2.4, 0.24, -0.5]} scale={0.85} />
    </group>
  );
}

// 3. Front-Center Community & Medical Hub (Clubhouse / Zone D)
function CommunityHub({ position, isSelected, onSelect }) {
  return (
    <group
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onSelect('common_d');
      }}
    >
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[6.4, 0.24, 6.4]} />
        <meshStandardMaterial color={isSelected ? '#133b42' : '#181e26'} roughness={0.8} />
      </mesh>

      <mesh position={[-0.7, 2.4, -0.3]} castShadow>
        <boxGeometry args={[3.0, 4.4, 3.0]} />
        <meshStandardMaterial color="#2d3642" />
      </mesh>

      <group position={[-0.7, 2.7, 1.22]}>
        <mesh>
          <boxGeometry args={[0.35, 1.1, 0.08]} />
          <meshStandardMaterial color="#3e4a59" />
        </mesh>
        <mesh>
          <boxGeometry args={[1.1, 0.35, 0.08]} />
          <meshStandardMaterial color="#3e4a59" />
        </mesh>
      </group>

      <mesh position={[1.35, 1.45, 0.5]} castShadow>
        <boxGeometry args={[2.5, 2.5, 3.2]} />
        <meshStandardMaterial color="#262f3a" />
      </mesh>

      <mesh position={[1.3, 2.9, 0.4]}>
        <boxGeometry args={[0.9, 0.45, 0.7]} />
        <meshStandardMaterial color="#10b981" />
      </mesh>

      {[1.1, 2.0].map((y, r) =>
        [0.5, 1.05, 1.6, 2.15].map((x, c) => (
          <mesh key={`${r}-${c}`} position={[x, y, 2.12]}>
            <boxGeometry args={[0.28, 0.55, 0.04]} />
            <meshStandardMaterial color="#00f5d4" emissive="#00f5d4" emissiveIntensity={2.0} />
          </mesh>
        ))
      )}

      {[1.2, 2.4, 3.6].map((y, idx) => (
        <mesh key={idx} position={[-2.22, y, -0.3]}>
          <boxGeometry args={[0.05, 0.55, 0.9]} />
          <meshStandardMaterial color="#00f5d4" emissive="#00f5d4" emissiveIntensity={2.2} />
        </mesh>
      ))}
    </group>
  );
}

// 4. Right Solar Canopy EV Charging Hub (SDP Fast EV Charging Hub)
function EVChargingHub({ position, isSelected, onSelect }) {
  return (
    <group
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onSelect('ev_station_e');
      }}
    >
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[7.2, 0.24, 6.8]} />
        <meshStandardMaterial color={isSelected ? '#133b42' : '#181e26'} roughness={0.8} />
      </mesh>

      <GlowingSolarPanel
        position={[-0.6, 2.35, 0.4]}
        rotation={[0.12, 0, -0.15]}
        size={[4.4, 0.1, 3.6]}
      />

      {[
        [-2.4, 1.2, -1.1],
        [1.2, 1.2, -1.1],
        [-2.4, 1.2, 1.9],
        [1.2, 1.2, 1.9]
      ].map((pos, idx) => (
        <mesh key={idx} position={pos}>
          <cylinderGeometry args={[0.08, 0.08, 2.2, 8]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      ))}

      <GlowingSolarPanel
        position={[2.2, 1.95, -1.1]}
        rotation={[0.15, 0, -0.15]}
        size={[1.8, 0.08, 2.8]}
      />

      {[-1.6, -0.5, 0.6].map((x, idx) => (
        <group key={idx}>
          <MiniCar position={[x, 0.24, 0.9]} rotation={[0, Math.PI / 2, 0]} glowing />
          <mesh position={[x, 0.55, -0.2]}>
            <boxGeometry args={[0.22, 0.65, 0.18]} />
            <meshStandardMaterial color="#00f5d4" emissive="#00f5d4" emissiveIntensity={1.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// 5. Top-Right Commercial Hub (Bukit Raja Commercial Hub Block C)
function CommercialHub({ position, isSelected, onSelect }) {
  return (
    <group
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onSelect('commercial_c');
      }}
    >
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[6.8, 0.24, 5.4]} />
        <meshStandardMaterial color={isSelected ? '#133b42' : '#181e26'} roughness={0.8} />
      </mesh>

      <mesh position={[-0.8, 1.35, 0]} castShadow>
        <boxGeometry args={[3.5, 2.3, 3.2]} />
        <meshStandardMaterial color="#2b3440" />
      </mesh>

      <mesh position={[1.8, 1.15, -0.2]} castShadow>
        <boxGeometry args={[2.2, 1.9, 2.8]} />
        <meshStandardMaterial color="#232b35" />
      </mesh>

      <mesh position={[-0.8, 0.7, 1.62]}>
        <boxGeometry args={[3.2, 0.08, 0.04]} />
        <meshStandardMaterial color="#00f5d4" emissive="#00f5d4" emissiveIntensity={1.8} />
      </mesh>
    </group>
  );
}

// Full Isometric Township 3D Scene
function TownshipIsometricScene({ buildings, selectedId, onSelect }) {
  const getBuilding = (id) => buildings.find((b) => b.id === id);

  return (
    <group position={[0.8, -1.2, 0]} rotation={[0, -Math.PI / 4.2, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#070a0f" roughness={0.9} metalness={0.1} />
      </mesh>

      <gridHelper args={[90, 18, '#172530', '#111922']} position={[0, 0.01, 0]} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 3.8]}>
        <planeGeometry args={[26, 1.5]} />
        <meshStandardMaterial color="#0d131a" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3.8, 0.02, 0]}>
        <planeGeometry args={[1.5, 26]} />
        <meshStandardMaterial color="#0d131a" />
      </mesh>

      <HighRiseCondo
        position={[0, 0, 0]}
        isSelected={selectedId === 'condo_b'}
        hasAlert={false}
        onSelect={onSelect}
        building={getBuilding('condo_b')}
      />

      <TerraceHouseCluster
        position={[-7.6, 0, 0.6]}
        isSelected={selectedId === 'terrace_a'}
        onSelect={onSelect}
      />

      <CommunityHub
        position={[-0.2, 0, 7.6]}
        isSelected={selectedId === 'common_d'}
        onSelect={onSelect}
      />

      <EVChargingHub
        position={[7.6, 0, 6.8]}
        isSelected={selectedId === 'ev_station_e'}
        onSelect={onSelect}
      />

      <CommercialHub
        position={[7.6, 0, -0.6]}
        isSelected={selectedId === 'commercial_c'}
        onSelect={onSelect}
      />

      <group position={[6.5, 0, 13.5]}>
        <GlowingSolarPanel position={[0, 1.1, 0]} rotation={[0.2, 0, -0.15]} size={[3.6, 0.08, 2.2]} />
      </group>

      <PowerLineCurve start={[-10.2, 1.8, 3.2]} end={[-4.8, 1.8, 3.2]} />
      <PowerLineCurve start={[4.4, 2.2, 1.8]} end={[10.5, 2.2, 1.8]} />
    </group>
  );
}

/* ============================================================================
   MAIN PRISMATIC DASHBOARD COMPONENT
   ============================================================================ */

export default function App() {
  const [activeTab, setActiveTab] = useState('home'); // 'home' | 'simulate' | 'forecast' | 'anomalies'
  const [buildings, setBuildings] = useState(DEFAULT_BUILDINGS);
  const [selectedId, setSelectedId] = useState('condo_b');
  const [sparkData, setSparkData] = useState(INITIAL_WAVE);
  const [forecast, setForecast] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [wsConnected, setWsConnected] = useState(true);

  // What-If Scenario Simulator State (with default offline values)
  const [scenarioType, setScenarioType] = useState('add_solar');
  const [solarKw, setSolarKw] = useState(50);
  const [evShiftPct, setEvShiftPct] = useState(60);
  const [scenarioResult, setScenarioResult] = useState({
    monthly_cost_savings_rm: 3120.5,
    daily_carbon_saved_kg: 120.4,
    peak_reduction_pct: 24.5,
    comparison_series: INITIAL_WAVE.map((d) => ({
      time: d.t,
      baseline_kw: d.baseline_kw,
      optimized_kw: d.optimized_kw
    }))
  });

  // AI Assistant State
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);

  // 1. Connect to Backend REST + WebSocket (with smooth standalone fallback)
  useEffect(() => {
    fetch(`${API_BASE}/api/buildings`)
      .then((r) => r.json())
      .then((d) => {
        if (d.buildings && d.buildings.length > 0) setBuildings(d.buildings);
      })
      .catch(() => {});

    fetch(`${API_BASE}/api/anomalies`)
      .then((r) => r.json())
      .then((d) => {
        if (d.anomalies) setAnomalies(d.anomalies);
      })
      .catch(() => {});

    let ws;
    try {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => setWsConnected(true);
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'LIVE_TICK' && msg.buildings) {
          setBuildings((prev) =>
            prev.map((b) => {
              const live = msg.buildings.find((x) => x.building_id === b.id);
              return live ? { ...b, ...live } : b;
            })
          );

          const sumKw = msg.buildings.reduce((acc, b) => acc + (b.current_kw || 0), 0);
          const sumWater = msg.buildings.reduce((acc, b) => acc + (b.current_water_lph || 0), 0);
          const mw = +(sumKw / 135).toFixed(2);
          const m3h = +(sumWater / 62).toFixed(1);
          const tco2 = +(mw * 0.75).toFixed(2);

          setSparkData((prev) => [
            ...prev.slice(1),
            {
              t: new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }),
              kw: mw,
              water: m3h,
              co2: tco2,
              baseline_kw: sumKw,
              optimized_kw: +(sumKw * 0.78).toFixed(1)
            }
          ]);
        }
      };
    } catch (e) {
      // Standalone frontend mode
    }
    return () => ws && ws.close();
  }, []);

  // 2. Load Selected Building Forecast
  useEffect(() => {
    if (!selectedId) return;
    fetch(`${API_BASE}/api/forecast/${selectedId}?horizon_hours=24&resource=energy`)
      .then((r) => r.json())
      .then((d) => setForecast(d.forecast || []))
      .catch(() => {});
  }, [selectedId]);

  // 3. Run What-If Scenario Simulator (Backend + Offline Calculator Fallback)
  useEffect(() => {
    fetch(`${API_BASE}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        building_id: selectedId,
        scenario_type: scenarioType,
        capacity_kw: Number(solarKw),
        panel_area_m2: Number(solarKw) * 5,
        shift_percentage: Number(evShiftPct)
      })
    })
      .then((r) => r.json())
      .then((d) => setScenarioResult(d))
      .catch(() => {
        // Offline calculation fallback so sliders work even without backend
        const factor = scenarioType === 'add_solar' ? solarKw / 50 : evShiftPct / 60;
        setScenarioResult({
          monthly_cost_savings_rm: +(2850 * factor).toFixed(0),
          daily_carbon_saved_kg: +(112.5 * factor).toFixed(1),
          peak_reduction_pct: +(21.4 * factor).toFixed(1),
          comparison_series: INITIAL_WAVE.map((d) => ({
            time: d.t,
            baseline_kw: d.baseline_kw,
            optimized_kw: Math.max(60, +(d.baseline_kw - 38 * factor).toFixed(1))
          }))
        });
      });
  }, [selectedId, scenarioType, solarKw, evShiftPct]);

  // Send Natural Language Query to AI Assistant
  const handleAskAI = async (promptText) => {
    const query = promptText || chatInput;
    if (!query.trim()) return;

    setChatHistory((prev) => [...prev, { role: 'user', text: query }]);
    setChatInput('');

    try {
      const res = await fetch(`${API_BASE}/api/assistant/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      setChatHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.answer,
          tools: data.tools_called || []
        }
      ]);
    } catch {
      // Offline intelligent response fallback
      setChatHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          tools: [`analyze_township(zone='${selectedId}')`],
          text:
            `Live telemetry check complete:\n` +
            `• Power Demand: 2.4 MW (Peak in Zone B & C)\n` +
            `• Water Flow: 48.7 m³/h (Subsurface leak alert in Block B)\n` +
            `• Action: Shift 60% evening EV load & redistribute between Zone B and Zone D.`
        }
      ]);
    }
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const latestPoint = sparkData[sparkData.length - 1] || { kw: 2.4, water: 48.7, co2: 1.8 };

  return (
    <div className="prismatic-viewport">
      {/* FULL-SCREEN 3D ISOMETRIC CANVAS */}
      <div className="canvas-layer">
        <Canvas
          shadows
          camera={{ position: [21, 17, 21], fov: 35 }}
          gl={{ antialias: true }}
        >
          <color attach="background" args={['#06090e']} />
          <fog attach="fog" args={['#06090e', 28, 62]} />

          <ambientLight intensity={0.55} />
          <directionalLight
            castShadow
            position={[18, 28, 14]}
            intensity={1.35}
            color="#e2f1ff"
          />
          <pointLight position={[0, 10, 0]} intensity={2.2} distance={22} color="#00f5d4" />
          <pointLight position={[7, 5, 7]} intensity={1.8} distance={18} color="#00f5d4" />
          <pointLight position={[-7, 5, 1]} intensity={1.4} distance={16} color="#00bbf9" />

          <TownshipIsometricScene
            buildings={buildings}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
          />

          <OrbitControls
            enablePan={true}
            enableZoom={true}
            maxPolarAngle={Math.PI / 2.25}
            minPolarAngle={Math.PI / 6}
            minDistance={14}
            maxDistance={42}
          />
        </Canvas>
      </div>

      {/* FLOATING HUD OVERLAY */}
      <div className="hud-layer">
        {/* TOP NAVIGATION BAR */}
        <header className="top-nav interactive">
          <div className="brand-logo" onClick={() => setActiveTab('home')}>
            <svg width="34" height="34" viewBox="0 0 36 36" fill="none">
              <path d="M18 3L31 10.5V25.5L18 33L5 25.5V10.5L18 3Z" stroke="#00f5d4" strokeWidth="2.2" fill="rgba(0,245,212,0.12)" />
              <path d="M18 3L18 18M18 18L31 10.5M18 18L5 10.5" stroke="#00f5d4" strokeWidth="2" />
              <circle cx="18" cy="18" r="4" fill="#00f5d4" />
            </svg>
            <span className="brand-name">Prismatic</span>
          </div>

          <nav className="nav-pills">
            <button
              className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
              onClick={() => setActiveTab('home')}
              title="3D Township Overview"
            >
              <span className="nav-icon-box">
                <LayoutGrid size={17} />
              </span>
              {activeTab === 'home' && <span>Home</span>}
            </button>

            <button
              className={`nav-item ${activeTab === 'simulate' ? 'active' : ''}`}
              onClick={() => setActiveTab(activeTab === 'simulate' ? 'home' : 'simulate')}
              title="What-If Scenario Simulator"
            >
              <span className="nav-icon-box">
                <Zap size={17} />
              </span>
              {activeTab === 'simulate' && <span>Simulator</span>}
            </button>

            <button
              className={`nav-item ${activeTab === 'forecast' ? 'active' : ''}`}
              onClick={() => setActiveTab(activeTab === 'forecast' ? 'home' : 'forecast')}
              title="24h Prophet Demand Forecast"
            >
              <span className="nav-icon-box">
                <Folder size={17} />
              </span>
              {activeTab === 'forecast' && <span>Forecast</span>}
            </button>

            <button
              className={`nav-item ${activeTab === 'anomalies' ? 'active' : ''}`}
              onClick={() => setActiveTab(activeTab === 'anomalies' ? 'home' : 'anomalies')}
              title="Isolation Forest Anomaly Feed"
            >
              <span className="nav-icon-box">
                <Laptop size={17} />
              </span>
              {activeTab === 'anomalies' && <span>Anomalies</span>}
            </button>
          </nav>
        </header>

        {/* LEFT HERO TEXT & FLOATING RECOMMENDATION CARD */}
        <div className="left-column">
          <div>
            <h1 className="hero-title">
              Township<br />Twin
            </h1>
            <p className="hero-subtitle">
              Real-time simulation. Smarter decisions.<br />
              A sustainable tomorrow.
            </p>
          </div>

          <div className="recommendation-wrap interactive">
            <button className="fullscreen-btn" onClick={toggleFullScreen} title="Toggle Fullscreen">
              <Maximize2 size={15} />
            </button>

            <div
              className="rec-card"
              onClick={() =>
                handleAskAI('Optimize the energy usage between Zone B and Zone D')
              }
            >
              <div className="rec-sparkle">
                <Sparkles size={20} />
              </div>
              <p className="rec-text">
                It is recommended to redistribute the load between Zone B and Zone D.
              </p>
            </div>
          </div>
        </div>

        {/* INTERACTIVE OVERLAY MODAL (Simulator / Forecast / Anomalies) */}
        {activeTab !== 'home' && (
          <div className="glass-modal-overlay interactive">
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Sparkles size={18} color="#00f5d4" />
                <strong style={{ fontSize: '0.95rem' }}>
                  {activeTab === 'simulate' && 'What-If Sustainability Scenario Simulator'}
                  {activeTab === 'forecast' && '24-Hour Prophet AI Demand Forecast'}
                  {activeTab === 'anomalies' && 'Isolation Forest Real-Time Anomaly Alerts'}
                </strong>
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  style={{
                    background: '#0d1f24',
                    color: '#00f5d4',
                    border: '1px solid rgba(0,245,212,0.35)',
                    borderRadius: 6,
                    padding: '4px 8px',
                    fontSize: '0.78rem'
                  }}
                >
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="expand-btn"
                onClick={() => setActiveTab('home')}
                title="Close Panel"
              >
                <X size={15} />
              </button>
            </div>

            {activeTab === 'simulate' && (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    { id: 'add_solar', label: '☀️ Add Rooftop Solar PV' },
                    { id: 'shift_ev', label: '🔌 Shift EV Charging' },
                    { id: 'fix_leak', label: '💧 Repair Subsurface Water Leak' },
                    { id: 'precool', label: '❄️ Pre-Cool Commercial HVAC' }
                  ].map((s) => (
                    <button
                      key={s.id}
                      className={`scenario-btn ${scenarioType === s.id ? 'active' : ''}`}
                      onClick={() => setScenarioType(s.id)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {scenarioType === 'add_solar' && (
                  <div>
                    <label style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                      Solar PV Capacity: <strong style={{ color: '#00f5d4' }}>{solarKw} kW</strong> ({solarKw * 5} m²)
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="200"
                      step="10"
                      value={solarKw}
                      onChange={(e) => setSolarKw(e.target.value)}
                      style={{ width: '100%', accentColor: '#00f5d4', marginTop: 6 }}
                    />
                  </div>
                )}

                {scenarioType === 'shift_ev' && (
                  <div>
                    <label style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                      Shift Evening EV Peak to Solar Midday: <strong style={{ color: '#00f5d4' }}>{evShiftPct}%</strong>
                    </label>
                    <input
                      type="range"
                      min="20"
                      max="90"
                      step="10"
                      value={evShiftPct}
                      onChange={(e) => setEvShiftPct(e.target.value)}
                      style={{ width: '100%', accentColor: '#00f5d4', marginTop: 6 }}
                    />
                  </div>
                )}

                {scenarioResult && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    <div style={{ background: 'rgba(0,245,212,0.08)', padding: 10, borderRadius: 10 }}>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>MONTHLY SAVINGS</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#00f5d4' }}>
                        RM {scenarioResult.monthly_cost_savings_rm}
                      </div>
                    </div>
                    <div style={{ background: 'rgba(0,245,212,0.08)', padding: 10, borderRadius: 10 }}>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>CARBON AVOIDED</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#00f5d4' }}>
                        {scenarioResult.daily_carbon_saved_kg} kg CO₂/d
                      </div>
                    </div>
                    <div style={{ background: 'rgba(0,245,212,0.08)', padding: 10, borderRadius: 10 }}>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>PEAK REDUCTION</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#00f5d4' }}>
                        -{scenarioResult.peak_reduction_pct}%
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ flex: 1, minHeight: 150 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={scenarioResult?.comparison_series || []}>
                      <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                      <YAxis stroke="#64748b" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#071318', borderColor: '#00f5d4' }} />
                      <Area type="monotone" dataKey="baseline_kw" stroke="#ff4d6d" fill="none" name="Baseline" />
                      <Area type="monotone" dataKey="optimized_kw" stroke="#00f5d4" fill="rgba(0,245,212,0.2)" name="Optimized" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            {activeTab === 'forecast' && (
              <div style={{ flex: 1, minHeight: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecast.length ? forecast.slice(0, 48) : sparkData}>
                    <XAxis dataKey={forecast.length ? 'time_short' : 't'} stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#071318', borderColor: '#00f5d4' }} />
                    <Area
                      type="monotone"
                      dataKey={forecast.length ? 'yhat' : 'kw'}
                      stroke="#00f5d4"
                      strokeWidth={2.4}
                      fill="rgba(0,245,212,0.22)"
                      name="24h Prophet Forecast (kW)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {activeTab === 'anomalies' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(anomalies.length ? anomalies : [
                  {
                    type: 'Probable Subsurface Water Leak',
                    severity: 'high',
                    building_name: 'Serenia Sky Residence (Block B)',
                    detail: '2,310 L/h (Baseline: 1,400 L/h)',
                    timestamp: '03:15 AM'
                  },
                  {
                    type: 'Abnormal HVAC Peak Spike',
                    severity: 'medium',
                    building_name: 'Bukit Raja Commercial Hub (Block C)',
                    detail: '312 kW (Baseline: 140 kW)',
                    timestamp: '02:00 PM'
                  }
                ]).map((a, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: 'rgba(15, 32, 39, 0.85)',
                      borderLeft: `4px solid ${a.severity === 'high' ? '#ff4d6d' : '#fbbf24'}`
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 600 }}>
                      <span>{a.type}</span>
                      <span style={{ color: '#00f5d4', textTransform: 'uppercase', fontSize: '0.7rem' }}>{a.severity}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: 2 }}>{a.building_name}</div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>{a.detail} • {a.timestamp}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* BOTTOM 3 KPI SPARKLINE CARDS */}
        <section className="bottom-kpis interactive">
          {/* Card 1: Power Demand */}
          <div className="kpi-glass-card">
            <div className="kpi-card-top">
              <div className="kpi-title-group">
                <div className="kpi-icon-circle">
                  <Zap size={17} />
                </div>
                <span className="kpi-title">Power Demand</span>
              </div>
              <button className="expand-btn" onClick={() => setActiveTab('forecast')}>
                <ArrowUpRight size={15} />
              </button>
            </div>

            <div className="kpi-metric-row">
              <span className="kpi-number">{latestPoint.kw.toFixed(1)}</span>
              <span className="kpi-unit">MW</span>
            </div>

            <div className="kpi-sparkline">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkData}>
                  <defs>
                    <linearGradient id="cyanGrad1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00f5d4" stopOpacity={0.38} />
                      <stop offset="100%" stopColor="#00f5d4" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="kw"
                    stroke="#00f5d4"
                    strokeWidth={2.2}
                    fill="url(#cyanGrad1)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Card 2: Water Flow Rate */}
          <div className="kpi-glass-card">
            <div className="kpi-card-top">
              <div className="kpi-title-group">
                <div className="kpi-icon-circle">
                  <Droplet size={17} />
                </div>
                <span className="kpi-title">Water Flow Rate</span>
              </div>
              <button className="expand-btn" onClick={() => setActiveTab('anomalies')}>
                <ArrowUpRight size={15} />
              </button>
            </div>

            <div className="kpi-metric-row">
              <span className="kpi-number">{latestPoint.water.toFixed(1)}</span>
              <span className="kpi-unit">m³/h</span>
            </div>

            <div className="kpi-sparkline">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkData}>
                  <defs>
                    <linearGradient id="cyanGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00f5d4" stopOpacity={0.38} />
                      <stop offset="100%" stopColor="#00f5d4" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="water"
                    stroke="#00f5d4"
                    strokeWidth={2.2}
                    fill="url(#cyanGrad2)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Card 3: Carbon Emission */}
          <div className="kpi-glass-card">
            <div className="kpi-card-top">
              <div className="kpi-title-group">
                <div className="kpi-icon-circle">
                  <Leaf size={17} />
                </div>
                <span className="kpi-title">Carbon Emission</span>
              </div>
              <button className="expand-btn" onClick={() => setActiveTab('simulate')}>
                <ArrowUpRight size={15} />
              </button>
            </div>

            <div className="kpi-metric-row">
              <span className="kpi-number">{latestPoint.co2.toFixed(1)}</span>
              <span className="kpi-unit">tCO₂e</span>
            </div>

            <div className="kpi-sparkline">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkData}>
                  <defs>
                    <linearGradient id="cyanGrad3" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00f5d4" stopOpacity={0.38} />
                      <stop offset="100%" stopColor="#00f5d4" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="co2"
                    stroke="#00f5d4"
                    strokeWidth={2.2}
                    fill="url(#cyanGrad3)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* RIGHT AI ASSISTANT SIDEBAR */}
        <aside className="ai-drawer interactive">
          <div className="ai-header">
            <Sparkles size={22} color="#00f5d4" style={{ filter: 'drop-shadow(0 0 8px #00f5d4)' }} />
            <div>
              <div className="ai-header-title">AI Assistant</div>
              <div className="ai-status-badge">
                <span className="status-dot" />
                <span>{wsConnected ? 'Online' : 'Connecting'}</span>
              </div>
            </div>
          </div>

          <div className="ai-body">
            <div className="bot-welcome-row">
              <div className="robot-avatar">
                <svg width="32" height="32" viewBox="0 0 36 36" fill="none">
                  <rect x="6" y="9" width="24" height="18" rx="9" fill="#e2f8ff" stroke="#00f5d4" strokeWidth="1.5" />
                  <rect x="10" y="13" width="16" height="10" rx="5" fill="#061820" />
                  <path d="M13 18C13 16.8 14.5 16.8 14.5 18" stroke="#00f5d4" strokeWidth="2" strokeLinecap="round" />
                  <path d="M21.5 18C21.5 16.8 23 16.8 23 18" stroke="#00f5d4" strokeWidth="2" strokeLinecap="round" />
                  <path d="M16.5 20.5C17.3 21.2 18.7 21.2 19.5 20.5" stroke="#00f5d4" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div className="speech-bubble">
                  Hi! I'm Prismatic AI.<br />
                  How can I help you today?
                </div>
                <div className="speech-time">14:32</div>
              </div>
            </div>

            <div className="prompt-pills">
              <button
                className="prompt-pill"
                onClick={() => handleAskAI("What's the current energy demand across all buildings?")}
              >
                <Zap size={14} />
                <span>What's the current energy demand?</span>
              </button>

              <button
                className="prompt-pill"
                onClick={() => handleAskAI('Are there any abnormal readings or leaks?')}
              >
                <AlertTriangle size={14} />
                <span>Any abnormal readings?</span>
              </button>

              <button
                className="prompt-pill"
                onClick={() => handleAskAI("Show me tomorrow's 24-hour energy forecast")}
              >
                <Calendar size={14} />
                <span>Show me tomorrow's forecast</span>
              </button>

              <button
                className="prompt-pill"
                onClick={() => handleAskAI('What happens if we add 50 kW of solar panels to optimize energy usage?')}
              >
                <Sparkles size={14} />
                <span>Optimize the energy usage</span>
              </button>
            </div>

            {chatHistory.map((item, idx) =>
              item.role === 'user' ? (
                <div key={idx} className="user-bubble">
                  {item.text}
                </div>
              ) : (
                <div key={idx} className="assistant-reply-bubble">
                  {item.tools &&
                    item.tools.map((t, i) => (
                      <span key={i} className="tool-call-badge">
                        ⚡ {t}
                      </span>
                    ))}
                  <div>{item.text}</div>
                </div>
              )
            )}
          </div>

          <div className="ai-input-wrap">
            <input
              type="text"
              className="ai-input"
              placeholder="Ask a question..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAskAI()}
            />
            <button className="ai-send-btn" onClick={() => handleAskAI()}>
              <Send size={14} />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}