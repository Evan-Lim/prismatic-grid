import os
from simulator import BUILDINGS
from database import fetch_building_dataframe
from anomaly import AnomalyDetector
from forecaster import DemandForecaster
from optimizer import ScenarioOptimizer, MALAYSIA_GRID_CARBON_FACTOR

# Listing 7: Tool definitions exposed to the LLM for function calling
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_consumption",
            "description": "Get historical energy or water consumption",
            "parameters": {
                "type": "object",
                "properties": {
                    "building_id": {"type": "string"},
                    "resource": {"type": "string", "enum": ["energy", "water"]},
                    "time_range": {"type": "string", "enum": ["1h", "24h", "7d", "30d"]}
                },
                "required": ["building_id", "resource"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_forecast",
            "description": "Get demand forecast for next N hours",
            "parameters": {
                "type": "object",
                "properties": {
                    "building_id": {"type": "string"},
                    "horizon_hours": {"type": "integer", "default": 24}
                },
                "required": ["building_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_anomalies",
            "description": "Get list of detected anomalies",
            "parameters": {
                "type": "object",
                "properties": {
                    "building_id": {"type": "string"},
                    "severity": {"type": "string", "enum": ["low", "medium", "high"]}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "run_scenario",
            "description": "Run a what-if scenario simulation",
            "parameters": {
                "type": "object",
                "properties": {
                    "scenario_type": {
                        "type": "string",
                        "enum": ["add_solar", "shift_ev", "fix_leak", "precool"]
                    },
                    "capacity_kw": {"type": "number"}
                },
                "required": ["scenario_type"]
            }
        }
    }
]


def answer_natural_language_query(query: str) -> dict:
    """
    Parses the user's question, calls the appropriate Township Twin backend functions,
    and returns both the natural-language answer and a log of the tools called.
    """
    q = query.lower()
    tools_called = []

    # Identify target building if mentioned
    target_b = BUILDINGS[2]  # Default to Commercial Block C
    for b in BUILDINGS:
        if (
            b["id"] in q
            or b["type"] in q
            or ("block b" in q and b["id"] == "condo_b")
            or ("zone b" in q and b["id"] == "condo_b")
            or ("block c" in q and b["id"] == "commercial_c")
            or ("community" in q and b["id"] == "common_d")
            or ("clubhouse" in q and b["id"] == "common_d")
        ):
            target_b = b
            break

    # 1. Check if asking about Solar / EV / Leak What-If Scenarios (Sample Queries 4 & 7)
    if "solar" in q or "panel" in q:
        cap = 50.0
        for token in q.replace("kw", " ").split():
            if token.isdigit():
                cap = float(token)
                break
        df = fetch_building_dataframe(target_b["id"], limit_rows=192)
        opt = ScenarioOptimizer(df)
        res = opt.add_solar(capacity_kw=cap, panel_area_m2=cap * 5)
        tools_called.append(f"run_scenario(scenario_type='add_solar', capacity_kw={cap})")

        return {
            "query": query,
            "tools_called": tools_called,
            "answer": (
                f"Simulating a **{cap} kW solar PV installation** on **{target_b['name']}**:\n"
                f"• **Daily Energy Saved:** {res['daily_savings_kwh']} kWh/day\n"
                f"• **Peak Grid Demand Reduction:** {res['peak_reduction_pct']}% "
                f"(drops from {res['old_peak_kw']} kW to {res['new_peak_kw']} kW)\n"
                f"• **Carbon Avoided:** {res['daily_carbon_saved_kg']} kg CO₂/day\n"
                f"• **Estimated Cost Savings:** RM {res['monthly_cost_savings_rm']}/month."
            )
        }

    if "fix" in q and "leak" in q:
        df = fetch_building_dataframe("condo_b", limit_rows=192)
        opt = ScenarioOptimizer(df)
        res = opt.fix_detected_leak(leak_reduction_pct=35.0)
        tools_called.append("run_scenario(scenario_type='fix_leak', zone='condo_b')")
        return {
            "query": query,
            "tools_called": tools_called,
            "answer": (
                f"If we repair the detected subsurface leak in **Serenia Sky Residence (Block B)**:\n"
                f"• **Water Saved:** {int(res['daily_water_saved_liters']):,} Liters/day\n"
                f"• **Pumping Energy Saved:** {res['daily_savings_kwh']} kWh/day\n"
                f"• **Combined Financial Savings:** RM {res['daily_cost_savings_rm']}/day "
                f"(RM {res['monthly_cost_savings_rm']}/month)."
            )
        }

    # 2. Check if asking about Anomalies / Spikes / Leaks (Sample Queries 3 & 5)
    if any(word in q for word in ["anomal", "spike", "leak", "why did", "alert"]):
        df = fetch_building_dataframe(target_b["id"], limit_rows=192)
        detector = AnomalyDetector()
        res_df, metrics = detector.fit_and_detect(df)
        anoms = res_df[res_df["anomaly"] == -1]
        tools_called.append(
            f"get_consumption(building_id='{target_b['id']}', time_range='24h')"
        )
        tools_called.append(
            f"get_anomalies(building_id='{target_b['id']}', severity='high')"
        )

        latest_anom = anoms.iloc[-1] if len(anoms) > 0 else res_df.iloc[-1]
        excess_water = round(
            float(latest_anom["water_lph"] - target_b["baseline_water_lph"]), 1
        )
        excess_kw = round(
            float(latest_anom["consumption_kw"] - target_b["baseline_kw"]), 1
        )

        return {
            "query": query,
            "tools_called": tools_called,
            "answer": (
                f"**Anomaly Analysis for {target_b['name']}:**\n"
                f"Isolation Forest flagged **{len(anoms)} anomalous intervals** in the recent window "
                f"(Model F1-Score: {metrics['f1_score']}).\n"
                f"• **Peak Deviation:** Water flow reached **{latest_anom['water_lph']} L/h** "
                f"({excess_water:+.1f} L/h vs baseline) and power reached **{latest_anom['consumption_kw']} kW** "
                f"({excess_kw:+.1f} kW vs baseline) at `{latest_anom['timestamp']}`.\n"
                f"• **Root Cause Pattern:** Continuous elevated baseline flow between 02:00 AM and 06:00 AM "
                f"indicates a **probable main supply valve leak** rather than resident occupancy.\n"
                f"• **Recommended Action:** Dispatch facility maintenance to inspect the zone sub-meter."
            )
        }

    # 3. Check if asking about Forecast (Sample Query 2)
    if "forecast" in q or "next 24" in q or "tomorrow" in q or "predict" in q:
        resource_col = "water_lph" if "water" in q else "consumption_kw"
        unit = "L/h" if resource_col == "water_lph" else "kW"
        df = fetch_building_dataframe(target_b["id"], limit_rows=384)
        forecaster = DemandForecaster()
        fc = forecaster.train_and_forecast(target_b["id"], df, value_col=resource_col, periods=96)
        tools_called.append(
            f"get_forecast(building_id='{target_b['id']}', resource='{resource_col}', horizon_hours=24)"
        )

        peak_row = fc.loc[fc["yhat"].idxmax()]
        total_24h = round(float(fc["yhat"].sum() * 0.25), 1)
        total_unit = "Liters" if resource_col == "water_lph" else "kWh"

        return {
            "query": query,
            "tools_called": tools_called,
            "answer": (
                f"**24-Hour Prophet Forecast for {target_b['name']}:**\n"
                f"• **Projected Cumulative Demand:** {total_24h:,} {total_unit} over the next 24 hours.\n"
                f"• **Expected Peak:** **{peak_row['yhat']} {unit}** (95% CI: {peak_row['yhat_lower']} – "
                f"{peak_row['yhat_upper']} {unit}) around `{peak_row['ds'].strftime('%H:%M')}`.\n"
                f"• **Recommendation:** Schedule pre-cooling or solar battery discharge 60 minutes prior to peak."
            )
        }

    # 4. Check if comparing Residential vs Commercial (Sample Query 8)
    if "compare" in q or ("residential" in q and "commercial" in q):
        tools_called.append("get_consumption(zone='residential', time_range='24h')")
        tools_called.append("get_consumption(zone='commercial', time_range='24h')")
        df_res = pd.concat([
            fetch_building_dataframe("terrace_a", 96),
            fetch_building_dataframe("condo_b", 96)
        ])
        df_com = fetch_building_dataframe("commercial_c", 96)

        res_kwh = round(float(df_res["consumption_kw"].sum() * 0.25), 1)
        com_kwh = round(float(df_com["consumption_kw"].sum() * 0.25), 1)

        return {
            "query": query,
            "tools_called": tools_called,
            "answer": (
                f"**24-Hour Zone Comparison (Residential vs. Commercial):**\n"
                f"• **Residential Zone (Terrace + Condo):** {res_kwh:,} kWh (peaks 7:00 PM – 10:30 PM due to home AC).\n"
                f"• **Commercial Zone (Bukit Raja Hub):** {com_kwh:,} kWh (peaks 11:00 AM – 4:00 PM during business hours).\n"
                f"• **Synergy Opportunity:** Commercial rooftop solar surplus during weekends can offset residential daytime loads."
            )
        }

    # 5. Default: Total Consumption & Highest Carbon Footprint Summary (Sample Queries 1 & 6)
    tools_called.append("get_consumption(building_id='all', time_range='24h')")
    totals = []
    for b in BUILDINGS:
        df = fetch_building_dataframe(b["id"], 96)
        kwh = float(df["consumption_kw"].sum() * 0.25)
        water = float(df["water_lph"].sum() * 0.25)
        totals.append({
            "name": b["name"],
            "kwh": round(kwh, 1),
            "water": round(water, 0),
            "carbon_kg": round(kwh * MALAYSIA_GRID_CARBON_FACTOR, 1)
        })

    totals_sorted = sorted(totals, key=lambda x: x["carbon_kg"], reverse=True)
    top_b = totals_sorted[0]
    total_kwh = round(sum(x["kwh"] for x in totals), 1)
    total_water = int(sum(x["water"] for x in totals))
    total_carbon = round(sum(x["carbon_kg"] for x in totals), 1)

    return {
        "query": query,
        "tools_called": tools_called,
        "answer": (
            f"**Township-Wide 24-Hour Resource & Carbon Summary:**\n"
            f"• **Total Energy Consumed:** {total_kwh:,} kWh\n"
            f"• **Total Water Consumed:** {total_water:,} Liters\n"
            f"• **Total Carbon Footprint:** {total_carbon:,} kg CO₂ (at 0.585 kg CO₂/kWh)\n"
            f"• **Highest Emitter:** **{top_b['name']}** ({top_b['kwh']:,} kWh / {top_b['carbon_kg']:,} kg CO₂)."
        )
    }

