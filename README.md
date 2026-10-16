# Prismatic Grid

> A live digital twin for smart, sustainable townships — built for the Sime Darby Property University Hackathon 2026.

## Overview

Prismatic Grid is a full-stack digital twin platform that ingests simulated IoT data from five building archetypes, detects anomalies using Isolation Forest, forecasts 24-hour energy and water demand with Prophet, and allows facility managers to simulate what-if sustainability scenarios (solar PV, EV charging shift, leak repair, pre-cooling) with real-time RM and CO2 impact.

The core message: **We built a live digital twin that lets Sime Darby Property catch water leaks in minutes instead of weeks, predict energy demand 24 hours ahead, and simulate what-if sustainability interventions before spending capital.**

## Features

- Live 3D township map with color-coded buildings (green = efficient, yellow = normal, red = anomaly)
- Real-time WebSocket stream every 5 seconds
- Anomaly detection with Isolation Forest (`contamination=0.04`, `n_estimators=120`)
- 24-hour demand forecasting with Prophet (with automatic seasonal fallback)
- What-If Scenario Simulator: solar PV, EV charging shift, leak repair, pre-cooling
- Natural-language AI assistant for facility managers
- Malaysia-specific constants: `0.585 kg CO2/kWh`, `RM 0.509/kWh`, `RM 2.28/1000L`

## Architecture

The system follows a five-layer architecture:

1. **Simulation Layer** (`simulator.py`) – generates 14 days of 15-minute synthetic IoT data for 5 buildings.
2. **Data Layer** (`database.py`) – SQLite storage for readings, metadata, and anomaly flags.
3. **Intelligence Layer** – `anomaly.py` (Isolation Forest), `forecaster.py` (Prophet), `optimizer.py` (What-If), `assistant.py` (NL routing).
4. **API Layer** (`main.py`) – FastAPI with 6 REST endpoints and 1 WebSocket (`/ws/live`).
5. **Presentation Layer** (`App.jsx`) – React + Three.js + Recharts dashboard.

## Building Archetypes

| ID | Name | Type | Baseline kW | Baseline L/h |
|----|------|------|-------------|--------------|
| terrace_a | Elmina Green Terrace Zone A | terrace | 12.0 | 180.0 |
| condo_b | Serenia Sky Residence (Block B) | condo | 85.0 | 1400.0 |
| commercial_c | Bukit Raja Commercial Hub (Block C) | commercial | 140.0 | 950.0 |
| common_d | Township Community Clubhouse & Park | common | 35.0 | 400.0 |
| ev_station_e | SDP Fast EV Charging Hub | ev | 50.0 | 20.0 |

## Tech Stack

- **Backend:** FastAPI, Uvicorn, scikit-learn, Prophet, pandas, numpy, SQLite
- **Frontend:** React 18, Vite, Three.js, @react-three/fiber, @react-three/drei, Recharts
- **Languages:** Python 3.11, JavaScript (ES6+)

## Installation

### Prerequisites

- Python 3.11
- Node.js 18+ and npm
- Git

### Backend Setup

1. Clone the repository: `git clone https://github.com/your-username/prismatic-grid.git`
2. Navigate to backend: `cd prismatic-grid/backend`
3. Create virtual environment: `python -m venv venv`
4. Activate: On Windows: `.\venv\Scripts\Activate`; On Mac/Linux: `source venv/bin/activate`
5. Install dependencies: `pip install -r requirements.txt`
6. Run server: `uvicorn main:app --reload --port 8000`
7. (Optional) Test API at `http://127.0.0.1:8000/docs`

### Frontend Setup

1. Open a new terminal, navigate to frontend: `cd prismatic-grid/frontend`
2. Install dependencies: `npm install`
3. Run dev server: `npm run dev`
4. Open `http://localhost:5173` in your browser.

## Usage

- The dashboard displays live KPI cards (total power, water flow, carbon intensity, simulated savings).
- Click any building in the 3D map to inspect its historical and forecasted consumption.
- Use the What-If Scenario Simulator to test solar PV capacity, EV charging shift percentage, leak repair, or pre-cooling. Results update instantly.
- The Anomaly Feed shows recent Isolation Forest detections with severity (low/medium/high).
- The AI Assistant accepts natural-language queries. Try: "Are there any active anomalies in Block C?" or "What happens if we add 50 kW of solar panels?"

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/buildings` | List all buildings with live readings |
| GET | `/api/consumption/{building_id}` | Historical energy and water data (hours param) |
| GET | `/api/forecast/{building_id}` | 24-hour Prophet forecast (energy or water) |
| GET | `/api/anomalies` | List detected anomalies and model F1 metrics |
| POST | `/api/simulate` | Run a What-If scenario (add_solar, shift_ev, fix_leak, precool) |
| POST | `/api/assistant/query` | Natural-language query routing |
| WS | `/ws/live` | WebSocket live stream of sensor data every 5 seconds |

## Project Structure

- `backend/` – Python FastAPI server, simulation, database, ML models, and assistant.
  - `simulator.py`, `database.py`, `anomaly.py`, `forecaster.py`, `optimizer.py`, `assistant.py`, `main.py`, `requirements.txt`
- `frontend/` – React + Vite dashboard.
  - `src/App.jsx`, `src/App.css`, `src/main.jsx`, `index.html`, `package.json`, `vite.config.js`
- `README.md` – This file.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- Sime Darby Property for the hackathon opportunity.
- Open-source community for FastAPI, React, Three.js, Prophet, scikit-learn.

## Team

- [Your Name] – Team Leader
- [Member 2]
- [Member 3]
- [Member 4]

## Contact

For questions, please email [your-email@example.com].
