import numpy as np
import pandas as pd

try:
    from prophet import Prophet
    PROPHET_AVAILABLE = True
except Exception:
    PROPHET_AVAILABLE = False


class DemandForecaster:
    def __init__(self):
        self.models = {}

    def prepare_prophet_data(self, df: pd.DataFrame, value_col: str) -> pd.DataFrame:
        return pd.DataFrame({
            "ds": df["timestamp"],
            "y": df[value_col],
            "temperature_c": df["temperature_c"].values
        })

    def train_and_forecast(
        self,
        building_id: str,
        df: pd.DataFrame,
        value_col: str = "consumption_kw",
        periods: int = 96
    ) -> pd.DataFrame:
        """
        Trains Prophet on recent building data and forecasts next 24h (96 x 15-min intervals).
        """
        if PROPHET_AVAILABLE:
            try:
                prophet_df = self.prepare_prophet_data(df, value_col)
                model = Prophet(
                    daily_seasonality=True,
                    weekly_seasonality=True,
                    yearly_seasonality=False,
                    changepoint_prior_scale=0.05,
                    interval_width=0.95
                )
                model.add_regressor("temperature_c")
                model.fit(prophet_df)
                self.models[f"{building_id}_{value_col}"] = model

                future = model.make_future_dataframe(periods=periods, freq="15min")
                hour = future["ds"].dt.hour + future["ds"].dt.minute / 60.0
                future["temperature_c"] = 29.0 + 4.5 * np.sin(2 * np.pi * (hour - 8) / 24.0)

                forecast = model.predict(future)
                tail = forecast.tail(periods)[["ds", "yhat", "yhat_lower", "yhat_upper"]].copy()
                tail["yhat"] = np.round(np.maximum(0, tail["yhat"]), 2)
                tail["yhat_lower"] = np.round(np.maximum(0, tail["yhat_lower"]), 2)
                tail["yhat_upper"] = np.round(np.maximum(0, tail["yhat_upper"]), 2)
                return tail
            except Exception as e:
                print(f"Prophet fallback triggered: {e}")

        # Instant high-speed seasonal profile fallback if Stan compiler is unavailable
        last_time = df["timestamp"].max()
        future_dates = pd.date_range(
            start=last_time + pd.Timedelta(minutes=15),
            periods=periods,
            freq="15min"
        )
        recent_96 = df[value_col].tail(96).values
        reps = int(np.ceil(periods / 96))
        yhat = np.tile(recent_96, reps)[:periods]
        return pd.DataFrame({
            "ds": future_dates,
            "yhat": np.round(yhat, 2),
            "yhat_lower": np.round(yhat * 0.88, 2),
            "yhat_upper": np.round(yhat * 1.12, 2),
        })

