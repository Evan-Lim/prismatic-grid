import numpy as np
import pandas as pd
from datetime import datetime, timedelta

# The 5 MVP Buildings representing a Sime Darby Property Township
BUILDINGS = [
    {
        "id": "terrace_a",
        "name": "Elmina Green Terrace Zone A",
        "type": "terrace",
        "floors": 2,
        "x": -18,
        "z": -12,
        "baseline_kw": 12.0,
        "baseline_water_lph": 180.0
    },
    {
        "id": "condo_b",
        "name": "Serenia Sky Residence (Block B)",
        "type": "condo",
        "floors": 12,
        "x": -6,
        "z": 10,
        "baseline_kw": 85.0,
        "baseline_water_lph": 1400.0
    },
    {
        "id": "commercial_c",
        "name": "Bukit Raja Commercial Hub (Block C)",
        "type": "commercial",
        "floors": 4,
        "x": 12,
        "z": -8,
        "baseline_kw": 140.0,
        "baseline_water_lph": 950.0
    },
    {
        "id": "common_d",
        "name": "Township Community Clubhouse & Park",
        "type": "common",
        "floors": 2,
        "x": 0,
        "z": 0,
        "baseline_kw": 35.0,
        "baseline_water_lph": 400.0
    },
    {
        "id": "ev_station_e",
        "name": "SDP Fast EV Charging Hub",
        "type": "ev",
        "floors": 1,
        "x": 16,
        "z": 12,
        "baseline_kw": 50.0,
        "baseline_water_lph": 20.0
    }
]


class TownshipSimulator:
    def __init__(self, buildings: list = BUILDINGS, interval_minutes: int = 15):
        self.buildings = buildings
        self.interval = interval_minutes
        np.random.seed(42)  # Ensures reproducible demo data

    def _simulate_temperature(self, timestamps: pd.DatetimeIndex) -> np.ndarray:
        """
        Simulate Malaysian tropical temperature (24°C at night to 34°C at 2 PM).
        Formula uses a sine wave peaking at 14:00 (2 PM).
        """
        hour = (timestamps.hour + timestamps.minute / 60.0).to_numpy()
        # Peak around 14:00 (shift phase by 8 hours)
        daily_tempCycle = np.sin(2 * np.pi * (hour - 8) / 24.0)
        noise = np.random.normal(0, 0.6, len(timestamps))
        return np.round(29.0 + 4.5 * daily_tempCycle + noise, 2)

    def _daily_pattern(self, building_type: str, hour: np.ndarray) -> np.ndarray:
        """Return multiplier for time-of-day usage patterns."""
        if building_type in ["terrace", "condo"]:
            # Morning peak (7am-9am) and higher evening AC peak (6pm-11pm)
            return (
                0.6
                + 0.6 * np.exp(-((hour - 8.0) ** 2) / 2.5)
                + 0.9 * np.exp(-((hour - 20.5) ** 2) / 4.5)
            )
        elif building_type == "commercial":
            # High during business hours (9am - 6pm), low baseline at night
            is_business = ((hour >= 9) & (hour <= 18)).astype(float)
            ramp = np.exp(-((hour - 13.5) ** 2) / 18.0)
            return 0.25 + 0.85 * is_business * ramp
        elif building_type == "ev":
            # Spiky charging sessions mostly afternoon and evening
            return (
                0.2
                + 0.7 * np.exp(-((hour - 13.0) ** 2) / 3.0)
                + 1.1 * np.exp(-((hour - 19.0) ** 2) / 3.5)
            )
        else:
            # Common area (streetlights higher at night, clubhouse in day)
            night_lights = ((hour <= 6) | (hour >= 19)).astype(float) * 0.4
            return 0.8 + night_lights

    def _weekly_pattern(self, building_type: str, day_of_week: np.ndarray) -> np.ndarray:
        """
        Return multiplier for weekday (0-4) vs weekend (5-6).
        Residential is higher on weekends; commercial is lower on weekends.
        """
        is_weekend = (day_of_week >= 5).astype(float)
        if building_type in ["terrace", "condo"]:
            return 1.0 + 0.20 * is_weekend
        elif building_type == "commercial":
            return 1.0 - 0.55 * is_weekend
        return np.ones_like(day_of_week, dtype=float)

    def _inject_anomalies(
        self,
        energy_data: np.ndarray,
        water_data: np.ndarray,
        building_id: str
    ):
        """
        Inject controlled leaks and spikes so our Isolation Forest ML model
        and live demo have realistic anomalies to catch!
        """
        energy_data = np.asarray(energy_data, dtype=float).copy()
        water_data = np.asarray(water_data, dtype=float).copy()

        n = len(energy_data)
        injected_flags = np.zeros(n, dtype=int)

        # 1. Inject a severe nocturnal water leak in Condo Block B and Commercial Block C
        if building_id in ["condo_b", "commercial_c"]:
            leak_start = n - 140  # Starts ~35 hours ago and continues
            for i in range(leak_start, n - 20):
                water_data[i] *= 1.65 + 0.003 * (i - leak_start)
                injected_flags[i] = 1

        # 2. Inject sudden HVAC/equipment energy spikes across buildings
        for offset in [n - 220, n - 85, n - 12]:
            if offset > 0:
                energy_data[offset : offset + 4] *= 2.45
                injected_flags[offset : offset + 4] = 1

        return energy_data, water_data, injected_flags

    def generate_building_dataset(self, building: dict, days: int = 14) -> pd.DataFrame:
        """Generate 14 days of 15-minute interval energy and water data."""
        periods = days * 96  # 96 intervals of 15 mins per 24 hours
        end_time = datetime.now().replace(second=0, microsecond=0)
        start_time = end_time - timedelta(days=days)

        timestamps = pd.date_range(
            start=start_time, periods=periods, freq=f"{self.interval}min"
        )

        hour_of_day = (timestamps.hour + timestamps.minute / 60.0).to_numpy()
        day_of_week = timestamps.dayofweek.values

        daily_mult = self._daily_pattern(building["type"], hour_of_day)
        weekly_mult = self._weekly_pattern(building["type"], day_of_week)
        temperature = self._simulate_temperature(timestamps)

        # Weather effect: Air conditioning increases energy by 3.5% per °C above 28°C
        weather_factor = 1.0 + 0.035 * np.maximum(0, temperature - 28.0)

        noise_e = np.random.normal(1.0, 0.05, periods)
        noise_w = np.random.normal(1.0, 0.06, periods)

        energy_kw = (
            building["baseline_kw"]
            * daily_mult
            * weekly_mult
            * weather_factor
            * noise_e
        )
        water_lph = (
            building["baseline_water_lph"]
            * daily_mult
            * weekly_mult
            * noise_w
        )

        energy_kw, water_lph, injected_anomaly = self._inject_anomalies(
            energy_kw, water_lph, building["id"]
        )

        return pd.DataFrame({
            "building_id": building["id"],
            "timestamp": timestamps,
            "consumption_kw": np.round(np.maximum(0.1, energy_kw), 2),
            "water_lph": np.round(np.maximum(0.0, water_lph), 2),
            "temperature_c": temperature,
            "injected_anomaly": injected_anomaly
        })

    def get_live_tick(self) -> list:
        """
        Generates a single real-time reading for every building for the WebSocket stream.
        """
        now = datetime.now()
        hour = np.array([now.hour + now.minute / 60.0])
        temp = float(29.0 + 4.5 * np.sin(2 * np.pi * (hour[0] - 8) / 24.0))

        readings = []
        for b in self.buildings:
            mult = float(self._daily_pattern(b["type"], hour)[0])
            # Occasional live spike on Commercial C or Condo B for exciting live demo
            spike = 1.65 if (b["id"] == "commercial_c" and np.random.rand() < 0.25) else 1.0
            current_kw = round(b["baseline_kw"] * mult * np.random.uniform(0.92, 1.08) * spike, 2)
            current_water = round(b["baseline_water_lph"] * mult * np.random.uniform(0.90, 1.10) * spike, 2)

            readings.append({
                "building_id": b["id"],
                "name": b["name"],
                "timestamp": now.isoformat(),
                "current_kw": current_kw,
                "baseline_kw": b["baseline_kw"],
                "current_water_lph": current_water,
                "baseline_water_lph": b["baseline_water_lph"],
                "temperature_c": round(temp, 1)
            })
        return readings

