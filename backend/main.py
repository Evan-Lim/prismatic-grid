import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from simulator import BUILDINGS, TownshipSimulator
from database import init_database, fetch_building_dataframe
from anomaly import AnomalyDetector
from forecaster import DemandForecaster
from optimizer import ScenarioOptimizer
from assistant import answer_natural_language_query

app = FastAPI(
    title="Prismatic Grid API — Sime Darby Property Hackathon 2026",
    version="1.0.0"
)

# Allow React Frontend to talk to FastAPI Backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

simulator = TownshipSimulator()
forecaster = DemandForecaster()


@app.on_event("startup")
def on_startup():
    init_database()


class SimulateRequest(BaseModel):
    building_id: str = "commercial_c"
    scenario_type: str = "add_solar"  # add_solar | shift_ev | fix_leak | precool
    capacity_kw: float = 50.0
    panel_area_m2: float = 250.0
    shift_percentage: float = 60.0
    leak_reduction_pct: float = 35.0


class AssistantQueryRequest(BaseModel):
    query: str


# 1. GET /api/buildings
@app.get("/api/buildings")
def get_buildings():
    live_readings = {r["building_id"]: r for r in simulator.get_live_tick()}
    enriched = []
    for b in BUILDINGS:
        live = live_readings.get(b["id"], {})
        enriched.append({
            **b,
            "current_kw": live.get("current_kw", b["baseline_kw"]),
            "current_water_lph": live.get("current_water_lph", b["baseline_water_lph"]),
            "temperature_c": live.get("temperature_c", 30.0)
        })
    return {"buildings": enriched}


# 2. GET /api/consumption/{building_id}
@app.get("/api/consumption/{building_id}")
def get_consumption(building_id: str, hours: int = Query(24, ge=1, le=168)):
    intervals = hours * 4
    df = fetch_building_dataframe(building_id, limit_rows=intervals)
    records = [
        {
            "timestamp": row["timestamp"].strftime("%Y-%m-%d %H:%M"),
            "time_short": row["timestamp"].strftime("%H:%M"),
            "consumption_kw": float(row["consumption_kw"]),
            "water_lph": float(row["water_lph"]),
            "temperature_c": float(row["temperature_c"])
        }
        for _, row in df.iterrows()
    ]
    return {"building_id": building_id, "hours": hours, "data": records}


# 3. GET /api/forecast/{building_id}
@app.get("/api/forecast/{building_id}")
def get_forecast(
    building_id: str,
    horizon_hours: int = Query(24, ge=6, le=48),
    resource: str = Query("energy")
):
    value_col = "water_lph" if resource == "water" else "consumption_kw"
    df = fetch_building_dataframe(building_id, limit_rows=384)
    periods = horizon_hours * 4
    fc_df = forecaster.train_and_forecast(building_id, df, value_col=value_col, periods=periods)

    records = [
        {
            "timestamp": row["ds"].strftime("%Y-%m-%d %H:%M"),
            "time_short": row["ds"].strftime("%H:%M"),
            "yhat": float(row["yhat"]),
            "yhat_lower": float(row["yhat_lower"]),
            "yhat_upper": float(row["yhat_upper"])
        }
        for _, row in fc_df.iterrows()
    ]
    return {"building_id": building_id, "resource": resource, "forecast": records}


# 4. GET /api/anomalies
@app.get("/api/anomalies")
def get_anomalies(
    building_id: Optional[str] = None,
    severity: Optional[str] = None
):
    target_buildings = (
        [b for b in BUILDINGS if b["id"] == building_id]
        if building_id
        else BUILDINGS
    )

    all_alerts = []
    model_metrics = {}

    for b in target_buildings:
        df = fetch_building_dataframe(b["id"], limit_rows=288)
        detector = AnomalyDetector(contamination=0.04)
        res_df, metrics = detector.fit_and_detect(df)
        model_metrics[b["id"]] = metrics

        anom_rows = res_df[res_df["anomaly"] == -1].tail(6)
        for _, row in anom_rows.iterrows():
            sev = row["severity"]
            if severity and sev != severity:
                continue

            is_water_leak = row["water_lph"] > b["baseline_water_lph"] * 1.35
            alert_type = "Probable Water Leak" if is_water_leak else "Abnormal Power Spike"
            detail = (
                f"{row['water_lph']} L/h (Baseline: {b['baseline_water_lph']} L/h)"
                if is_water_leak
                else f"{row['consumption_kw']} kW (Baseline: {b['baseline_kw']} kW)"
            )

            all_alerts.append({
                "building_id": b["id"],
                "building_name": b["name"],
                "timestamp": row["timestamp"].strftime("%Y-%m-%d %H:%M"),
                "severity": sev,
                "type": alert_type,
                "detail": detail,
                "anomaly_score": float(row["anomaly_score"])
            })

    all_alerts.sort(key=lambda x: x["timestamp"], reverse=True)
    return {"anomalies": all_alerts[:15], "metrics": model_metrics}


# 5. POST /api/simulate
@app.post("/api/simulate")
def simulate_scenario(req: SimulateRequest):
    df = fetch_building_dataframe(req.building_id, limit_rows=192)
    opt = ScenarioOptimizer(df)

    if req.scenario_type == "add_solar":
        return opt.add_solar(capacity_kw=req.capacity_kw, panel_area_m2=req.panel_area_m2)
    elif req.scenario_type == "shift_ev":
        return opt.shift_ev_charging(shift_percentage=req.shift_percentage)
    elif req.scenario_type == "fix_leak":
        return opt.fix_detected_leak(leak_reduction_pct=req.leak_reduction_pct)
    else:
        return opt.precool_buildings()


# 6. POST /api/assistant/query
@app.post("/api/assistant/query")
def query_assistant(req: AssistantQueryRequest):
    return answer_natural_language_query(req.query)


# 7. WS /ws/live (Real-time sensor stream every 5 seconds)
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)


manager = ConnectionManager()


@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            live_data = simulator.get_live_tick()
            await websocket.send_json({"type": "LIVE_TICK", "buildings": live_data})
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        manager.disconnect(websocket)

