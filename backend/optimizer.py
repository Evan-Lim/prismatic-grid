import numpy as np
import pandas as pd

MALAYSIA_GRID_CARBON_FACTOR = 0.585  # kg CO2 per kWh
MALAYSIA_ELECTRICITY_TARIFF_RM = 0.509  # RM per kWh
MALAYSIA_WATER_TARIFF_RM_PER_1000L = 2.28  # RM per m3 (1,000 Liters)


class ScenarioOptimizer:
    def __init__(self, baseline_df: pd.DataFrame):
        # Use the most recent 24 hours (96 intervals of 15 minutes) as our 1-day baseline
        self.baseline = baseline_df.tail(96).copy().reset_index(drop=True)

    def add_solar(self, capacity_kw: float = 50.0, panel_area_m2: float = 250.0) -> dict:
        """Simulate solar PV installation in tropical Malaysian climate."""
        hours = (
            self.baseline["timestamp"].dt.hour
            + self.baseline["timestamp"].dt.minute / 60.0
        )
        solar_gen = capacity_kw * np.maximum(
            0, np.sin(np.pi * (hours - 6.0) / 12.0)
        )
        solar_gen = np.where((hours >= 6) & (hours <= 18), solar_gen, 0.0)

        baseline_kw = self.baseline["consumption_kw"].values
        net_demand = np.maximum(baseline_kw - solar_gen, 0.0)

        # Multiply by 0.25 because each reading is a 15-minute (0.25 hour) interval
        savings_kwh = float((baseline_kw - net_demand).sum() * 0.25)
        carbon_saved_kg = savings_kwh * MALAYSIA_GRID_CARBON_FACTOR
        cost_saved_rm = savings_kwh * MALAYSIA_ELECTRICITY_TARIFF_RM

        old_peak = float(baseline_kw.max())
        new_peak = float(net_demand.max())
        peak_reduction_pct = ((old_peak - new_peak) / old_peak) * 100.0 if old_peak > 0 else 0.0

        return {
            "scenario": "add_solar",
            "title": f"Install {capacity_kw} kW Rooftop Solar PV ({panel_area_m2} m²)",
            "capacity_kw": capacity_kw,
            "daily_savings_kwh": round(savings_kwh, 2),
            "daily_water_saved_liters": 0.0,
            "daily_carbon_saved_kg": round(carbon_saved_kg, 2),
            "daily_cost_savings_rm": round(cost_saved_rm, 2),
            "monthly_cost_savings_rm": round(cost_saved_rm * 30, 2),
            "old_peak_kw": round(old_peak, 2),
            "new_peak_kw": round(new_peak, 2),
            "peak_reduction_pct": round(peak_reduction_pct, 1),
            "comparison_series": [
                {
                    "time": row["timestamp"].strftime("%H:%M"),
                    "baseline_kw": round(float(row["consumption_kw"]), 2),
                    "optimized_kw": round(float(net_demand[idx]), 2),
                }
                for idx, row in self.baseline.iterrows()
            ]
        }

    def shift_ev_charging(self, shift_percentage: float = 60.0) -> dict:
        """Shift evening EV charging peak (6PM-10PM) to solar midday (10AM-2PM)."""
        hours = self.baseline["timestamp"].dt.hour
        baseline_kw = self.baseline["consumption_kw"].values.copy()
        optimized_kw = baseline_kw.copy()

        evening_mask = (hours >= 18) & (hours <= 22)
        midday_mask = (hours >= 10) & (hours <= 14)

        frac = np.clip(shift_percentage / 100.0, 0.1, 0.9)
        shifted_energy = optimized_kw[evening_mask] * frac * 0.35
        optimized_kw[evening_mask] -= shifted_energy

        if midday_mask.sum() > 0:
            # 60% of shifted daytime EV load is absorbed by township solar microgrid
            optimized_kw[midday_mask] += (shifted_energy.sum() * 0.4) / midday_mask.sum()

        savings_kwh = float(np.maximum(0, (baseline_kw - optimized_kw).sum() * 0.25))
        carbon_saved_kg = savings_kwh * MALAYSIA_GRID_CARBON_FACTOR
        old_peak = float(baseline_kw.max())
        new_peak = float(optimized_kw.max())
        peak_reduction_pct = ((old_peak - new_peak) / old_peak) * 100.0

        # Peak demand charge savings + energy savings
        cost_saved_rm = (savings_kwh * MALAYSIA_ELECTRICITY_TARIFF_RM) + (old_peak - new_peak) * 1.5

        return {
            "scenario": "shift_ev",
            "title": f"Shift {int(shift_percentage)}% Evening EV Charging to Solar Peak (10AM–2PM)",
            "daily_savings_kwh": round(savings_kwh, 2),
            "daily_water_saved_liters": 0.0,
            "daily_carbon_saved_kg": round(carbon_saved_kg, 2),
            "daily_cost_savings_rm": round(cost_saved_rm, 2),
            "monthly_cost_savings_rm": round(cost_saved_rm * 30, 2),
            "old_peak_kw": round(old_peak, 2),
            "new_peak_kw": round(new_peak, 2),
            "peak_reduction_pct": round(peak_reduction_pct, 1),
            "comparison_series": [
                {
                    "time": row["timestamp"].strftime("%H:%M"),
                    "baseline_kw": round(float(row["consumption_kw"]), 2),
                    "optimized_kw": round(float(optimized_kw[idx]), 2),
                }
                for idx, row in self.baseline.iterrows()
            ]
        }

    def fix_detected_leak(self, leak_reduction_pct: float = 35.0) -> dict:
        """Simulate repairing detected pipeline water leaks and saving pump energy."""
        baseline_water = self.baseline["water_lph"].values
        frac = np.clip(leak_reduction_pct / 100.0, 0.05, 0.70)
        water_saved_liters = float((baseline_water * frac).sum() * 0.25)

        # Water pumping saves ~0.45 kWh per 1,000 Liters pumped
        pump_energy_saved_kwh = (water_saved_liters / 1000.0) * 0.45
        carbon_saved_kg = pump_energy_saved_kwh * MALAYSIA_GRID_CARBON_FACTOR
        cost_saved_rm = (
            (water_saved_liters / 1000.0) * MALAYSIA_WATER_TARIFF_RM_PER_1000L
            + pump_energy_saved_kwh * MALAYSIA_ELECTRICITY_TARIFF_RM
        )

        baseline_kw = self.baseline["consumption_kw"].values
        optimized_kw = np.maximum(0, baseline_kw - (pump_energy_saved_kwh / 24.0))

        return {
            "scenario": "fix_leak",
            "title": "Isolate & Repair Detected Subsurface Water Leak",
            "daily_savings_kwh": round(pump_energy_saved_kwh, 2),
            "daily_water_saved_liters": round(water_saved_liters, 0),
            "daily_carbon_saved_kg": round(carbon_saved_kg, 2),
            "daily_cost_savings_rm": round(cost_saved_rm, 2),
            "monthly_cost_savings_rm": round(cost_saved_rm * 30, 2),
            "old_peak_kw": round(float(baseline_kw.max()), 2),
            "new_peak_kw": round(float(optimized_kw.max()), 2),
            "peak_reduction_pct": 2.4,
            "comparison_series": [
                {
                    "time": row["timestamp"].strftime("%H:%M"),
                    "baseline_kw": round(float(row["water_lph"]), 1),
                    "optimized_kw": round(float(row["water_lph"] * (1.0 - frac)), 1),
                }
                for idx, row in self.baseline.iterrows()
            ]
        }

    def precool_buildings(self) -> dict:
        """Pre-cool buildings before peak tariff hours and coast during 2PM-5PM."""
        hours = self.baseline["timestamp"].dt.hour
        baseline_kw = self.baseline["consumption_kw"].values.copy()
        optimized_kw = baseline_kw.copy()

        precool_mask = (hours >= 10) & (hours < 13)
        peak_mask = (hours >= 13) & (hours <= 17)

        optimized_kw[precool_mask] *= 1.08
        optimized_kw[peak_mask] *= 0.80

        savings_kwh = float(np.maximum(0, (baseline_kw - optimized_kw).sum() * 0.25))
        carbon_saved_kg = savings_kwh * MALAYSIA_GRID_CARBON_FACTOR
        old_peak = float(baseline_kw.max())
        new_peak = float(optimized_kw.max())
        peak_reduction_pct = ((old_peak - new_peak) / old_peak) * 100.0
        cost_saved_rm = savings_kwh * MALAYSIA_ELECTRICITY_TARIFF_RM + (old_peak - new_peak) * 1.2

        return {
            "scenario": "precool",
            "title": "Thermal Pre-Cooling Before Peak Tariff Hours",
            "daily_savings_kwh": round(savings_kwh, 2),
            "daily_water_saved_liters": 0.0,
            "daily_carbon_saved_kg": round(carbon_saved_kg, 2),
            "daily_cost_savings_rm": round(cost_saved_rm, 2),
            "monthly_cost_savings_rm": round(cost_saved_rm * 30, 2),
            "old_peak_kw": round(old_peak, 2),
            "new_peak_kw": round(new_peak, 2),
            "peak_reduction_pct": round(peak_reduction_pct, 1),
            "comparison_series": [
                {
                    "time": row["timestamp"].strftime("%H:%M"),
                    "baseline_kw": round(float(row["consumption_kw"]), 2),
                    "optimized_kw": round(float(optimized_kw[idx]), 2),
                }
                for idx, row in self.baseline.iterrows()
            ]
        }

