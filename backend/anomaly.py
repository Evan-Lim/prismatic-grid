import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import precision_score, recall_score, f1_score


class AnomalyDetector:
    def __init__(self, contamination: float = 0.04):
        self.model = IsolationForest(
            n_estimators=120,
            contamination=contamination,
            random_state=42
        )
        self.scaler = StandardScaler()

    def prepare_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Engineer all 6 features from Table 3 of the technical paper."""
        features = pd.DataFrame(index=df.index)

        # 1. Rolling means (1h = 4 intervals, 6h = 24, 24h = 96)
        features["rolling_mean_1h"] = df["consumption_kw"].rolling(4).mean()
        features["rolling_mean_6h"] = df["consumption_kw"].rolling(24).mean()
        features["rolling_mean_24h"] = df["consumption_kw"].rolling(96).mean()
        features["water_rolling_6h"] = df["water_lph"].rolling(24).mean()

        # 2. Rate of change (detects sudden spikes/drops)
        features["rate_of_change_kw"] = df["consumption_kw"].diff()
        features["rate_of_change_water"] = df["water_lph"].diff()

        # 3. Time of day cyclical encoding (sin/cos)
        hour = df["timestamp"].dt.hour + df["timestamp"].dt.minute / 60.0
        features["hour_sin"] = np.sin(2 * np.pi * hour / 24.0)
        features["hour_cos"] = np.cos(2 * np.pi * hour / 24.0)

        # 4. Day of week
        features["day_of_week"] = df["timestamp"].dt.dayofweek

        # 5. Temperature
        features["temperature"] = df["temperature_c"]

        # 6. Cross-resource ratio (Energy / Water ratio anomalies)
        features["cross_resource_ratio"] = df["consumption_kw"] / (df["water_lph"] + 1.0)

        return features.dropna()

    def fit_and_detect(self, df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
        """Train Isolation Forest on building data and return detected anomalies & metrics."""
        features = self.prepare_features(df)
        scaled = self.scaler.fit_transform(features)

        self.model.fit(scaled)
        predictions = self.model.predict(scaled)  # -1 = anomaly, 1 = normal
        scores = self.model.decision_function(scaled)  # Lower = more severe

        result = df.loc[features.index].copy()
        result["anomaly"] = predictions
        result["anomaly_score"] = np.round(scores, 4)

        # Classify severity based on anomaly_score
        def get_severity(row):
            if row["anomaly"] == 1:
                return "normal"
            if row["anomaly_score"] < -0.12:
                return "high"
            elif row["anomaly_score"] < -0.05:
                return "medium"
            return "low"

        result["severity"] = result.apply(get_severity, axis=1)

        # Calculate validation metrics against injected anomalies (Section 4.2 & 7.1)
        y_true = result["injected_anomaly"].values
        y_pred = (result["anomaly"] == -1).astype(int).values

        metrics = {
            "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 3),
            "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 3),
            "f1_score": round(float(f1_score(y_true, y_pred, zero_division=0)), 3),
        }

        return result, metrics

