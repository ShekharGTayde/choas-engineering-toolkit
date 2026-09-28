from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from .analysis_store import AnalysisStore, AnalysisStoreError
from .llm_service import LlmService, LlmServiceError, MissingApiKeyError
from .models import ExperimentAnalysisRequest, ExperimentAnalysisResponse, Recommendation, SuggestedExperiment
from .rule_engine import build_rule_based_analysis

analysis_store = AnalysisStore()


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        analysis_store.initialize()
    except AnalysisStoreError as error:
        raise RuntimeError(str(error)) from error
    yield


app = FastAPI(title="AI Failure Analysis Service", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"service": "ai-analysis-service", "status": "UP"}


@app.post("/analyze-experiment", response_model=ExperimentAnalysisResponse)
async def analyze_experiment(request: ExperimentAnalysisRequest) -> ExperimentAnalysisResponse:
    """
    3-state AI analysis gate:

    State 1 — no-anomaly:
        anomalyLabel is NORMAL (or absent/unknown) → skip LLM entirely.
        Return a lightweight baseline report (no LLM cost, no latency).

    State 2 — ai-generated:
        anomalyLabel is ANOMALY → call Gemini. On success, persist and return.

    State 3 — rule-based-fallback:
        anomalyLabel is ANOMALY but Gemini fails (timeout / API error / key missing)
        → generate a deterministic rule-based report instead of crashing the whole run.
    """
    anomaly_detected = (request.anomalyLabel or "").upper() == "ANOMALY"

    # ── State 1: No anomaly detected — skip LLM entirely ──────────────────────
    if not anomaly_detected:
        analysis = _build_no_anomaly_report(request)
        try:
            analysis_store.upsert(analysis)
        except AnalysisStoreError as error:
            raise HTTPException(status_code=500, detail=str(error)) from error
        return analysis

    # ── State 2: Anomaly detected — attempt Gemini LLM call ───────────────────
    try:
        service = LlmService()
        analysis = await service.analyze(request)
        analysis_store.upsert(analysis)
        return analysis
    except (MissingApiKeyError, LlmServiceError):
        # ── State 3: Anomaly confirmed but LLM failed — rule-based fallback ───
        analysis = build_rule_based_analysis(request)
        try:
            analysis_store.upsert(analysis)
        except AnalysisStoreError as store_error:
            raise HTTPException(status_code=500, detail=str(store_error)) from store_error
        return analysis
    except AnalysisStoreError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


def _build_no_anomaly_report(request: ExperimentAnalysisRequest) -> ExperimentAnalysisResponse:
    """
    Lightweight baseline report for experiments where the ML model detected no anomaly.
    No LLM is called. Returns structured data so the dashboard always has something to show.
    """
    service = request.targetService
    failure = request.failureType
    error_rate = request.errorRate or 0.0
    recovery = request.actualRecoveryDuration or 0.0
    risk = request.riskLevel or "LOW"

    return ExperimentAnalysisResponse(
        experimentId=request.experimentId,
        analysisSource="no-anomaly",
        failureSummary=(
            f"The {failure} fault injected into {service} was classified as NORMAL by the "
            f"Isolation Forest anomaly detector. The system responded within expected parameters "
            f"with a {error_rate:.1f}% error rate and recovered in {recovery:.2f}s."
        ),
        severityExplanation=(
            f"Risk level: {risk}. No statistically significant deviation from baseline behavior "
            f"was detected. The experiment confirms existing resilience for this fault type."
        ),
        observedBehavior=[
            f"OBSERVED: Fault type '{failure}' applied to '{service}'.",
            f"OBSERVED: Error rate during fault window: {error_rate:.1f}%.",
            f"OBSERVED: Recovery completed in {recovery:.2f}s.",
            f"OBSERVED: Isolation Forest anomaly score within normal threshold — classified NORMAL.",
            f"OBSERVED: Cascading failure: {'yes' if request.cascadingFailure else 'no'}.",
        ],
        likelyFailureMechanism=(
            "No anomalous failure mechanism detected. System behavior remained within statistically "
            "normal bounds for this fault type and target service."
        ),
        resilienceAssessment=(
            f"The system demonstrated adequate resilience against a {failure} fault on {service}. "
            "No LLM deep-analysis was triggered because the ML classifier found no anomaly. "
            "Run more experiments to build a richer dataset for comparative scoring."
        ),
        recommendations=[
            Recommendation(
                priority="LOW",
                action="Continue baseline chaos experiments",
                reason=(
                    "No anomaly detected in this run. Expanding experiment coverage across "
                    "fault types and services will improve anomaly detection confidence."
                ),
            )
        ],
        suggestedExperiments=[
            SuggestedExperiment(
                failureType="stop" if failure != "stop" else "latency",
                targetService=service,
                reason="Vary fault type to test a different failure mode on the same service.",
            )
        ],
    )


@app.get("/analysis")
async def get_analyses() -> dict[str, object]:
    try:
        analyses = analysis_store.list_all()
        return {"count": len(analyses), "analyses": analyses}
    except AnalysisStoreError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@app.get("/analysis/{experiment_id}")
async def get_analysis(experiment_id: str) -> dict[str, object]:
    try:
        analysis = analysis_store.get(experiment_id)
    except AnalysisStoreError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    if analysis is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return analysis
