from pathlib import Path

import json

import pandas as pd
from sklearn.preprocessing import OneHotEncoder


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIRECTORY = PROJECT_ROOT / "data"
INPUT_FILE = DATA_DIRECTORY / "experiments.csv"
ML_DATASET_FILE = DATA_DIRECTORY / "ml_dataset.csv"
QUALITY_REPORT_FILE = DATA_DIRECTORY / "data_quality_report.json"

TIMESTAMP_COLUMNS = [
    "experimentStartTime",
    "failureStartTime",
    "recoveryTime",
]
IDENTIFIER_COLUMNS = ["experimentId"]
OUTCOME_COLUMNS = ["experimentResult"]
EXECUTION_STATUS_COLUMNS = ["experimentExecutionStatus"]
CATEGORICAL_COLUMNS = ["targetService", "failureType"]
BOOLEAN_COLUMNS = ["cascadingFailure"]
NUMERIC_COLUMNS = [
    "configuredFailureDuration",
    "actualRecoveryDuration",
    "totalRequests",
    "successfulRequests",
    "failedRequests",
    "errorRate",
    "averageResponseTime",
    "peakResponseTime",
    "injectedLatencyMilliseconds",
]


def build_quality_report(dataframe: pd.DataFrame) -> dict:
    numeric_data = dataframe.select_dtypes(include="number")
    categorical_data = dataframe.select_dtypes(exclude="number")
    duplicate_id_mask = dataframe["experimentId"].duplicated(keep=False)
    invalid_values = {
        "negative_durations": int(
            (dataframe["configuredFailureDuration"] < 0).sum()
            + (dataframe["actualRecoveryDuration"] < 0).sum()
        ),
        "negative_response_times": int(
            (dataframe["averageResponseTime"] < 0).sum()
            + (dataframe["peakResponseTime"] < 0).sum()
        ),
        "error_rate_outside_0_100": int(
            ((dataframe["errorRate"] < 0) | (dataframe["errorRate"] > 100)).sum()
        ),
        "request_counts_do_not_balance": int(
            (
                dataframe["successfulRequests"] + dataframe["failedRequests"]
                != dataframe["totalRequests"]
            ).sum()
        ),
        "missing_affected_services": int(
            dataframe["affectedServices"].isna().sum()
            + dataframe["affectedServices"].astype(str).str.strip().eq("").sum()
        ),
    }

    report = {
        "row_count": int(len(dataframe)),
        "column_count": int(len(dataframe.columns)),
        "columns": list(dataframe.columns),
        "missing_values": {
            column: int(value)
            for column, value in dataframe.isna().sum().items()
        },
        "duplicate_records": int(dataframe.duplicated().sum()),
        "duplicate_experiment_ids": int(duplicate_id_mask.sum()),
        "duplicate_experiment_id_values": sorted(
            dataframe.loc[duplicate_id_mask, "experimentId"].unique().tolist()
        ),
        "data_types": {
            column: str(dtype)
            for column, dtype in dataframe.dtypes.items()
        },
        "numerical_distributions": json.loads(
            numeric_data.describe().round(2).to_json()
        ),
        "categorical_values": {
            column: sorted(dataframe[column].dropna().unique().tolist())
            for column in categorical_data.columns
        },
        "category_distributions": {
            column: {
                str(value): int(count)
                for value, count in dataframe[column].value_counts(dropna=False).items()
            }
            for column in categorical_data.columns
        },
        "invalid_values": invalid_values,
        "correlation_matrix": json.loads(
            numeric_data.corr().round(3).to_json()
        ),
    }
    return report


def create_ml_dataset(dataframe: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    missing_columns = set(NUMERIC_COLUMNS + CATEGORICAL_COLUMNS + BOOLEAN_COLUMNS) - set(dataframe.columns)
    if missing_columns:
        raise ValueError(f"Missing required feature columns: {sorted(missing_columns)}")

    numeric_features = dataframe[NUMERIC_COLUMNS].apply(pd.to_numeric, errors="raise")
    categorical_encoder = OneHotEncoder(sparse_output=False, handle_unknown="ignore")
    encoded_categories = categorical_encoder.fit_transform(dataframe[CATEGORICAL_COLUMNS])
    encoded_category_names = categorical_encoder.get_feature_names_out(CATEGORICAL_COLUMNS)

    boolean_features = dataframe[BOOLEAN_COLUMNS].astype(bool).astype(int)
    encoded_categories_dataframe = pd.DataFrame(
        encoded_categories,
        columns=encoded_category_names,
        index=dataframe.index,
    )
    ml_dataset = pd.concat(
        [numeric_features, encoded_categories_dataframe, boolean_features],
        axis=1,
    )

    feature_plan = {
        "included_numeric_features": NUMERIC_COLUMNS,
        "included_one_hot_features": encoded_category_names.tolist(),
        "included_binary_features": [
            "cascadingFailure (false=0, true=1)"
        ],
        "excluded_identifiers": IDENTIFIER_COLUMNS,
        "excluded_timestamps": TIMESTAMP_COLUMNS,
        "excluded_outcomes": OUTCOME_COLUMNS + EXECUTION_STATUS_COLUMNS,
        "excluded_non_feature_field": ["affectedServices"],
        "reason": (
            "Numeric impact and recovery measurements describe each experiment. "
            "targetService and failureType are encoded so models can use categories. "
            "cascadingFailure is converted to binary form. IDs, timestamps, and the "
            "experiment outcome are excluded to avoid identity/time leakage and to "
            "keep the output as a feature dataset."
        ),
    }
    return ml_dataset, feature_plan


def assess_dataset_size(dataframe: pd.DataFrame) -> dict:
    result_counts = dataframe["experimentResult"].value_counts(dropna=False).to_dict()
    execution_counts = dataframe["experimentExecutionStatus"].value_counts(dropna=False).to_dict()
    numeric_variation = {
        column: int(dataframe[column].nunique(dropna=True))
        for column in NUMERIC_COLUMNS
    }
    has_supervised_target = dataframe["experimentExecutionStatus"].nunique(dropna=True) > 1
    return {
        "row_count": int(len(dataframe)),
        "isolation_forest": (
            "Ready for an initial Isolation Forest pipeline and exploratory anomaly "
            "detection. More experiments would improve coverage of rare behavior."
        ),
        "random_forest": (
            "Not ready for supervised classification: experimentExecutionStatus has "
            "only one class, so there is no target variation to learn."
        ),
        "experimentResult_distribution": {
            str(key): int(value) for key, value in result_counts.items()
        },
        "experimentExecutionStatus_distribution": {
            str(key): int(value) for key, value in execution_counts.items()
        },
        "supervised_target": {
            "candidate": "experimentExecutionStatus",
            "exists": True,
            "usable_for_classification": has_supervised_target,
            "reason": (
                "experimentResult describes experiment execution success and is not "
                "a resilience target. experimentExecutionStatus is the intended "
                "candidate, but it currently contains one class."
            ),
        },
        "numeric_unique_value_counts": numeric_variation,
        "no_fabricated_rows": True,
    }


def main() -> None:
    dataframe = pd.read_csv(INPUT_FILE)
    required_columns = set(
        IDENTIFIER_COLUMNS
        + TIMESTAMP_COLUMNS
        + CATEGORICAL_COLUMNS
        + BOOLEAN_COLUMNS
        + NUMERIC_COLUMNS
        + ["affectedServices", "experimentResult"]
        + EXECUTION_STATUS_COLUMNS
    )
    missing_columns = required_columns - set(dataframe.columns)
    if missing_columns:
        raise ValueError(f"Missing required columns: {sorted(missing_columns)}")
    quality_report = build_quality_report(dataframe)
    ml_dataset, feature_plan = create_ml_dataset(dataframe)
    size_assessment = assess_dataset_size(dataframe)

    ml_dataset.to_csv(ML_DATASET_FILE, index=False)
    full_report = {
        "input_file": str(INPUT_FILE.relative_to(PROJECT_ROOT)),
        "quality": quality_report,
        "feature_plan": feature_plan,
        "dataset_size_assessment": size_assessment,
        "output_file": str(ML_DATASET_FILE.relative_to(PROJECT_ROOT)),
    }
    QUALITY_REPORT_FILE.write_text(
        json.dumps(full_report, indent=2) + "\n",
        encoding="utf-8",
    )

    print("DATA QUALITY REPORT")
    print(json.dumps(quality_report, indent=2))
    print("\nFEATURE PLAN")
    print(json.dumps(feature_plan, indent=2))
    print("\nDATASET SIZE ASSESSMENT")
    print(json.dumps(size_assessment, indent=2))
    print(f"\nSaved clean ML dataset: {ML_DATASET_FILE.relative_to(PROJECT_ROOT)}")
    print(f"Saved quality report: {QUALITY_REPORT_FILE.relative_to(PROJECT_ROOT)}")
    print(f"ML dataset shape: {ml_dataset.shape[0]} rows x {ml_dataset.shape[1]} columns")


if __name__ == "__main__":
    main()
