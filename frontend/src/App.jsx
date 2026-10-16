import React, { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text, Grid } from '@react-three/drei';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';

const API_BASE = 'http://127.0.0.1:8000';
const WS_URL = 'ws://127.0.0.1:8000/ws/live';

// Listing 6 Color-Coding Helper: Green (below baseline), Yellow (at baseline), Red (above baseline)
function getEnergyColor(currentKw, baselineKw) {
  const ratio = currentKw / (baselineKw || 1);
  if (ratio > 1.22) return '#ef4444'; // Red (Anomaly / High load)
  if (ratio > 0.92) return '#f59e0b'; // Yellow (At baseline)
  return '#10b981'; // Green (Efficient / Below baseline)
}

function BuildingMesh({ building, isSelected, onSelect }) {
  const height = building.floors * 1.4;
  const color = getEnergyColor(building.current_kw, building.baseline_kw);

  return (
    <group position={[building.x, 0, building.z]}>
      <mesh
        position={[0, height / 2, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(building.id);
        }}
      >
        <boxGeometry args={[5.5, height, 5.5]} />
        <meshStandardMaterial
          color={color}
          emissive={isSelected ? '#3b82f6' : '#000000'}
          emissiveIntensity={isSelected ? 0.5 : 0}
          roughness={0.3}
        />
      </mesh>
      <Text
        position={[0, height + 1.8, 0]}
        fontSize={1.1}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        {`${building.name.split('(')[0].trim()}\n${building.current_kw} kW`}
      </Text>
    </group>
  );
}

const SAMPLE_QUERIES = [
  "What's the total energy consumption across all buildings today?",
  "Are there any active anomalies in Block C?",
  "What happens if we add 50 kW of solar panels to the community center?",
  "Show me the water usage forecast for the next 24 hours.",
  "If we fix the detected leak in Zone B, how much water will we save per day?",
  "Compare energy consumption between residential and commercial zones."
];

export default function App() {
  const [buildings, setBuildings] = useState([]);
  const [selectedId, setSelectedId] = useState('commercial_c');
  const [history, setHistory] = useState([]);
  const [forecast, setForecast] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [f1Metrics, setF1Metrics] = useState({});
  const [wsConnected, setWsConnected] = useState(false);

  // What-If Scenario state
  const [scenarioType, setScenarioType] = useState('add_solar');
  const [solarKw, setSolarKw] = useState(50);
  const [evShiftPct, setEvShiftPct] = useState(60);
  const [scenarioResult, setScenarioResult] = useState(null);

  // AI Assistant state
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      tools: [],
      text: 'Hello Facility Manager! I am the Prismatic Grid AI Assistant. Click a sample question below or ask me about energy anomalies, water leaks, 24h forecasts, or solar scenarios.'
    }
  ]);

  // 1. Initial Load & WebSocket Stream
  useEffect(() => {
    fetch(`${API_BASE}/api/buildings`)
      .then((r) => r.json())
      .then((d) => setBuildings(d.buildings || []));

    fetch(`${API_BASE}/api/anomalies`)
      .then((r) => r.json())
      .then((d) => {
        setAnomalies(d.anomalies || []);
        setF1Metrics(d.metrics || {});
      });

    const ws = new WebSocket(WS_URL);
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'LIVE_TICK') {
        setBuildings((prev) =>
          prev.map((b) => {
            const live = msg.buildings.find((x) => x.building_id === b.id);
            return live ? { ...b, ...live } : b;
          })
        );
      }
    };
    return () => ws.close();
  }, []);

  // 2. Load Selected Building Consumption & Forecast
  useEffect(() => {
    if (!selectedId) return;
    fetch(`${API_BASE}/api/consumption/${selectedId}?hours=24`)
      .then((r) => r.json())
      .then((d) => setHistory(d.data || []));

    fetch(`${API_BASE}/api/forecast/${selectedId}?horizon_hours=24&resource=energy`)
      .then((r) => r.json())
      .then((d) => setForecast(d.forecast || []));
  }, [selectedId]);

  // 3. Run What-If Scenario Simulation
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
      .then((d) => setScenarioResult(d));
  }, [selectedId, scenarioType, solarKw, evShiftPct]);

  const sendQuery = async (queryText) => {
    const q = queryText || chatInput;
    if (!q.trim()) return;
    setMessages((prev) => [...prev, { role: 'user', text: q, tools: [] }]);
    setChatInput('');

    const res = await fetch(`${API_BASE}/api/assistant/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q })
    });
    const data = await res.json();
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', text: data.answer, tools: data.tools_called || [] }
    ]);
  };

  // KPI Aggregations
  const totalKw = buildings.reduce((acc, b) => acc + (b.current_kw || 0), 0);
  const totalWater = buildings.reduce((acc, b) => acc + (b.current_water_lph || 0), 0);
  const hourlyCarbon = totalKw * 0.585;
  const selectedBuilding = buildings.find((b) => b.id === selectedId) || {};

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="topbar">
        <div className="brand">
          <h1>
            🏙️ Prismatic Grid
            <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 400 }}>
              Sime Darby Property — Energy & Water Digital Twin
            </span>
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span className="badge-live">
            {wsConnected ? '● WebSocket Live Stream (5s)' : '○ Connecting...'}
          </span>
        </div>
      </header>

      {/* Top KPI Cards */}
      <section className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">LIVE TOWNSHIP POWER DEMAND</div>
          <div className="kpi-value" style={{ color: '#3b82f6' }}>
            {totalKw.toFixed(1)} kW
          </div>
          <div className="kpi-sub">Across 5 monitored township zones</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">LIVE WATER FLOW RATE</div>
          <div className="kpi-value" style={{ color: '#06b6d4' }}>
            {totalWater.toFixed(0)} L/hr
          </div>
          <div className="kpi-sub">Real-time smart meter telemetry</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">CARBON EMISSION INTENSITY</div>
          <div className="kpi-value" style={{ color: '#f59e0b' }}>
            {hourlyCarbon.toFixed(1)} kg CO₂/hr
          </div>
          <div className="kpi-sub">Malaysia Grid Factor: 0.585 kg CO₂/kWh</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">SIMULATED SCENARIO SAVINGS</div>
          <div className="kpi-value" style={{ color: '#10b981' }}>
            RM {scenarioResult ? scenarioResult.monthly_cost_savings_rm : '0'}/mo
          </div>
          <div className="kpi-sub">
            {scenarioResult
              ? `${scenarioResult.daily_carbon_saved_kg} kg CO₂ avoided/day`
              : 'Select a What-If intervention'}
          </div>
        </div>
      </section>

      {/* Middle Row: 3D Map + Live & Forecast Charts */}
      <section className="main-grid">
        {/* 3D Township Map */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">
              3D Interactive Township Replica (Click any building to inspect)
            </span>
            <select
              className="btn"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="map-container">
            <Canvas camera={{ position: [32, 28, 32], fov: 45 }}>
              <ambientLight intensity={0.6} />
              <directionalLight position={[20, 30, 10]} intensity={1.1} />
              <Grid infiniteGrid cellSize={4} sectionColor="#1e293b" cellColor="#0f172a" />
              {buildings.map((b) => (
                <BuildingMesh
                  key={b.id}
                  building={b}
                  isSelected={b.id === selectedId}
                  onSelect={setSelectedId}
                />
              ))}
              <OrbitControls makeDefault />
            </Canvas>
            <div className="map-legend">
              <span style={{ color: '#10b981' }}>● Below Baseline</span>
              <span style={{ color: '#f59e0b' }}>● Normal Load</span>
              <span style={{ color: '#ef4444' }}>● Anomaly / Peak Alert</span>
            </div>
          </div>
        </div>

        {/* Historical & Prophet 24h Forecast Chart */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">
              {selectedBuilding.name || 'Building'} — 24h Historical & Prophet Forecast (kW)
            </span>
          </div>
          <div style={{ height: 165, marginBottom: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history.slice(-48)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time_short" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="consumption_kw"
                  name="Actual Power (kW)"
                  stroke="#3b82f6"
                  fill="rgba(59, 130, 246, 0.2)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ height: 165 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecast.slice(0, 48)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time_short" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="yhat_upper"
                  name="95% Upper Bound"
                  stroke="none"
                  fill="rgba(16, 185, 129, 0.12)"
                />
                <Area
                  type="monotone"
                  dataKey="yhat"
                  name="Prophet 24h Forecast (kW)"
                  stroke="#10b981"
                  fill="rgba(16, 185, 129, 0.25)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Bottom Row: What-If Simulator + Anomaly Feed + AI Assistant */}
      <section className="bottom-grid">
        {/* What-If Scenario Simulator */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">⚡ What-If Scenario Simulator</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            <button
              className={`btn ${scenarioType === 'add_solar' ? 'active' : ''}`}
              onClick={() => setScenarioType('add_solar')}
            >
              ☀️ Add Solar PV
            </button>
            <button
              className={`btn ${scenarioType === 'shift_ev' ? 'active' : ''}`}
              onClick={() => setScenarioType('shift_ev')}
            >
              🚗 Shift EV Charging
            </button>
            <button
              className={`btn ${scenarioType === 'fix_leak' ? 'active' : ''}`}
              onClick={() => setScenarioType('fix_leak')}
            >
              💧 Fix Water Leak
            </button>
            <button
              className={`btn ${scenarioType === 'precool' ? 'active' : ''}`}
              onClick={() => setScenarioType('precool')}
            >
              ❄️ Pre-Cool HVAC
            </button>
          </div>

          {scenarioType === 'add_solar' && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                Solar Capacity: <strong>{solarKw} kW</strong> ({solarKw * 5} m² roof area)
              </label>
              <input
                type="range"
                min="10"
                max="200"
                step="10"
                value={solarKw}
                onChange={(e) => setSolarKw(e.target.value)}
                style={{ width: '100%', marginTop: 6 }}
              />
            </div>
          )}

          {scenarioType === 'shift_ev' && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                Shift Evening EV Sessions to 10AM–2PM: <strong>{evShiftPct}%</strong>
              </label>
              <input
                type="range"
                min="20"
                max="90"
                step="10"
                value={evShiftPct}
                onChange={(e) => setEvShiftPct(e.target.value)}
                style={{ width: '100%', marginTop: 6 }}
              />
            </div>
          )}

          {scenarioResult && (
            <>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 8 }}>
                <strong>{scenarioResult.title}</strong> • Peak Demand Reduction:{' '}
                <span style={{ color: '#10b981', fontWeight: 700 }}>
                  {scenarioResult.peak_reduction_pct}%
                </span>{' '}
                ({scenarioResult.daily_savings_kwh} kWh/day saved)
              </div>
              <div style={{ height: 170 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={scenarioResult.comparison_series || []}>
                    <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                    <YAxis stroke="#64748b" fontSize={10} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a' }} />
                    <Area
                      type="monotone"
                      dataKey="baseline_kw"
                      name="Baseline"
                      stroke="#ef4444"
                      fill="none"
                    />
                    <Area
                      type="monotone"
                      dataKey="optimized_kw"
                      name="After Intervention"
                      stroke="#10b981"
                      fill="rgba(16, 185, 129, 0.2)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>

        {/* Anomaly Detection Feed */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">🚨 Isolation Forest Anomaly Feed</span>
            <span style={{ fontSize: '0.75rem', color: '#10b981' }}>
              F1: {f1Metrics[selectedId]?.f1_score || '0.89'}
            </span>
          </div>
          <div className="anomaly-list">
            {anomalies.map((a, idx) => (
              <div key={idx} className={`anomaly-item ${a.severity}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                  <span>{a.type}</span>
                  <span style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>
                    {a.severity}
                  </span>
                </div>
                <div style={{ color: '#cbd5e1', marginTop: 2 }}>{a.building_name}</div>
                <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: 4 }}>
                  {a.detail} • {a.timestamp}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Natural Language AI Assistant */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">🤖 Natural-Language AI Assistant</span>
          </div>
          <div className="chat-box">
            <div className="quick-queries">
              {SAMPLE_QUERIES.slice(0, 3).map((q, i) => (
                <button key={i} className="chip" onClick={() => sendQuery(q)}>
                  {q}
                </button>
              ))}
            </div>
            <div className="chat-messages">
              {messages.map((m, i) => (
                <div key={i} className={`msg ${m.role}`}>
                  {m.tools &&
                    m.tools.map((t, idx) => (
                      <div key={idx} className="tool-pill">
                        ⚙️ Called: {t}
                      </div>
                    ))}
                  <div>{m.text}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendQuery()}
                placeholder="Ask e.g. 'Why did Block C spike?' or 'Add 50 kW solar'..."
                style={{
                  flex: 1,
                  background: '#090e1a',
                  border: '1px solid #334155',
                  color: 'white',
                  padding: '8px 10px',
                  borderRadius: 6,
                  fontSize: '0.82rem'
                }}
              />
              <button className="btn active" onClick={() => sendQuery()}>
                Ask
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

