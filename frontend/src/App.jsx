import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import {
  LayoutGrid, Zap, AlertTriangle, Sparkles, Maximize2, Minimize2,
  ArrowUpRight, Droplet, Leaf, Send, X, Plus, MessageSquare, ShieldAlert
} from 'lucide-react';

const BACKEND_HOST = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'localhost'
  : '127.0.0.1';
const API_BASE = `http://${BACKEND_HOST}:8000`;
const WS_URL = `ws://${BACKEND_HOST}:8000/ws/live`;
const MALAYSIA_CARBON_FACTOR = 0.585;

const SEVERITY_COLORS = {
  high: { main: '#ef4444', bg: 'rgba(239, 68, 68, 0.14)', border: 'rgba(239, 68, 68, 0.5)' },
  medium: { main: '#f59e0b', bg: 'rgba(245, 158, 11, 0.14)', border: 'rgba(245, 158, 11, 0.5)' },
  low: { main: '#10b981', bg: 'rgba(16, 185, 129, 0.14)', border: 'rgba(16, 185, 129, 0.5)' }
};

const getSeverityTheme = (sev) => SEVERITY_COLORS[sev] || SEVERITY_COLORS.low;
const getAnomalyKey = (item) => `${item.building_id}-${item.timestamp}-${item.type}`;

// Clean Markdown parser to remove raw '*' and '**' symbols from AI Assistant replies
function renderFormattedText(rawText) {
  if (!rawText) return null;
  const lines = rawText.split('\n');

  const formatInline = (str) => {
    const cleaned = str.replace(/\*\*\*/g, '**');
    const parts = cleaned.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={idx} style={{ color: '#00f5d4', fontWeight: 600 }}>
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part.replace(/\*/g, '');
    });
  };

  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={idx} style={{ height: 8 }} />;

    const isBullet = /^[•.\-*]\s+/.test(trimmed);
    const content = isBullet ? trimmed.replace(/^[•.\-*]\s+/, '') : trimmed;

    return (
      <div
        key={idx}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          marginBottom: 4,
          paddingLeft: isBullet ? 6 : 0
        }}
      >
        {isBullet && (
          <span style={{ color: '#00f5d4', fontWeight: 700, lineHeight: 1.5 }}>•</span>
        )}
        <span style={{ flex: 1, lineHeight: 1.55 }}>{formatInline(content)}</span>
      </div>
    );
  });
}

const DEFAULT_BUILDINGS = [
  { id: 'terrace_a', name: 'Elmina Green Terrace Zone A', type: 'terrace', floors: 2, current_kw: 12.0, baseline_kw: 12.0, current_water_lph: 180 },
  { id: 'condo_b', name: 'Serenia Sky Residence (Block B)', type: 'condo', floors: 12, current_kw: 85.0, baseline_kw: 85.0, current_water_lph: 1400 },
  { id: 'commercial_c', name: 'Bukit Raja Commercial Hub (Block C)', type: 'commercial', floors: 4, current_kw: 140.0, baseline_kw: 140.0, current_water_lph: 950 },
  { id: 'common_d', name: 'Township Community Clubhouse & Park', type: 'common', floors: 2, current_kw: 35.0, baseline_kw: 35.0, current_water_lph: 400 },
  { id: 'ev_station_e', name: 'SDP Fast EV Charging Hub', type: 'ev', floors: 1, current_kw: 50.0, baseline_kw: 50.0, current_water_lph: 20 }
];

const INITIAL_SPARKLINE = [
  { t: '10:00', kw: 295.4, water: 2780, co2: 172.8 },
  { t: '10:05', kw: 304.2, water: 2840, co2: 178.0 },
  { t: '10:10', kw: 301.8, water: 2810, co2: 176.6 },
  { t: '10:15', kw: 315.6, water: 2920, co2: 184.6 },
  { t: '10:20', kw: 322.0, water: 2950, co2: 188.4 },
  { t: '10:25', kw: 318.5, water: 2890, co2: 186.3 },
  { t: '10:30', kw: 328.4, water: 3010, co2: 192.1 },
  { t: '10:35', kw: 322.0, water: 2950, co2: 188.4 }
];

const PRISMATIC_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');

:root {
  --bg-obsidian: #06090e;
  --cyan-glow: #00f5d4;
  --cyan-bright: #22d3ee;
  --glass-bg: linear-gradient(145deg, rgba(13, 38, 42, 0.72) 0%, rgba(7, 17, 22, 0.88) 100%);
  --glass-border: rgba(0, 245, 212, 0.24);
  --glass-border-hover: rgba(0, 245, 212, 0.6);
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
}

* {
  box-sizing: border-box !important;
  margin: 0;
  padding: 0;
  font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
}

/* Global Custom Dark Scrollbars so white/grey scrollbars never appear */
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 245, 212, 0.35) rgba(6, 14, 18, 0.6);
}

*::-webkit-scrollbar {
  width: 6px !important;
  height: 6px !important;
}

*::-webkit-scrollbar-track {
  background: rgba(6, 14, 18, 0.65) !important;
  border-radius: 999px !important;
}

*::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, rgba(0, 245, 212, 0.45), rgba(34, 211, 238, 0.3)) !important;
  border-radius: 999px !important;
  border: 1px solid rgba(0, 245, 212, 0.2) !important;
}

*::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 245, 212, 0.75) !important;
}

html, body, #root {
  width: 100vw !important;
  height: 100vh !important;
  max-width: none !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  background-color: #06090e !important;
  color: #f8fafc !important;
  display: block !important;
}

.prismatic-viewport {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  background: radial-gradient(circle at 46% 46%, #0c262b 0%, #05080c 72%) !important;
  overflow: hidden !important;
}

.canvas-layer {
  position: absolute !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 1 !important;
}

.top-nav {
  position: fixed !important;
  top: 24px !important;
  left: 32px !important;
  right: 32px !important;
  z-index: 50 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  pointer-events: none !important;
  transition: transform 0.55s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.45s ease !important;
}

.top-nav.slide-out-top {
  transform: translateY(-120px) !important;
  opacity: 0 !important;
}

.top-nav-left {
  display: flex !important;
  align-items: center !important;
  gap: 28px !important;
  pointer-events: auto !important;
}

.brand-logo {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  cursor: pointer !important;
}

.brand-name {
  font-size: 1.35rem !important;
  font-weight: 700 !important;
  letter-spacing: -0.02em !important;
  color: #ffffff !important;
}

.nav-pills {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
}

.nav-item {
  height: 42px !important;
  padding: 4px 14px 4px 6px !important;
  border-radius: 12px !important;
  background: rgba(20, 29, 38, 0.78) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  color: #cbd5e1 !important;
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  cursor: pointer !important;
  backdrop-filter: blur(12px) !important;
  transition: all 0.2s ease !important;
  font-size: 0.84rem !important;
  font-weight: 500 !important;
}

.nav-item:hover {
  border-color: var(--glass-border-hover) !important;
  color: #ffffff !important;
}

.nav-item.active {
  background: rgba(30, 41, 52, 0.92) !important;
  border-color: rgba(0, 245, 212, 0.45) !important;
  color: #ffffff !important;
}

.nav-icon-box {
  width: 30px !important;
  height: 30px !important;
  border-radius: 8px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.nav-item.active .nav-icon-box {
  background: linear-gradient(135deg, #00f5d4 0%, #00bbf9 100%) !important;
  color: #041214 !important;
  box-shadow: 0 0 14px rgba(0, 245, 212, 0.5) !important;
}

.nav-badge {
  background: #ef4444 !important;
  color: #fff !important;
  font-size: 0.65rem !important;
  font-weight: 700 !important;
  padding: 1px 6px !important;
  border-radius: 999px !important;
}

/* Home Left Column: Top-to-Bottom Flex so scroller sits directly under subtitle */
.home-left-col {
  position: absolute !important;
  top: 108px !important;
  left: 32px !important;
  bottom: 28px !important;
  z-index: 15 !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 16px !important;
  width: 285px !important;
  pointer-events: none !important;
  transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.45s ease !important;
}

.home-left-col.slide-out-left {
  transform: translateX(-420px) !important;
  opacity: 0 !important;
}

.hero-title {
  font-size: 3.15rem !important;
  font-weight: 400 !important;
  line-height: 1.06 !important;
  letter-spacing: -0.03em !important;
  color: #ffffff !important;
  margin-bottom: 12px !important;
}

.hero-subtitle {
  font-size: 0.86rem !important;
  line-height: 1.55 !important;
  color: var(--text-secondary) !important;
}

/* Scrollable Anomaly Notification Stack right under Subtitle with Soft Top/Bottom Fade */
.home-anomaly-scroll {
  flex: 1 !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 10px !important;
  padding: 12px 6px 14px 0 !important;
  pointer-events: auto !important;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 7%, black 91%, transparent 100%) !important;
  mask-image: linear-gradient(to bottom, transparent 0%, black 7%, black 91%, transparent 100%) !important;
}

.anomaly-toast-card {
  position: relative !important;
  width: 100% !important;
  padding: 12px 14px !important;
  border-radius: 14px !important;
  backdrop-filter: blur(16px) !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45) !important;
  cursor: pointer !important;
  transition: transform 0.2s ease !important;
  flex-shrink: 0 !important;
}

.anomaly-toast-card:hover {
  transform: translateY(-2px) !important;
}

.toast-close-btn {
  position: absolute !important;
  top: 8px !important;
  right: 8px !important;
  width: 20px !important;
  height: 20px !important;
  border-radius: 50% !important;
  background: rgba(255, 255, 255, 0.08) !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  color: #cbd5e1 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer !important;
}

.toast-close-btn:hover {
  background: rgba(255, 255, 255, 0.25) !important;
  color: #ffffff !important;
}

.icon-only-circle-btn {
  width: 42px !important;
  height: 42px !important;
  border-radius: 50% !important;
  background: rgba(13, 35, 40, 0.88) !important;
  border: 1px solid rgba(0, 245, 212, 0.45) !important;
  color: #ffffff !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer !important;
  pointer-events: auto !important;
  backdrop-filter: blur(14px) !important;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.5), 0 0 15px rgba(0, 245, 212, 0.2) !important;
  transition: all 0.25s ease !important;
  flex-shrink: 0 !important;
}

.icon-only-circle-btn:hover {
  background: var(--cyan-glow) !important;
  color: #041214 !important;
  box-shadow: 0 0 24px rgba(0, 245, 212, 0.6) !important;
}

.home-right-kpis {
  position: absolute !important;
  top: 96px !important;
  right: 32px !important;
  bottom: 28px !important;
  width: 350px !important;
  z-index: 15 !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 16px !important;
  pointer-events: auto !important;
  transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.45s ease !important;
}

.home-right-kpis.slide-out-right {
  transform: translateX(440px) !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

.kpi-glass-card {
  position: relative !important;
  flex: 1 !important;
  padding: 18px 20px 10px 20px !important;
  border-radius: 20px !important;
  background: var(--glass-bg) !important;
  border: 1px solid var(--glass-border) !important;
  backdrop-filter: blur(20px) !important;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: space-between !important;
  overflow: hidden !important;
}

.kpi-card-top {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
}

.kpi-title-group {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
}

.kpi-icon-circle {
  width: 34px !important;
  height: 34px !important;
  border-radius: 50% !important;
  background: rgba(0, 245, 212, 0.12) !important;
  border: 1px solid rgba(0, 245, 212, 0.35) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  color: var(--cyan-glow) !important;
}

.kpi-title {
  font-size: 0.92rem !important;
  font-weight: 500 !important;
  color: #e2e8f0 !important;
}

.expand-btn {
  width: 28px !important;
  height: 28px !important;
  border-radius: 8px !important;
  background: rgba(255, 255, 255, 0.06) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  color: #cbd5e1 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer !important;
  transition: 0.2s !important;
}

.expand-btn:hover {
  color: #041214 !important;
  border-color: var(--cyan-glow) !important;
  background: var(--cyan-glow) !important;
}

.kpi-metric-row {
  display: flex !important;
  align-items: baseline !important;
  gap: 8px !important;
  margin-top: 2px !important;
  z-index: 2 !important;
}

.kpi-number {
  font-size: 2.2rem !important;
  font-weight: 700 !important;
  letter-spacing: -0.02em !important;
  color: #ffffff !important;
}

.kpi-unit {
  font-size: 1.35rem !important;
  font-weight: 500 !important;
  color: #cbd5e1 !important;
}

.kpi-sparkline {
  width: 100% !important;
  height: 64px !important;
  margin-top: auto !important;
  z-index: 2 !important;
}

.status-dot {
  width: 8px !important;
  height: 8px !important;
  border-radius: 50% !important;
  display: inline-block !important;
}

.expanded-chart-modal {
  position: fixed !important;
  top: 96px !important;
  left: 335px !important;
  right: 400px !important;
  bottom: 28px !important;
  z-index: 40 !important;
  background: linear-gradient(160deg, rgba(10, 28, 34, 0.96) 0%, rgba(5, 12, 16, 0.98) 100%) !important;
  border: 1px solid rgba(0, 245, 212, 0.45) !important;
  border-radius: 22px !important;
  backdrop-filter: blur(28px) !important;
  box-shadow: 0 25px 70px rgba(0, 0, 0, 0.85) !important;
  padding: 22px 26px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 14px !important;
  pointer-events: auto !important;
}

.full-page-container {
  position: fixed !important;
  inset: 0 !important;
  padding: 88px 32px 28px 32px !important;
  z-index: 30 !important;
  background: radial-gradient(circle at 50% 20%, rgba(12, 42, 48, 0.96) 0%, rgba(5, 8, 12, 0.98) 75%) !important;
  backdrop-filter: blur(20px) !important;
  overflow: hidden !important;
  pointer-events: auto !important;
}

.glass-panel {
  background: var(--glass-bg) !important;
  border: 1px solid var(--glass-border) !important;
  border-radius: 20px !important;
  padding: 22px !important;
  backdrop-filter: blur(18px) !important;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.45) !important;
}

.gemini-layout {
  display: grid !important;
  grid-template-columns: 260px 1fr !important;
  gap: 20px !important;
  height: 100% !important;
}

.gemini-sidebar {
  background: rgba(10, 22, 27, 0.85) !important;
  border: 1px solid var(--glass-border) !important;
  border-radius: 20px !important;
  padding: 18px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 14px !important;
}

.new-chat-btn {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
  padding: 10px 16px !important;
  border-radius: 999px !important;
  background: rgba(0, 245, 212, 0.14) !important;
  border: 1px solid rgba(0, 245, 212, 0.4) !important;
  color: #ffffff !important;
  font-size: 0.85rem !important;
  font-weight: 600 !important;
  cursor: pointer !important;
  transition: 0.2s !important;
}

.new-chat-btn:hover {
  background: var(--cyan-glow) !important;
  color: #041214 !important;
}

.chat-history-item {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  padding: 10px 12px !important;
  border-radius: 12px !important;
  color: #cbd5e1 !important;
  font-size: 0.82rem !important;
  cursor: pointer !important;
  overflow: hidden !important;
  white-space: nowrap !important;
  text-overflow: ellipsis !important;
}

.chat-history-item:hover, .chat-history-item.active {
  background: rgba(0, 245, 212, 0.12) !important;
  color: #ffffff !important;
}

.gemini-main {
  background: rgba(10, 22, 27, 0.72) !important;
  border: 1px solid var(--glass-border) !important;
  border-radius: 20px !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}

.gemini-messages {
  flex: 1 !important;
  overflow-y: auto !important;
  padding: 28px 12% !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 20px !important;
}

.gemini-input-area {
  padding: 16px 12% 22px 12% !important;
}

.gemini-prompt-box {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  background: rgba(16, 34, 41, 0.92) !important;
  border: 1px solid rgba(0, 245, 212, 0.35) !important;
  border-radius: 999px !important;
  padding: 10px 14px 10px 22px !important;
}
`;

/* ============================================================================
   3D ARCHITECTURAL SCENE COMPONENTS
   ============================================================================ */

function GlowingSolarPanel({ position, rotation = [-0.35, 0, 0], size = [2.2, 0.08, 1.4], color = '#00f5d4' }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.1} roughness={0.15} metalness={0.8} />
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
        <meshStandardMaterial color={glowing ? '#00f5d4' : '#334155'} emissive={glowing ? '#00f5d4' : '#000000'} emissiveIntensity={glowing ? 0.5 : 0} />
      </mesh>
    </group>
  );
}

function PowerLineCurve({ start, end, sag = 0.45 }) {
  const geometry = useMemo(() => {
    const mid = [(start[0] + end[0]) / 2, Math.min(start[1], end[1]) - sag, (start[2] + end[2]) / 2];
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(...start), new THREE.Vector3(...mid), new THREE.Vector3(...end));
    return new THREE.BufferGeometry().setFromPoints(curve.getPoints(20));
  }, [start, end, sag]);

  return (
    <line geometry={geometry}>
      <lineBasicMaterial color="#00f5d4" transparent opacity={0.38} />
    </line>
  );
}

function BuildingFullscreenPopup({ building, anomaly, severityColor, position = [0, 5, 0], visible }) {
  if (!visible || !building) return null;
  return (
    <Html position={position} center distanceFactor={26}>
      <div
        style={{
          background: 'rgba(6, 18, 24, 0.95)',
          border: `1.5px solid ${severityColor}`,
          padding: '10px 14px',
          borderRadius: '12px',
          color: '#fff',
          minWidth: '210px',
          boxShadow: `0 8px 28px rgba(0,0,0,0.7), 0 0 18px ${severityColor}66`,
          pointerEvents: 'none'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: '12px' }}>{building.name}</span>
          <span
            style={{
              fontSize: '9px',
              fontWeight: 700,
              textTransform: 'uppercase',
              padding: '2px 6px',
              borderRadius: 999,
              background: `${severityColor}25`,
              color: severityColor,
              border: `1px solid ${severityColor}`
            }}
          >
            {anomaly ? anomaly.severity : 'normal'}
          </span>
        </div>

        <div style={{ color: '#cbd5e1', fontSize: '11px', marginTop: 4 }}>
          {building.current_kw} kW &nbsp;|&nbsp; {building.current_water_lph} L/h
        </div>

        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: '1px solid rgba(255,255,255,0.1)',
            fontSize: '11px',
            color: anomaly ? severityColor : '#10b981',
            fontWeight: 600
          }}
        >
          {anomaly ? `${anomaly.type}: ${anomaly.detail}` : 'No active anomalies'}
        </div>
      </div>
    </Html>
  );
}

function HighRiseCondo({ position, isSelected, onSelect, building, showLabels, highlightColor, topAnomaly }) {
  const activeColor = isSelected && showLabels ? highlightColor : '#00f5d4';

  return (
    <group position={position} onClick={(e) => { e.stopPropagation(); onSelect('condo_b'); }}>
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[6.4, 0.24, 6.4]} />
        <meshStandardMaterial
          color={isSelected && showLabels ? highlightColor : '#181e26'}
          emissive={isSelected && showLabels ? highlightColor : '#000000'}
          emissiveIntensity={isSelected && showLabels ? 0.45 : 0}
          roughness={0.8}
        />
      </mesh>
      <mesh position={[0, 4.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.2, 8.2, 4.2]} />
        <meshStandardMaterial
          color="#2c3540"
          emissive={isSelected && showLabels ? highlightColor : '#000000'}
          emissiveIntensity={isSelected && showLabels ? 0.25 : 0}
          roughness={0.55}
          metalness={0.2}
        />
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
                <meshStandardMaterial color={isLit ? activeColor : '#111827'} emissive={isLit ? activeColor : '#000000'} emissiveIntensity={isLit ? 1.8 : 0} />
              </mesh>
              <mesh position={[-2.12, y, x]}>
                <boxGeometry args={[0.04, 0.55, 0.38]} />
                <meshStandardMaterial color={isLit ? activeColor : '#111827'} emissive={isLit ? activeColor : '#000000'} emissiveIntensity={isLit ? 1.6 : 0} />
              </mesh>
            </group>
          );
        })
      )}
      <mesh position={[-1.4, 0.85, 2.14]}>
        <boxGeometry args={[0.9, 1.4, 0.06]} />
        <meshStandardMaterial color={activeColor} emissive={activeColor} emissiveIntensity={2.4} />
      </mesh>
      <mesh position={[0.9, 8.55, 0.8]}>
        <boxGeometry args={[0.95, 0.55, 0.95]} />
        <meshStandardMaterial color="#10b981" roughness={0.4} />
      </mesh>
      <GlowingSolarPanel position={[-0.9, 8.7, -1.1]} size={[1.8, 0.08, 1.1]} color={activeColor} />
      <GlowingSolarPanel position={[-0.9, 8.7, 0.1]} size={[1.8, 0.08, 1.1]} color={activeColor} />
      <GlowingSolarPanel position={[-0.9, 8.7, 1.3]} size={[1.8, 0.08, 1.1]} color={activeColor} />
      <Tree position={[-2.5, 0.2, 2.4]} scale={0.85} />
      <Tree position={[2.5, 0.2, 2.2]} scale={0.75} />
      <BuildingFullscreenPopup
        building={building}
        anomaly={topAnomaly}
        severityColor={highlightColor}
        position={[0, 10.4, 0]}
        visible={showLabels && isSelected}
      />
    </group>
  );
}

function TerraceHouseCluster({ position, isSelected, onSelect, building, showLabels, highlightColor, topAnomaly }) {
  const activeColor = isSelected && showLabels ? highlightColor : '#00f5d4';

  return (
    <group position={position} onClick={(e) => { e.stopPropagation(); onSelect('terrace_a'); }}>
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[6.4, 0.24, 6.4]} />
        <meshStandardMaterial
          color={isSelected && showLabels ? highlightColor : '#181e26'}
          emissive={isSelected && showLabels ? highlightColor : '#000000'}
          emissiveIntensity={isSelected && showLabels ? 0.45 : 0}
          roughness={0.8}
        />
      </mesh>
      <group position={[0.4, 0.24, -0.4]}>
        <mesh position={[0, 1.1, 0]} castShadow>
          <boxGeometry args={[3.1, 2.2, 2.6]} />
          <meshStandardMaterial
            color="#2a333e"
            emissive={isSelected && showLabels ? highlightColor : '#000000'}
            emissiveIntensity={isSelected && showLabels ? 0.25 : 0}
          />
        </mesh>
        <mesh position={[0, 2.65, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[2.45, 1.3, 4]} />
          <meshStandardMaterial color="#1e252e" />
        </mesh>
        <GlowingSolarPanel position={[0, 2.72, 0.68]} rotation={[0.58, 0, 0]} size={[2.3, 0.07, 1.25]} color={activeColor} />
        {[-0.8, 0.8].map((x, idx) => (
          <mesh key={idx} position={[x, 1.3, 1.32]}>
            <boxGeometry args={[0.55, 0.65, 0.04]} />
            <meshStandardMaterial color={activeColor} emissive={activeColor} emissiveIntensity={2.0} />
          </mesh>
        ))}
      </group>
      <group position={[-1.4, 0.24, 1.1]}>
        <mesh position={[0, 0.75, 0]} castShadow>
          <boxGeometry args={[2.1, 1.5, 2.0]} />
          <meshStandardMaterial color="#252e38" />
        </mesh>
        <GlowingSolarPanel position={[0, 1.65, 0.3]} rotation={[0.4, 0, 0]} size={[1.6, 0.06, 0.95]} color={activeColor} />
      </group>
      <MiniCar position={[0.3, 0.24, 2.1]} rotation={[0, 0.2, 0]} />
      <Tree position={[-2.2, 0.24, -1.8]} scale={1.1} />
      <BuildingFullscreenPopup
        building={building}
        anomaly={topAnomaly}
        severityColor={highlightColor}
        position={[0, 4.8, 0]}
        visible={showLabels && isSelected}
      />
    </group>
  );
}

function CommunityHub({ position, isSelected, onSelect, building, showLabels, highlightColor, topAnomaly }) {
  const activeColor = isSelected && showLabels ? highlightColor : '#00f5d4';

  return (
    <group position={position} onClick={(e) => { e.stopPropagation(); onSelect('common_d'); }}>
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[6.4, 0.24, 6.4]} />
        <meshStandardMaterial
          color={isSelected && showLabels ? highlightColor : '#181e26'}
          emissive={isSelected && showLabels ? highlightColor : '#000000'}
          emissiveIntensity={isSelected && showLabels ? 0.45 : 0}
          roughness={0.8}
        />
      </mesh>
      <mesh position={[-0.7, 2.4, -0.3]} castShadow>
        <boxGeometry args={[3.0, 4.4, 3.0]} />
        <meshStandardMaterial
          color="#2d3642"
          emissive={isSelected && showLabels ? highlightColor : '#000000'}
          emissiveIntensity={isSelected && showLabels ? 0.25 : 0}
        />
      </mesh>
      <group position={[-0.7, 2.7, 1.22]}>
        <mesh><boxGeometry args={[0.35, 1.1, 0.08]} /><meshStandardMaterial color="#3e4a59" /></mesh>
        <mesh><boxGeometry args={[1.1, 0.35, 0.08]} /><meshStandardMaterial color="#3e4a59" /></mesh>
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
            <meshStandardMaterial color={activeColor} emissive={activeColor} emissiveIntensity={2.0} />
          </mesh>
        ))
      )}
      <BuildingFullscreenPopup
        building={building}
        anomaly={topAnomaly}
        severityColor={highlightColor}
        position={[0, 5.8, 0]}
        visible={showLabels && isSelected}
      />
    </group>
  );
}

function EVChargingHub({ position, isSelected, onSelect, building, showLabels, highlightColor, topAnomaly }) {
  const activeColor = isSelected && showLabels ? highlightColor : '#00f5d4';

  return (
    <group position={position} onClick={(e) => { e.stopPropagation(); onSelect('ev_station_e'); }}>
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[7.2, 0.24, 6.8]} />
        <meshStandardMaterial
          color={isSelected && showLabels ? highlightColor : '#181e26'}
          emissive={isSelected && showLabels ? highlightColor : '#000000'}
          emissiveIntensity={isSelected && showLabels ? 0.45 : 0}
          roughness={0.8}
        />
      </mesh>
      <GlowingSolarPanel position={[-0.6, 2.35, 0.4]} rotation={[0.12, 0, -0.15]} size={[4.4, 0.1, 3.6]} color={activeColor} />
      {[[-2.4, 1.2, -1.1], [1.2, 1.2, -1.1], [-2.4, 1.2, 1.9], [1.2, 1.2, 1.9]].map((pos, idx) => (
        <mesh key={idx} position={pos}>
          <cylinderGeometry args={[0.08, 0.08, 2.2, 8]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      ))}
      <GlowingSolarPanel position={[2.2, 1.95, -1.1]} rotation={[0.15, 0, -0.15]} size={[1.8, 0.08, 2.8]} color={activeColor} />
      {[-1.6, -0.5, 0.6].map((x, idx) => (
        <group key={idx}>
          <MiniCar position={[x, 0.24, 0.9]} rotation={[0, Math.PI / 2, 0]} glowing />
          <mesh position={[x, 0.55, -0.2]}>
            <boxGeometry args={[0.22, 0.65, 0.18]} />
            <meshStandardMaterial color={activeColor} emissive={activeColor} emissiveIntensity={1.6} />
          </mesh>
        </group>
      ))}
      <BuildingFullscreenPopup
        building={building}
        anomaly={topAnomaly}
        severityColor={highlightColor}
        position={[0, 4.4, 0]}
        visible={showLabels && isSelected}
      />
    </group>
  );
}

function CommercialHub({ position, isSelected, onSelect, building, showLabels, highlightColor, topAnomaly }) {
  const activeColor = isSelected && showLabels ? highlightColor : '#00f5d4';

  return (
    <group position={position} onClick={(e) => { e.stopPropagation(); onSelect('commercial_c'); }}>
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[6.8, 0.24, 5.4]} />
        <meshStandardMaterial
          color={isSelected && showLabels ? highlightColor : '#181e26'}
          emissive={isSelected && showLabels ? highlightColor : '#000000'}
          emissiveIntensity={isSelected && showLabels ? 0.45 : 0}
          roughness={0.8}
        />
      </mesh>
      <mesh position={[-0.8, 1.35, 0]} castShadow>
        <boxGeometry args={[3.5, 2.3, 3.2]} />
        <meshStandardMaterial
          color="#2b3440"
          emissive={isSelected && showLabels ? highlightColor : '#000000'}
          emissiveIntensity={isSelected && showLabels ? 0.25 : 0}
        />
      </mesh>
      <mesh position={[1.8, 1.15, -0.2]} castShadow>
        <boxGeometry args={[2.2, 1.9, 2.8]} />
        <meshStandardMaterial color="#232b35" />
      </mesh>
      <mesh position={[-0.8, 0.7, 1.62]}>
        <boxGeometry args={[3.2, 0.08, 0.04]} />
        <meshStandardMaterial color={activeColor} emissive={activeColor} emissiveIntensity={1.8} />
      </mesh>
      <BuildingFullscreenPopup
        building={building}
        anomaly={topAnomaly}
        severityColor={highlightColor}
        position={[0, 4.2, 0]}
        visible={showLabels && isSelected}
      />
    </group>
  );
}

function TownshipIsometricScene({ buildings, anomalies, selectedId, onSelect, showLabels }) {
  const getBuilding = (id) => buildings.find((b) => b.id === id);

  const getBuildingAnomalyInfo = (bId) => {
    const list = anomalies.filter((a) => a.building_id === bId);
    if (list.some((a) => a.severity === 'high')) {
      return { color: '#ef4444', topAnomaly: list.find((a) => a.severity === 'high') };
    }
    if (list.some((a) => a.severity === 'medium')) {
      return { color: '#f59e0b', topAnomaly: list.find((a) => a.severity === 'medium') };
    }
    if (list.length > 0) {
      return { color: '#10b981', topAnomaly: list[0] };
    }
    return { color: '#10b981', topAnomaly: null };
  };

  const condoInfo = getBuildingAnomalyInfo('condo_b');
  const terraceInfo = getBuildingAnomalyInfo('terrace_a');
  const commonInfo = getBuildingAnomalyInfo('common_d');
  const evInfo = getBuildingAnomalyInfo('ev_station_e');
  const commInfo = getBuildingAnomalyInfo('commercial_c');

  return (
    <group position={[-0.6, -1.2, 0]} rotation={[0, -Math.PI / 4.2, 0]}>
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
        onSelect={onSelect}
        building={getBuilding('condo_b')}
        showLabels={showLabels}
        highlightColor={condoInfo.color}
        topAnomaly={condoInfo.topAnomaly}
      />
      <TerraceHouseCluster
        position={[-7.6, 0, 0.6]}
        isSelected={selectedId === 'terrace_a'}
        onSelect={onSelect}
        building={getBuilding('terrace_a')}
        showLabels={showLabels}
        highlightColor={terraceInfo.color}
        topAnomaly={terraceInfo.topAnomaly}
      />
      <CommunityHub
        position={[-0.2, 0, 7.6]}
        isSelected={selectedId === 'common_d'}
        onSelect={onSelect}
        building={getBuilding('common_d')}
        showLabels={showLabels}
        highlightColor={commonInfo.color}
        topAnomaly={commonInfo.topAnomaly}
      />
      <EVChargingHub
        position={[7.6, 0, 6.8]}
        isSelected={selectedId === 'ev_station_e'}
        onSelect={onSelect}
        building={getBuilding('ev_station_e')}
        showLabels={showLabels}
        highlightColor={evInfo.color}
        topAnomaly={evInfo.topAnomaly}
      />
      <CommercialHub
        position={[7.6, 0, -0.6]}
        isSelected={selectedId === 'commercial_c'}
        onSelect={onSelect}
        building={getBuilding('commercial_c')}
        showLabels={showLabels}
        highlightColor={commInfo.color}
        topAnomaly={commInfo.topAnomaly}
      />
      <PowerLineCurve start={[-10.2, 1.8, 3.2]} end={[-4.8, 1.8, 3.2]} />
      <PowerLineCurve start={[4.4, 2.2, 1.8]} end={[10.5, 2.2, 1.8]} />
    </group>
  );
}

/* ============================================================================
   MAIN APPLICATION
   ============================================================================ */

const SAMPLE_PROMPTS = [
  "What's the total energy consumption across all buildings today?",
  "Are there any active anomalies in Block C?",
  "What happens if we add 50 kW of solar panels to the community center?",
  "Show me the water usage forecast for the next 24 hours.",
  "If we fix the detected leak in Zone B, how much water will we save per day?",
  "Compare energy consumption between residential and commercial zones."
];

export default function App() {
  const [activePage, setActivePage] = useState('home'); // 'home' | 'simulator' | 'anomaly' | 'assistant'
  const [is3DFullscreen, setIs3DFullscreen] = useState(false);
  const [dismissedToasts, setDismissedToasts] = useState([]);
  const [reviewedIds, setReviewedIds] = useState([]);
  const [expandedCard, setExpandedCard] = useState(null); // null | 'power' | 'water' | 'carbon'

  const [buildings, setBuildings] = useState(DEFAULT_BUILDINGS);
  const [selectedId, setSelectedId] = useState(null);
  const [chartBuildingId, setChartBuildingId] = useState('commercial_c');
  const [liveSparkline, setLiveSparkline] = useState(INITIAL_SPARKLINE);
  const [anomalies, setAnomalies] = useState([]);
  const [f1Metrics, setF1Metrics] = useState({});
  const [wsConnected, setWsConnected] = useState(false);

  const [expandedGraphData, setExpandedGraphData] = useState([]);
  const [loadingGraph, setLoadingGraph] = useState(false);

  // Simulator States
  const [simBuildingId, setSimBuildingId] = useState('commercial_c');
  const [scenarioType, setScenarioType] = useState('add_solar');
  const [solarKw, setSolarKw] = useState(50);
  const [panelArea, setPanelArea] = useState(250);
  const [evShiftPct, setEvShiftPct] = useState(60);
  const [leakReductionPct, setLeakReductionPct] = useState(35);
  const [scenarioResult, setScenarioResult] = useState(null);

  // Anomaly Page States
  const [severityFilter, setSeverityFilter] = useState('all');
  const [selectedAnomalyIdx, setSelectedAnomalyIdx] = useState(0);

  // Gemini AI Assistant States
  const [chatSessions, setChatSessions] = useState([
    {
      id: 'session-1',
      title: 'Township Overview',
      updatedAt: 'Now',
      messages: [
        {
          role: 'assistant',
          tools: [],
          text: "Hi! I'm Prismatic AI. How can I help you today?"
        }
      ]
    }
  ]);
  const [activeSessionId, setActiveSessionId] = useState('session-1');
  const [chatInput, setChatInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const chatEndRef = useRef(null);

  const currentSession = chatSessions.find((s) => s.id === activeSessionId) || chatSessions[0];
  useEffect(() => {
    if (activePage === 'assistant') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentSession?.messages, isAiTyping, activePage]);

  const markAnomalyReviewed = useCallback((item) => {
    if (!item) return;
    const key = getAnomalyKey(item);
    setReviewedIds((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }, []);

  const ingestTelemetry = useCallback((incomingBuildings) => {
    if (!incomingBuildings || incomingBuildings.length === 0) return;

    setBuildings((prev) =>
      prev.map((b) => {
        const match = incomingBuildings.find((x) => x.building_id === b.id || x.id === b.id);
        return match ? { ...b, ...match } : b;
      })
    );

    const totalKw = incomingBuildings.reduce((acc, b) => acc + (Number(b.current_kw) || 0), 0);
    const totalWater = incomingBuildings.reduce((acc, b) => acc + (Number(b.current_water_lph) || 0), 0);
    const totalCarbon = totalKw * MALAYSIA_CARBON_FACTOR;

    if (totalKw > 0) {
      setLiveSparkline((prev) => [
        ...prev.slice(-19),
        {
          t: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          kw: +totalKw.toFixed(1),
          water: +totalWater.toFixed(0),
          co2: +totalCarbon.toFixed(1)
        }
      ]);
    }
  }, []);

  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let isMounted = true;

    const loadInitialBackendData = async () => {
      try {
        const bRes = await fetch(`${API_BASE}/api/buildings`);
        if (bRes.ok) {
          const bData = await bRes.json();
          if (isMounted && bData.buildings) {
            ingestTelemetry(bData.buildings);
            setWsConnected(true);
          }
        }
      } catch {}

      try {
        const aRes = await fetch(`${API_BASE}/api/anomalies`);
        if (aRes.ok) {
          const aData = await aRes.json();
          if (isMounted) {
            if (aData.anomalies) setAnomalies(aData.anomalies);
            if (aData.metrics) setF1Metrics(aData.metrics);
          }
        }
      } catch {}
    };

    loadInitialBackendData();

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/buildings`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.buildings) {
            ingestTelemetry(data.buildings);
            setWsConnected(true);
          }
        }
      } catch {
        if (isMounted && (!ws || ws.readyState !== WebSocket.OPEN)) {
          setWsConnected(false);
        }
      }
    }, 5000);

    const connectWebSocket = () => {
      try {
        ws = new WebSocket(WS_URL);
        ws.onopen = () => {
          if (isMounted) setWsConnected(true);
        };
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'LIVE_TICK' && msg.buildings && isMounted) {
              ingestTelemetry(msg.buildings);
              setWsConnected(true);
            }
          } catch {}
        };
        ws.onclose = () => {
          if (isMounted) reconnectTimer = setTimeout(connectWebSocket, 3000);
        };
        ws.onerror = () => {
          if (ws) ws.close();
        };
      } catch {
        if (isMounted) reconnectTimer = setTimeout(connectWebSocket, 3000);
      }
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [ingestTelemetry]);

  // Load Historical + Forecast Ghost Line when KPI Card is expanded
  useEffect(() => {
    if (!expandedCard) return;
    setLoadingGraph(true);

    const resourceParam = expandedCard === 'water' ? 'water' : 'energy';

    Promise.all([
      fetch(`${API_BASE}/api/consumption/${chartBuildingId}?hours=24`).then((r) => r.json()),
      fetch(`${API_BASE}/api/forecast/${chartBuildingId}?horizon_hours=24&resource=${resourceParam}`).then((r) => r.json())
    ])
      .then(([histRes, fcRes]) => {
        const histList = (histRes.data || []).slice(-48);
        const fcList = (fcRes.forecast || []).slice(0, 48);
        const combined = [];

        histList.forEach((h, idx) => {
          let actualVal = h.consumption_kw;
          if (expandedCard === 'water') actualVal = h.water_lph;
          if (expandedCard === 'carbon') actualVal = +(h.consumption_kw * MALAYSIA_CARBON_FACTOR).toFixed(2);

          combined.push({
            time: h.time_short,
            fullTime: h.timestamp,
            actual: actualVal,
            forecast: idx === histList.length - 1 ? actualVal : null,
            upper: null,
            lower: null
          });
        });

        fcList.forEach((f) => {
          const factor = expandedCard === 'carbon' ? MALAYSIA_CARBON_FACTOR : 1;
          combined.push({
            time: f.time_short,
            fullTime: f.timestamp,
            actual: null,
            forecast: +(f.yhat * factor).toFixed(2),
            lower: +(f.yhat_lower * factor).toFixed(2),
            upper: +(f.yhat_upper * factor).toFixed(2)
          });
        });

        setExpandedGraphData(combined);
        setLoadingGraph(false);
      })
      .catch(() => setLoadingGraph(false));
  }, [expandedCard, chartBuildingId]);

  // Debounced Simulator API call
  useEffect(() => {
    const timer = setTimeout(() => {
      fetch(`${API_BASE}/api/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building_id: simBuildingId,
          scenario_type: scenarioType,
          capacity_kw: Number(solarKw),
          panel_area_m2: Number(panelArea),
          shift_percentage: Number(evShiftPct),
          leak_reduction_pct: Number(leakReductionPct)
        })
      })
        .then((r) => r.json())
        .then((d) => setScenarioResult(d))
        .catch(() => {});
    }, 180);

    return () => clearTimeout(timer);
  }, [simBuildingId, scenarioType, solarKw, panelArea, evShiftPct, leakReductionPct]);

  const filteredAnomalies = useMemo(
    () => anomalies.filter((a) => (severityFilter === 'all' ? true : a.severity === severityFilter)),
    [anomalies, severityFilter]
  );

  const activeAnomalyDetail = filteredAnomalies[selectedAnomalyIdx] || filteredAnomalies[0] || null;
  const detailTheme = getSeverityTheme(activeAnomalyDetail?.severity);

  // Automatically mark the currently inspected notification as reviewed when on the Anomaly page
  useEffect(() => {
    if (activePage === 'anomaly' && activeAnomalyDetail) {
      markAnomalyReviewed(activeAnomalyDetail);
    }
  }, [activePage, activeAnomalyDetail, markAnomalyReviewed]);

  const unreadAnomalyCount = anomalies.filter((a) => !reviewedIds.includes(getAnomalyKey(a))).length;

  const handleSendMessage = async (queryOverride) => {
    const q = (queryOverride || chatInput).trim();
    if (!q) return;

    setChatInput('');
    setIsAiTyping(true);

    setChatSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        const updatedTitle = s.messages.length <= 1 ? q.slice(0, 30) : s.title;
        return {
          ...s,
          title: updatedTitle,
          updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          messages: [...s.messages, { role: 'user', text: q, tools: [] }]
        };
      })
    );

    try {
      const res = await fetch(`${API_BASE}/api/assistant/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q })
      });
      const data = await res.json();

      setChatSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                messages: [
                  ...s.messages,
                  {
                    role: 'assistant',
                    text: data.answer,
                    tools: data.tools_called || []
                  }
                ]
              }
            : s
        )
      );
    } catch {
      setChatSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                messages: [
                  ...s.messages,
                  {
                    role: 'assistant',
                    tools: [],
                    text: 'Backend offline. Start uvicorn on port 8000.'
                  }
                ]
              }
            : s
        )
      );
    } finally {
      setIsAiTyping(false);
    }
  };

  const handleCreateNewChat = () => {
    const newId = `session-${Date.now()}`;
    setChatSessions((prev) => [
      {
        id: newId,
        title: 'New Chat',
        updatedAt: 'Now',
        messages: [{ role: 'assistant', tools: [], text: "Hi! I'm Prismatic AI. How can I help you today?" }]
      },
      ...prev
    ]);
    setActiveSessionId(newId);
  };

  const totalPowerKw = buildings.reduce((acc, b) => acc + (Number(b.current_kw) || 0), 0);
  const totalWaterLph = buildings.reduce((acc, b) => acc + (Number(b.current_water_lph) || 0), 0);
  const totalCarbonKg = totalPowerKw * MALAYSIA_CARBON_FACTOR;

  const visibleHomeAnomalies = anomalies.filter(
    (a) => !dismissedToasts.includes(getAnomalyKey(a))
  );

  const expandedMeta = {
    power: { title: 'Power Demand', unit: 'kW', color: '#00f5d4' },
    water: { title: 'Water Flow Rate', unit: 'L/h', color: '#22d3ee' },
    carbon: { title: 'Carbon Emission', unit: 'kg CO₂/h', color: '#10b981' }
  }[expandedCard || 'power'];

  const selectedSimBuilding = buildings.find((b) => b.id === simBuildingId) || buildings[0];

  const scenarioEffects = {
    add_solar: {
      heading: 'Rooftop Solar PV Generation',
      mechanism: `Generates clean daytime power from 06:00 to 18:00 (peaking between 10:00 and 14:00) across ${panelArea} m² on ${selectedSimBuilding?.name}.`,
      benefit: `Directly offsets grid electricity at RM 0.509/kWh and cuts carbon emissions by 0.585 kg CO₂ per kWh generated.`
    },
    shift_ev: {
      heading: 'EV Charging Load Redistribution',
      mechanism: `Reschedules ${evShiftPct}% of evening charging sessions (18:00–22:00) into the midday solar window (10:00–14:00).`,
      benefit: `60% of shifted daytime EV demand is absorbed directly by the township solar microgrid, lowering evening peak transformer stress.`
    },
    fix_leak: {
      heading: 'Subsurface Pipeline Leak Isolation',
      mechanism: `Isolates and repairs leaking supply valves to reduce nocturnal water loss by ${leakReductionPct}% in ${selectedSimBuilding?.name}.`,
      benefit: `Saves treated water at RM 2.28/m³ and reduces booster pump electricity consumption by 0.45 kWh per 1,000 Liters.`
    },
    precool: {
      heading: 'Thermal Mass Pre-Cooling',
      mechanism: `Pre-cools ${selectedSimBuilding?.name} between 10:00 and 13:00 (+8% load) and coasts chillers during peak hours (13:00–17:00).`,
      benefit: `Cuts afternoon peak HVAC demand by 20%, avoiding maximum demand tariff penalties.`
    }
  }[scenarioType];

  return (
    <>
      <style>{PRISMATIC_CSS}</style>
      <div className="prismatic-viewport">
        {/* ====================================================================
            3D DIGITAL TWIN CANVAS
            ==================================================================== */}
        <div className="canvas-layer">
          <Canvas shadows camera={{ position: [22, 17, 22], fov: 35 }} gl={{ antialias: true }}>
            <color attach="background" args={['#06090e']} />
            <fog attach="fog" args={['#06090e', 28, 64]} />
            <ambientLight intensity={0.58} />
            <directionalLight castShadow position={[18, 28, 14]} intensity={1.35} color="#e2f1ff" />
            <pointLight position={[0, 10, 0]} intensity={2.2} distance={22} color="#00f5d4" />
            <pointLight position={[7, 5, 7]} intensity={1.8} distance={18} color="#00f5d4" />
            <pointLight position={[-7, 5, 1]} intensity={1.4} distance={16} color="#00bbf9" />

            <TownshipIsometricScene
              buildings={buildings}
              anomalies={anomalies}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(id)}
              showLabels={is3DFullscreen}
            />

            <OrbitControls
              enablePan={true}
              enableZoom={true}
              maxPolarAngle={Math.PI / 2.2}
              minPolarAngle={Math.PI / 6}
              minDistance={12}
              maxDistance={45}
            />
          </Canvas>
        </div>

        {/* ====================================================================
            TOP NAVIGATION BAR
            ==================================================================== */}
        <header className={`top-nav ${is3DFullscreen && activePage === 'home' ? 'slide-out-top' : ''}`}>
          <div className="top-nav-left">
            <div
              className="brand-logo"
              onClick={() => {
                setActivePage('home');
                setIs3DFullscreen(false);
              }}
            >
              <svg width="34" height="34" viewBox="0 0 36 36" fill="none">
                <path d="M18 3L31 10.5V25.5L18 33L5 25.5V10.5L18 3Z" stroke="#00f5d4" strokeWidth="2.2" fill="rgba(0,245,212,0.12)" />
                <path d="M18 3L18 18M18 18L31 10.5M18 18L5 10.5" stroke="#00f5d4" strokeWidth="2" />
                <circle cx="18" cy="18" r="4" fill="#00f5d4" />
              </svg>
              <span className="brand-name">Prismatic</span>
            </div>

            <nav className="nav-pills">
              <button
                className={`nav-item ${activePage === 'home' ? 'active' : ''}`}
                onClick={() => setActivePage('home')}
              >
                <span className="nav-icon-box"><LayoutGrid size={16} /></span>
                <span>Home</span>
              </button>

              <button
                className={`nav-item ${activePage === 'simulator' ? 'active' : ''}`}
                onClick={() => setActivePage('simulator')}
              >
                <span className="nav-icon-box"><Zap size={16} /></span>
                <span>Simulator</span>
              </button>

              <button
                className={`nav-item ${activePage === 'anomaly' ? 'active' : ''}`}
                onClick={() => setActivePage('anomaly')}
              >
                <span className="nav-icon-box"><AlertTriangle size={16} /></span>
                <span>Anomaly</span>
                {unreadAnomalyCount > 0 && <span className="nav-badge">{unreadAnomalyCount}</span>}
              </button>

              <button
                className={`nav-item ${activePage === 'assistant' ? 'active' : ''}`}
                onClick={() => setActivePage('assistant')}
              >
                <span className="nav-icon-box"><Sparkles size={16} /></span>
                <span>AI Assistant</span>
              </button>
            </nav>
          </div>

          <div style={{ pointerEvents: 'auto' }}>
            <div
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                background: 'rgba(13, 32, 38, 0.85)',
                border: '1px solid rgba(0, 245, 212, 0.3)',
                fontSize: '0.78rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span
                className="status-dot"
                style={{
                  background: wsConnected ? '#00f5d4' : '#ef4444',
                  boxShadow: wsConnected ? '0 0 8px #00f5d4' : 'none'
                }}
              />
              <span>{wsConnected ? 'Online' : 'Offline'}</span>
            </div>
          </div>
        </header>

        {/* ====================================================================
            PAGE 1: HOME PAGE
            ==================================================================== */}
        {activePage === 'home' && (
          <>
            <div className={`home-left-col ${is3DFullscreen ? 'slide-out-left' : ''}`}>
              <div style={{ flexShrink: 0 }}>
                <h1 className="hero-title">Township<br />Twin</h1>
                <p className="hero-subtitle">
                  Real-time simulation. Smarter decisions.<br />
                  A sustainable tomorrow.
                </p>
              </div>

              {/* Scrollable Anomaly Notifications right under Subtitle with Top/Bottom Fade */}
              <div className="home-anomaly-scroll">
                {visibleHomeAnomalies.map((item, idx) => {
                  const theme = getSeverityTheme(item.severity);
                  const toastKey = getAnomalyKey(item);
                  return (
                    <div
                      key={toastKey || idx}
                      className="anomaly-toast-card"
                      style={{
                        background: `linear-gradient(135deg, ${theme.bg} 0%, rgba(10, 20, 26, 0.94) 100%)`,
                        border: `1px solid ${theme.border}`,
                        borderLeft: `4px solid ${theme.main}`
                      }}
                      onClick={() => {
                        markAnomalyReviewed(item);
                        const mainIdx = anomalies.findIndex(
                          (a) => getAnomalyKey(a) === toastKey
                        );
                        setSeverityFilter('all');
                        setSelectedAnomalyIdx(mainIdx >= 0 ? mainIdx : 0);
                        setActivePage('anomaly');
                      }}
                    >
                      <button
                        className="toast-close-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDismissedToasts((prev) => [...prev, toastKey]);
                        }}
                      >
                        <X size={11} />
                      </button>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <AlertTriangle size={14} color={theme.main} />
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: theme.main }}>
                          {item.severity}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ffffff' }}>
                        {item.type}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#cbd5e1', marginTop: 2 }}>
                        {item.building_name}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Icon-Only Button to Open 3D Digital Twin */}
              <button
                className="icon-only-circle-btn"
                onClick={() => {
                  setExpandedCard(null);
                  setIs3DFullscreen(true);
                }}
              >
                <Maximize2 size={17} />
              </button>
            </div>

            {/* Floating Exit Icon Button in 3D Fullscreen Mode */}
            {is3DFullscreen && (
              <div style={{ position: 'fixed', bottom: 32, left: 32, zIndex: 60, display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  className="icon-only-circle-btn"
                  onClick={() => {
                    setIs3DFullscreen(false);
                    setSelectedId(null);
                  }}
                >
                  <Minimize2 size={17} />
                </button>
                <div style={{ background: 'rgba(6, 18, 24, 0.85)', border: '1px solid rgba(0,245,212,0.3)', padding: '9px 16px', borderRadius: 999, fontSize: '0.78rem', color: '#cbd5e1' }}>
                  Drag to rotate • Scroll to zoom • Click any building to inspect
                </div>
              </div>
            )}

            {/* Right Column: 3 KPI Cards */}
            <aside className={`home-right-kpis ${is3DFullscreen ? 'slide-out-right' : ''}`}>
              <div className="kpi-glass-card">
                <div className="kpi-card-top">
                  <div className="kpi-title-group">
                    <div className="kpi-icon-circle"><Zap size={17} /></div>
                    <span className="kpi-title">Power Demand</span>
                  </div>
                  <button
                    className="expand-btn"
                    onClick={() => setExpandedCard(expandedCard === 'power' ? null : 'power')}
                  >
                    <ArrowUpRight size={15} />
                  </button>
                </div>

                <div className="kpi-metric-row">
                  <span className="kpi-number">{totalPowerKw.toFixed(1)}</span>
                  <span className="kpi-unit">kW</span>
                </div>

                <div className="kpi-sparkline">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={liveSparkline}>
                      <defs>
                        <linearGradient id="gradPower" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#00f5d4" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#00f5d4" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="kw" stroke="#00f5d4" strokeWidth={2.2} fill="url(#gradPower)" isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="kpi-glass-card">
                <div className="kpi-card-top">
                  <div className="kpi-title-group">
                    <div className="kpi-icon-circle"><Droplet size={17} /></div>
                    <span className="kpi-title">Water Flow Rate</span>
                  </div>
                  <button
                    className="expand-btn"
                    onClick={() => setExpandedCard(expandedCard === 'water' ? null : 'water')}
                  >
                    <ArrowUpRight size={15} />
                  </button>
                </div>

                <div className="kpi-metric-row">
                  <span className="kpi-number">{totalWaterLph.toFixed(0)}</span>
                  <span className="kpi-unit">L/h</span>
                </div>

                <div className="kpi-sparkline">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={liveSparkline}>
                      <defs>
                        <linearGradient id="gradWater" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="water" stroke="#22d3ee" strokeWidth={2.2} fill="url(#gradWater)" isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="kpi-glass-card">
                <div className="kpi-card-top">
                  <div className="kpi-title-group">
                    <div className="kpi-icon-circle"><Leaf size={17} /></div>
                    <span className="kpi-title">Carbon Emission</span>
                  </div>
                  <button
                    className="expand-btn"
                    onClick={() => setExpandedCard(expandedCard === 'carbon' ? null : 'carbon')}
                  >
                    <ArrowUpRight size={15} />
                  </button>
                </div>

                <div className="kpi-metric-row">
                  <span className="kpi-number">{totalCarbonKg.toFixed(1)}</span>
                  <span className="kpi-unit">kg CO₂/h</span>
                </div>

                <div className="kpi-sparkline">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={liveSparkline}>
                      <defs>
                        <linearGradient id="gradCarbon" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="co2" stroke="#10b981" strokeWidth={2.2} fill="url(#gradCarbon)" isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </aside>

            {/* Expanded Graph Modal */}
            {expandedCard && !is3DFullscreen && (
              <div className="expanded-chart-modal">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 12 }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#ffffff' }}>
                    {expandedMeta.title}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <select
                      value={chartBuildingId}
                      onChange={(e) => setChartBuildingId(e.target.value)}
                      style={{
                        background: '#0d2228',
                        color: '#00f5d4',
                        border: '1px solid rgba(0,245,212,0.4)',
                        borderRadius: 8,
                        padding: '6px 12px',
                        fontSize: '0.8rem'
                      }}
                    >
                      {buildings.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>

                    <button className="expand-btn" onClick={() => setExpandedCard(null)}>
                      <Minimize2 size={15} />
                    </button>
                  </div>
                </div>

                <div style={{ flex: 1, minHeight: 260 }}>
                  {loadingGraph ? (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                      Loading...
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={expandedGraphData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                        <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={11} unit={` ${expandedMeta.unit}`} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(6, 18, 24, 0.95)',
                            border: '1px solid #00f5d4',
                            borderRadius: 10,
                            fontSize: '0.8rem'
                          }}
                          formatter={(value, name) => [`${value} ${expandedMeta.unit}`, name]}
                          labelFormatter={(label, payload) =>
                            payload?.[0]?.payload?.fullTime ? payload[0].payload.fullTime : label
                          }
                        />
                        <Legend verticalAlign="top" height={32} />
                        <Area
                          type="monotone"
                          dataKey="actual"
                          name="Historical"
                          stroke={expandedMeta.color}
                          strokeWidth={2.5}
                          fill={expandedMeta.color}
                          fillOpacity={0.2}
                          dot={false}
                        />
                        <Area
                          type="monotone"
                          dataKey="forecast"
                          name="Forecast"
                          stroke="#cbd5e1"
                          strokeWidth={2}
                          strokeDasharray="6 6"
                          fill={expandedMeta.color}
                          fillOpacity={0.05}
                          dot={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ====================================================================
            PAGE 2: SIMULATOR PAGE (Full Height Grid + Scenario Impact Box)
            ==================================================================== */}
        {activePage === 'simulator' && (
          <div className="full-page-container">
            <div style={{ maxWidth: 1440, margin: '0 auto', height: '100%', display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20 }}>
              {/* Left Controls + Scenario Effect Summary */}
              <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>
                <div>
                  <label style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block', marginBottom: 6, fontWeight: 600 }}>
                    BUILDING
                  </label>
                  <select
                    value={simBuildingId}
                    onChange={(e) => setSimBuildingId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'rgba(6, 16, 22, 0.9)',
                      border: '1px solid rgba(0, 245, 212, 0.35)',
                      color: '#ffffff',
                      fontSize: '0.85rem'
                    }}
                  >
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block', marginBottom: 6, fontWeight: 600 }}>
                    SCENARIO
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { id: 'add_solar', title: 'Add Solar' },
                      { id: 'shift_ev', title: 'Shift EV' },
                      { id: 'fix_leak', title: 'Fix Leak' },
                      { id: 'precool', title: 'Pre-Cool' }
                    ].map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setScenarioType(item.id)}
                        style={{
                          padding: '11px',
                          borderRadius: 10,
                          cursor: 'pointer',
                          background: scenarioType === item.id ? 'rgba(0, 245, 212, 0.18)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${scenarioType === item.id ? '#00f5d4' : 'rgba(255,255,255,0.1)'}`,
                          color: '#ffffff',
                          fontSize: '0.84rem',
                          fontWeight: 600
                        }}
                      >
                        {item.title}
                      </button>
                    ))}
                  </div>
                </div>

                {scenarioType !== 'precool' && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
                    {scenarioType === 'add_solar' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 6 }}>
                            <span>Capacity</span>
                            <strong style={{ color: '#00f5d4' }}>{solarKw} kW</strong>
                          </div>
                          <input
                            type="range"
                            min="10"
                            max="250"
                            step="10"
                            value={solarKw}
                            onChange={(e) => {
                              setSolarKw(Number(e.target.value));
                              setPanelArea(Number(e.target.value) * 5);
                            }}
                            style={{ width: '100%', accentColor: '#00f5d4' }}
                          />
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 6 }}>
                            <span>Area</span>
                            <strong style={{ color: '#00f5d4' }}>{panelArea} m²</strong>
                          </div>
                          <input
                            type="range"
                            min="50"
                            max="1250"
                            step="25"
                            value={panelArea}
                            onChange={(e) => setPanelArea(Number(e.target.value))}
                            style={{ width: '100%', accentColor: '#00f5d4' }}
                          />
                        </div>
                      </div>
                    )}

                    {scenarioType === 'shift_ev' && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 6 }}>
                          <span>Shift Load</span>
                          <strong style={{ color: '#00f5d4' }}>{evShiftPct}%</strong>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="90"
                          step="5"
                          value={evShiftPct}
                          onChange={(e) => setEvShiftPct(Number(e.target.value))}
                          style={{ width: '100%', accentColor: '#00f5d4' }}
                        />
                      </div>
                    )}

                    {scenarioType === 'fix_leak' && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 6 }}>
                          <span>Leak Reduction</span>
                          <strong style={{ color: '#00f5d4' }}>{leakReductionPct}%</strong>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="70"
                          step="5"
                          value={leakReductionPct}
                          onChange={(e) => setLeakReductionPct(Number(e.target.value))}
                          style={{ width: '100%', accentColor: '#00f5d4' }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Scenario Effect Explanation Box filling the lower space */}
                <div
                  style={{
                    marginTop: 'auto',
                    background: 'rgba(0, 245, 212, 0.06)',
                    border: '1px solid rgba(0, 245, 212, 0.24)',
                    borderRadius: 14,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10
                  }}
                >
                  <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#00f5d4', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    How This Action Affects The Building
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ffffff' }}>
                    {scenarioEffects.heading}
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.55 }}>
                    {scenarioEffects.mechanism}
                  </p>
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
                    {scenarioEffects.benefit}
                  </p>
                </div>
              </div>

              {/* Right Results */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                  <div className="glass-panel" style={{ padding: 18 }}>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>MONTHLY SAVINGS</div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#00f5d4', marginTop: 6 }}>
                      RM {scenarioResult ? scenarioResult.monthly_cost_savings_rm : '0'}
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: 18 }}>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>CARBON SAVED</div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#10b981', marginTop: 6 }}>
                      {scenarioResult ? scenarioResult.daily_carbon_saved_kg : '0'} kg/d
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: 18 }}>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>PEAK REDUCTION</div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#22d3ee', marginTop: 6 }}>
                      -{scenarioResult ? scenarioResult.peak_reduction_pct : '0'}%
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: 18 }}>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>DAILY SAVED</div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#ffffff', marginTop: 6 }}>
                      {scenarioType === 'fix_leak'
                        ? `${scenarioResult?.daily_water_saved_liters || 0} L`
                        : `${scenarioResult?.daily_savings_kwh || 0} kWh`}
                    </div>
                  </div>
                </div>

                <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <div style={{ flex: 1 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={scenarioResult?.comparison_series || []} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                        <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={11} />
                        <Tooltip contentStyle={{ backgroundColor: '#07141a', border: '1px solid #00f5d4', borderRadius: 10 }} />
                        <Legend verticalAlign="top" height={30} />
                        <Area
                          type="monotone"
                          dataKey="baseline_kw"
                          name="Baseline"
                          stroke="#ef4444"
                          strokeWidth={2}
                          fill="rgba(239, 68, 68, 0.12)"
                        />
                        <Area
                          type="monotone"
                          dataKey="optimized_kw"
                          name="Optimized"
                          stroke="#00f5d4"
                          strokeWidth={2.5}
                          fill="rgba(0, 245, 212, 0.25)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            PAGE 3: ANOMALY PAGE (Full Height + Custom Dark Scroller + Detailed Info)
            ==================================================================== */}
        {activePage === 'anomaly' && (
          <div className="full-page-container">
            <div style={{ maxWidth: 1440, margin: '0 auto', height: '100%', display: 'grid', gridTemplateColumns: '400px 1fr', gap: 20 }}>
              {/* Left Column: Severity Filter Pills + Dark-Themed Notification Scroller */}
              <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16, height: '100%', minHeight: 0 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {['all', 'high', 'medium', 'low'].map((sev) => (
                    <button
                      key={sev}
                      onClick={() => {
                        setSeverityFilter(sev);
                        setSelectedAnomalyIdx(0);
                      }}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        borderRadius: 999,
                        border: `1px solid ${severityFilter === sev ? '#00f5d4' : 'rgba(255,255,255,0.12)'}`,
                        background: severityFilter === sev ? 'rgba(0,245,212,0.18)' : 'rgba(255,255,255,0.04)',
                        color: '#ffffff',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        textTransform: 'capitalize',
                        cursor: 'pointer'
                      }}
                    >
                      {sev}
                    </button>
                  ))}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4, minHeight: 0 }}>
                  {filteredAnomalies.map((item, idx) => {
                    const isSelected = idx === selectedAnomalyIdx;
                    const theme = getSeverityTheme(item.severity);
                    const isUnread = !reviewedIds.includes(getAnomalyKey(item));

                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setSelectedAnomalyIdx(idx);
                          markAnomalyReviewed(item);
                        }}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 12,
                          cursor: 'pointer',
                          background: isSelected ? theme.bg : 'rgba(15, 29, 36, 0.75)',
                          border: `1px solid ${isSelected ? theme.main : 'rgba(255,255,255,0.07)'}`,
                          borderLeft: `4px solid ${theme.main}`,
                          transition: '0.2s',
                          flexShrink: 0
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {isUnread && (
                              <span
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: '50%',
                                  background: theme.main,
                                  boxShadow: `0 0 8px ${theme.main}`
                                }}
                              />
                            )}
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff' }}>
                              {item.type}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.68rem', color: theme.main, fontWeight: 700, textTransform: 'uppercase' }}>
                            {item.severity}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#cbd5e1', marginTop: 4 }}>
                          {item.building_name}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 4 }}>
                          {item.timestamp}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Detail Panel Following Severity Color + Rich Diagnostic Info */}
              {activeAnomalyDetail ? (
                <div
                  className="glass-panel"
                  style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    background: `linear-gradient(145deg, ${detailTheme.bg} 0%, rgba(7, 17, 22, 0.94) 100%)`,
                    border: `1.5px solid ${detailTheme.border}`,
                    borderLeft: `6px solid ${detailTheme.main}`
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <div>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            borderRadius: 999,
                            background: detailTheme.bg,
                            border: `1px solid ${detailTheme.border}`,
                            color: detailTheme.main,
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            marginBottom: 10
                          }}
                        >
                          <ShieldAlert size={14} />
                          <span>{activeAnomalyDetail.severity} severity</span>
                        </div>
                        <h3 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                          {activeAnomalyDetail.type}
                        </h3>
                        <p style={{ fontSize: '0.92rem', color: '#cbd5e1', marginTop: 4 }}>
                          {activeAnomalyDetail.building_name}
                        </p>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>DETECTED AT</div>
                        <div style={{ fontSize: '0.9rem', color: '#ffffff', fontWeight: 600, marginTop: 2 }}>
                          {activeAnomalyDetail.timestamp}
                        </div>
                      </div>
                    </div>

                    {/* Key Metrics Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                      <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${detailTheme.border}`, padding: 16, borderRadius: 14 }}>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>MEASURED DEVIATION</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', marginTop: 6 }}>
                          {activeAnomalyDetail.detail}
                        </div>
                      </div>

                      <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${detailTheme.border}`, padding: 16, borderRadius: 14 }}>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>ISOLATION FOREST SCORE</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: detailTheme.main, marginTop: 6 }}>
                          {activeAnomalyDetail.anomaly_score}
                        </div>
                      </div>

                      <div style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${detailTheme.border}`, padding: 16, borderRadius: 14 }}>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>MODEL ACCURACY (F1 / PRECISION)</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#00f5d4', marginTop: 6 }}>
                          {f1Metrics[activeAnomalyDetail.building_id]?.f1_score || '0.90'} / {f1Metrics[activeAnomalyDetail.building_id]?.precision || '0.89'}
                        </div>
                      </div>
                    </div>

                    {/* Detailed Root Cause & Recommended Action Paragraphs */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 18 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: detailTheme.main, textTransform: 'uppercase', marginBottom: 8 }}>
                          Root Cause Analysis
                        </div>
                        <p style={{ fontSize: '0.84rem', color: '#e2e8f0', lineHeight: 1.6 }}>
                          {activeAnomalyDetail.type?.includes('Water')
                            ? `Continuous elevated water flow recorded in ${activeAnomalyDetail.building_name} during off-peak hours without a matching rise in electrical load. Cross-resource telemetry ratio confirms a subsurface supply pipe or valve leak rather than occupant usage.`
                            : `Sudden upward power surge detected in ${activeAnomalyDetail.building_name}. Rate-of-change telemetry indicates simultaneous HVAC chiller compressor staging and peak afternoon cooling demand exceeding baseline capacity.`}
                        </p>
                      </div>

                      <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 18 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#00f5d4', textTransform: 'uppercase', marginBottom: 8 }}>
                          Recommended Action
                        </div>
                        <p style={{ fontSize: '0.84rem', color: '#e2e8f0', lineHeight: 1.6 }}>
                          {activeAnomalyDetail.type?.includes('Water')
                            ? `Isolate the zone sub-meter valve in ${activeAnomalyDetail.building_name} and dispatch maintenance for acoustic pressure testing. Run the Fix Leak scenario in Simulator to estimate daily water and pumping energy recovery.`
                            : `Stagger commercial HVAC chiller start times and enable pre-cooling before 13:00. Open the Simulator to test thermal pre-cooling or rooftop solar offsetting for ${activeAnomalyDetail.building_name}.`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Icon-Only Action Buttons */}
                  <div style={{ display: 'flex', gap: 12, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <button
                      className="icon-only-circle-btn"
                      style={{ borderColor: detailTheme.main }}
                      onClick={() => {
                        setSimBuildingId(activeAnomalyDetail.building_id || 'condo_b');
                        setScenarioType(activeAnomalyDetail.type?.includes('Water') ? 'fix_leak' : 'precool');
                        setActivePage('simulator');
                      }}
                    >
                      <Zap size={17} />
                    </button>

                    <button
                      className="icon-only-circle-btn"
                      style={{ borderColor: detailTheme.main }}
                      onClick={() => {
                        setActivePage('assistant');
                        handleSendMessage(`Check ${activeAnomalyDetail.type} in ${activeAnomalyDetail.building_name}.`);
                      }}
                    >
                      <Sparkles size={17} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                  No notifications
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====================================================================
            PAGE 4: AI ASSISTANT PAGE
            ==================================================================== */}
        {activePage === 'assistant' && (
          <div className="full-page-container">
            <div className="gemini-layout">
              <aside className="gemini-sidebar">
                <button className="new-chat-btn" onClick={handleCreateNewChat}>
                  <Plus size={18} />
                  <span>New Chat</span>
                </button>

                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                  {chatSessions.map((sess) => (
                    <div
                      key={sess.id}
                      className={`chat-history-item ${sess.id === activeSessionId ? 'active' : ''}`}
                      onClick={() => setActiveSessionId(sess.id)}
                    >
                      <MessageSquare size={15} color="#00f5d4" />
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <div>{sess.title}</div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{sess.updatedAt}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </aside>

              <main className="gemini-main">
                <div className="gemini-messages">
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: '2rem', fontWeight: 700, background: 'linear-gradient(90deg, #00f5d4, #38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                      Hello
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                      {SAMPLE_PROMPTS.map((q, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSendMessage(q)}
                          style={{
                            padding: '8px 14px',
                            borderRadius: 999,
                            background: 'rgba(0, 245, 212, 0.08)',
                            border: '1px solid rgba(0, 245, 212, 0.28)',
                            color: '#e2e8f0',
                            fontSize: '0.78rem',
                            cursor: 'pointer'
                          }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>

                  {currentSession.messages.map((m, idx) =>
                    m.role === 'user' ? (
                      <div
                        key={idx}
                        style={{
                          alignSelf: 'flex-end',
                          background: 'rgba(0, 245, 212, 0.18)',
                          border: '1px solid rgba(0, 245, 212, 0.4)',
                          padding: '12px 18px',
                          borderRadius: '18px 18px 4px 18px',
                          maxWidth: '75%',
                          fontSize: '0.9rem',
                          lineHeight: 1.5
                        }}
                      >
                        {m.text}
                      </div>
                    ) : (
                      <div key={idx} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            background: 'rgba(0, 245, 212, 0.15)',
                            border: '1px solid #00f5d4',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}
                        >
                          <Sparkles size={16} color="#00f5d4" />
                        </div>
                        <div style={{ flex: 1, fontSize: '0.9rem', color: '#f1f5f9' }}>
                          {m.tools && m.tools.length > 0 && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                              {m.tools.map((t, tIdx) => (
                                <span
                                  key={tIdx}
                                  style={{
                                    fontFamily: 'monospace',
                                    fontSize: '0.7rem',
                                    background: 'rgba(0, 245, 212, 0.12)',
                                    border: '1px solid rgba(0, 245, 212, 0.35)',
                                    color: '#00f5d4',
                                    padding: '2px 8px',
                                    borderRadius: 6
                                  }}
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                          <div>{renderFormattedText(m.text)}</div>
                        </div>
                      </div>
                    )
                  )}

                  {isAiTyping && (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#00f5d4', fontSize: '0.85rem' }}>
                      <Sparkles size={16} />
                      <span>Thinking...</span>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                <div className="gemini-input-area">
                  <div className="gemini-prompt-box">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Ask a question..."
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        color: '#ffffff',
                        fontSize: '0.92rem'
                      }}
                    />
                    <button
                      onClick={() => handleSendMessage()}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: '#00f5d4',
                        border: 'none',
                        color: '#041214',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <Send size={15} />
                    </button>
                  </div>
                </div>
              </main>
            </div>
          </div>
        )}
      </div>
    </>
  );
}