from pathlib import Path
import pickle

import matplotlib.pyplot as plt
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import IsolationForest
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


PROJECT_ROOT = Path(__file__).resolve().parents[1]
INPUT_FILE = PROJECT_ROOT / "data" / "experiments.csv"
RESULTS_FILE = PROJECT_ROOT / "data" / "anomaly_results.csv"
MODEL_FILE = PROJECT_ROOT / "ai" / "outputs" / "isolation_forest.pkl"
PLOT_FILE = PROJECT_ROOT / "ai" / "outputs" / "anomaly_scores.png"

NUMERIC_FEATURES = [
    "configuredFailureDuration",
    "actualRecoveryDuration",
    "totalRequests",
    "successfulRequests",
    "failedRequests",
    "errorRate",
    "averageResponseTime",
    "peakResponseTime",
    "injectedLatencyMilliseconds",
    "affectedServiceCount",
    "cascadingFailure",
]
CATEGORICAL_FEATURES = ["targetService", "failureType"]
REQUIRED_COLUMNS = NUMERIC_FEATURES[:-2] + [
    "affectedServices",
    "cascadingFailure",
    *CATEGORICAL_FEATURES,
    "experimentId",
]


def derive_affected_service_count(values: pd.Series) -> pd.Series:
    return values.fillna("").map(
        lambda value: len({service.strip() for service in str(value).split(";") if service.strip()})
    )


def build_feature_frame(dataframe: pd.DataFrame) -> pd.DataFrame:
    missing_columns = set(REQUIRED_COLUMNS) - set(dataframe.columns)
    if missing_columns:
        raise ValueError(f"Missing required columns: {sorted(missing_columns)}")

    features = dataframe.copy()
    features["affectedServiceCount"] = derive_affected_service_count(features["affectedServices"])
    features["cascadingFailure"] = features["cascadingFailure"].astype(bool).astype(int)
    return features


def build_pipeline() -> Pipeline:
    preprocessor = ColumnTransformer(
        transformers=[
            ("numeric", StandardScaler(), NUMERIC_FEATURES),
            (
                "categorical",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                CATEGORICAL_FEATURES,
            ),
        ]
    )
    model = IsolationForest(contamination=0.10, random_state=42)
    return Pipeline([
        ("preprocessor", preprocessor),
        ("isolation_forest", model),
    ])


def save_score_plot(results: pd.DataFrame) -> None:
    ordered = results.sort_values("anomalyScore").reset_index(drop=True)
    colors = ["#c0392b" if label == "ANOMALY" else "#2874a6" for label in ordered["anomalyLabel"]]

    plt.figure(figsize=(12, 6))
    plt.bar(range(len(ordered)), ordered["anomalyScore"], color=colors)
    plt.axhline(0, color="#333333", linewidth=0.8)
    plt.title("Isolation Forest Anomaly Scores")
    plt.xlabel("Experiment (sorted from most anomalous)")
    plt.ylabel("Anomaly score (lower is more anomalous)")
    plt.tight_layout()
    plt.savefig(PLOT_FILE, dpi=150)
    plt.close()


def main() -> None:
    dataframe = pd.read_csv(INPUT_FILE)
    feature_frame = build_feature_frame(dataframe)
    pipeline = build_pipeline()
    pipeline.fit(feature_frame)

    predictions = pipeline.predict(feature_frame)
    scores = pipeline.decision_function(feature_frame)
    results = dataframe[["experimentId", "targetService", "failureType"]].copy()
    results["actualRecoveryDuration"] = dataframe["actualRecoveryDuration"]
    results["errorRate"] = dataframe["errorRate"]
    results["averageResponseTime"] = dataframe["averageResponseTime"]
    results["peakResponseTime"] = dataframe["peakResponseTime"]
    results["injectedLatencyMilliseconds"] = dataframe["injectedLatencyMilliseconds"]
    results["affectedServiceCount"] = feature_frame["affectedServiceCount"]
    results["cascadingFailure"] = feature_frame["cascadingFailure"]
    results["anomalyLabel"] = ["ANOMALY" if value == -1 else "NORMAL" for value in predictions]
    results["anomalyScore"] = scores.round(6)

    MODEL_FILE.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with MODEL_FILE.open("wb") as model_file:
        pickle.dump(pipeline, model_file)
    results.to_csv(RESULTS_FILE, index=False)
    save_score_plot(results)

    anomaly_count = int((results["anomalyLabel"] == "ANOMALY").sum())
    total_count = len(results)
    top_columns = [
        "experimentId",
        "targetService",
        "failureType",
        "injectedLatencyMilliseconds",
        "actualRecoveryDuration",
        "errorRate",
        "averageResponseTime",
        "peakResponseTime",
        "affectedServiceCount",
        "cascadingFailure",
        "anomalyScore",
    ]
    top_anomalies = results.sort_values("anomalyScore").head(15)[top_columns]

    print(f"Total experiments: {total_count}")
    print(f"Normal: {total_count - anomaly_count}")
    print(f"Anomalies: {anomaly_count}")
    print(f"Anomaly percentage: {anomaly_count / total_count * 100:.2f}%")
    print("\nTOP 15 MOST ANOMALOUS REAL EXPERIMENTS")
    print(top_anomalies.to_string(index=False))
    print(f"\nSaved anomaly results: {RESULTS_FILE.relative_to(PROJECT_ROOT)}")
    print(f"Saved model: {MODEL_FILE.relative_to(PROJECT_ROOT)}")
    print(f"Saved plot: {PLOT_FILE.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
