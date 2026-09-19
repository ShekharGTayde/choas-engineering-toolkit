from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]
EXPERIMENTS_FILE = PROJECT_ROOT / "data" / "experiments.csv"
ANOMALY_FILE = PROJECT_ROOT / "data" / "anomaly_results.csv"
RESULTS_FILE = PROJECT_ROOT / "data" / "resilience_results.csv"
PLOT_FILE = PROJECT_ROOT / "ai" / "outputs" / "resilience_scores.png"

WEIGHTS = {
    "errorRate": 0.30,
    "actualRecoveryDuration": 0.20,
    "averageResponseTime": 0.15,
    "peakResponseTime": 0.10,
    "affectedServiceCount": 0.10,
    "cascadingFailure": 0.10,
    "injectedLatencyMilliseconds": 0.05,
}
REQUIRED_COLUMNS = [
    "experimentId",
    "failureType",
    "affectedServices",
    "cascadingFailure",
    "errorRate",
    "actualRecoveryDuration",
    "averageResponseTime",
    "peakResponseTime",
    "injectedLatencyMilliseconds",
]


def min_max_normalize(values: pd.Series) -> pd.Series:
    minimum = values.min()
    maximum = values.max()
    if maximum == minimum:
        return pd.Series(0.0, index=values.index)
    return (values - minimum) / (maximum - minimum)


def load_data() -> pd.DataFrame:
    experiments = pd.read_csv(EXPERIMENTS_FILE)
    anomalies = pd.read_csv(ANOMALY_FILE)
    missing_columns = set(REQUIRED_COLUMNS) - set(experiments.columns)
    if missing_columns:
        raise ValueError(f"Missing required columns: {sorted(missing_columns)}")
    if anomalies["experimentId"].duplicated().any():
        raise ValueError("Duplicate experiment IDs found in anomaly_results.csv")

    anomaly_columns = anomalies[["experimentId", "anomalyLabel", "anomalyScore"]]
    data = experiments.merge(anomaly_columns, on="experimentId", how="inner", validate="one_to_one")
    if len(data) != len(experiments):
        raise ValueError("Anomaly results do not contain exactly one result for every experiment")
    return data


def calculate_scores(data: pd.DataFrame) -> pd.DataFrame:
    scored = data.copy()
    scored["affectedServiceCount"] = scored["affectedServices"].fillna("").map(
        lambda value: len({service.strip() for service in str(value).split(";") if service.strip()})
    )
    scored["cascadingFailure"] = scored["cascadingFailure"].astype(bool).astype(float)

    normalized = {}
    for column in WEIGHTS:
        values = pd.to_numeric(scored[column], errors="raise")
        normalized[column] = min_max_normalize(values)

    latency_mask = scored["failureType"].eq("latency")
    normalized["injectedLatencyMilliseconds"] = normalized["injectedLatencyMilliseconds"].where(
        latency_mask,
        0.0,
    )

    scored["resilienceScore"] = sum(
        normalized[column] * weight for column, weight in WEIGHTS.items()
    ).mul(100).round(2)

    thresholds = {
        "medium": float(scored["resilienceScore"].quantile(0.50)),
        "high": float(scored["resilienceScore"].quantile(0.80)),
        "critical": float(scored["resilienceScore"].quantile(0.95)),
    }

    def risk_level(score: float) -> str:
        if score >= thresholds["critical"]:
            return "CRITICAL"
        if score >= thresholds["high"]:
            return "HIGH"
        if score >= thresholds["medium"]:
            return "MEDIUM"
        return "LOW"

    scored["riskLevel"] = scored["resilienceScore"].map(risk_level)
    return scored, thresholds


def save_plot(results: pd.DataFrame) -> None:
    ordered = results.sort_values("resilienceScore", ascending=False).reset_index(drop=True)
    colors = {
        "LOW": "#2e8b57",
        "MEDIUM": "#d4ac0d",
        "HIGH": "#e67e22",
        "CRITICAL": "#c0392b",
    }
    plt.figure(figsize=(12, 6))
    plt.bar(
        range(len(ordered)),
        ordered["resilienceScore"],
        color=[colors[level] for level in ordered["riskLevel"]],
    )
    plt.axhline(0, color="#333333", linewidth=0.8)
    plt.title("Resilience Risk Scores")
    plt.xlabel("Experiment (sorted from highest risk)")
    plt.ylabel("Resilience risk score (0-100)")
    plt.tight_layout()
    plt.savefig(PLOT_FILE, dpi=150)
    plt.close()


def main() -> None:
    data = load_data()
    scored, thresholds = calculate_scores(data)
    output_columns = [
        "experimentId",
        "anomalyLabel",
        "anomalyScore",
        "resilienceScore",
        "riskLevel",
    ]
    results = scored[output_columns]
    results.to_csv(RESULTS_FILE, index=False)
    save_plot(results)

    summary = results.groupby("riskLevel", sort=False).agg(
        experimentCount=("experimentId", "count"),
        averageResilienceScore=("resilienceScore", "mean"),
        minimumResilienceScore=("resilienceScore", "min"),
        maximumResilienceScore=("resilienceScore", "max"),
    ).reindex(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).fillna(0)

    comparison = scored.assign(
        anomalous=scored["anomalyLabel"].eq("ANOMALY"),
        high_risk=scored["riskLevel"].isin(["HIGH", "CRITICAL"]),
    )
    top_columns = [
        "experimentId",
        "anomalyLabel",
        "anomalyScore",
        "resilienceScore",
        "riskLevel",
    ]

    print("WEIGHTS")
    for component, weight in WEIGHTS.items():
        print(f"{component}: {weight * 100:.0f}%")
    print("\nDATASET")
    print(f"Total experiments: {len(results)}")
    print(f"Observed thresholds: MEDIUM >= {thresholds['medium']:.2f}, HIGH >= {thresholds['high']:.2f}, CRITICAL >= {thresholds['critical']:.2f}")
    print("\nRISK LEVEL SUMMARY")
    print(summary.to_string(float_format=lambda value: f"{value:.2f}"))
    print("\nTOP 15 HIGHEST-RISK EXPERIMENTS")
    print(scored.sort_values("resilienceScore", ascending=False).head(15)[top_columns].to_string(index=False))
    print("\nANOMALY AND RISK COMPARISON")
    print("A anomalous AND high risk:")
    print(comparison[comparison.anomalous & comparison.high_risk][top_columns].to_string(index=False))
    print("\nB anomalous BUT low risk:")
    print(comparison[comparison.anomalous & ~comparison.high_risk][top_columns].to_string(index=False))
    print("\nC normal BUT high risk:")
    print(comparison[~comparison.anomalous & comparison.high_risk][top_columns].to_string(index=False))
    print(f"\nSaved resilience results: {RESULTS_FILE.relative_to(PROJECT_ROOT)}")
    print(f"Saved visualization: {PLOT_FILE.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
