import sqlite3
import pandas as pd
from simulator import BUILDINGS, TownshipSimulator

DB_PATH = "township.db"


def get_connection():
    return sqlite3.connect(DB_PATH, check_same_thread=False)


def init_database():
    """Creates tables and populates synthetic historical data on startup."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS buildings (
            id TEXT PRIMARY KEY,
            name TEXT,
            type TEXT,
            floors INTEGER,
            x REAL,
            z REAL,
            baseline_kw REAL,
            baseline_water_lph REAL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sensor_readings (
            building_id TEXT,
            timestamp TEXT,
            consumption_kw REAL,
            water_lph REAL,
            temperature_c REAL,
            injected_anomaly INTEGER
        )
    """)

    # Clear old demo data and insert fresh data up to the current minute
    cursor.execute("DELETE FROM buildings")
    cursor.execute("DELETE FROM sensor_readings")

    for b in BUILDINGS:
        cursor.execute(
            "INSERT INTO buildings VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                b["id"],
                b["name"],
                b["type"],
                b["floors"],
                b["x"],
                b["z"],
                b["baseline_kw"],
                b["baseline_water_lph"],
            ),
        )

    sim = TownshipSimulator()
    all_dfs = []
    for b in BUILDINGS:
        df = sim.generate_building_dataset(b, days=14)
        df["timestamp"] = df["timestamp"].dt.strftime("%Y-%m-%d %H:%M:%S")
        all_dfs.append(df)

    full_df = pd.concat(all_dfs, ignore_index=True)
    full_df.to_sql("sensor_readings", conn, if_exists="append", index=False)

    conn.commit()
    conn.close()
    print("✅ SQLite Database initialized with 14 days of synthetic IoT data.")


def fetch_building_dataframe(building_id: str, limit_rows: int = 672) -> pd.DataFrame:
    """Fetch recent readings for a building (672 rows = 7 days of 15-min data)."""
    conn = get_connection()
    query = """
        SELECT * FROM sensor_readings
        WHERE building_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
    """
    df = pd.read_sql_query(query, conn, params=(building_id, limit_rows))
    conn.close()
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    return df.sort_values("timestamp").reset_index(drop=True)

