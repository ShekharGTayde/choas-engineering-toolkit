import asyncio
import base64
import binascii
import hashlib
import hmac
import json
import os
import time
import uuid
from base64 import urlsafe_b64decode
from datetime import datetime, timezone
from typing import Any, Literal

import httpx
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field, model_validator

CONTROLLER_URL = os.getenv("CHAOS_CONTROLLER_URL", "http://chaos-controller:4000")
AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://ai-service:8000")
PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://prometheus:9090")
BLACKBOX_URL = os.getenv("BLACKBOX_EXPORTER_URL", "http://blackbox-exporter:9115")
ORDER_SERVICE_URL = os.getenv("ORDER_SERVICE_URL", "http://order-service:3000")
JWT_SECRET = os.getenv("JWT_SECRET", "chaosguard_jwt_secret_dev_key_2026")
from pymongo import MongoClient
from pymongo.errors import PyMongoError

MONGODB_URI = os.environ["MONGODB_URI"]
MONGODB_DB = os.getenv("MONGODB_DB", "chaosguard")
mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
mongo_db = mongo_client[MONGODB_DB]
runs_collection = mongo_db["experiment_runs"]
experiments_collection = mongo_db["experiments"]
anomaly_collection = mongo_db["anomaly_results"]
resilience_collection = mongo_db["resilience_results"]
full_resilience_collection = mongo_db["full_resilience_tests"]
ALLOWED_SERVICES = {"payment-service", "order-service", "notification-service"}
ALLOWED_FAILURES = {"stop", "restart", "latency"}
ALLOWED_LATENCIES = {500, 1000, 2000, 5000}

def generate_internal_operator_token() -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    exp = int(time.time()) + 3600
    body = base64.urlsafe_b64encode(json.dumps({
        "id": "usr_automation_service",
        "name": "Automation Service",
        "role": "Operator",
        "exp": exp
    }).encode()).decode().rstrip("=")
    sig = base64.urlsafe_b64encode(
        hmac.new(JWT_SECRET.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
    ).decode().rstrip("=")
    return f"{header}.{body}.{sig}"


def verify_operator_jwt(authorization: str | None) -> dict[str, Any] | None:
    """Validate the operator token before accepting an orchestration request."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    parts = authorization[7:].strip().split(".")
    if len(parts) != 3:
        return None
    header, payload, signature = parts
    expected = hmac.new(
        JWT_SECRET.encode(), f"{header}.{payload}".encode(), hashlib.sha256
    ).digest()
    try:
        token_header = json.loads(urlsafe_b64decode(header + "=" * (-len(header) % 4)))
        supplied = urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
        claims = json.loads(urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError, binascii.Error):
        return None
    if token_header.get("alg") != "HS256" or not hmac.compare_digest(supplied, expected) or claims.get("role") != "Operator":
        return None
    if claims.get("exp") is not None:
        try:
            if int(claims["exp"]) <= int(time.time()):
                return None
        except (TypeError, ValueError):
            return None
    return claims
MAX_DURATION_SECONDS = 60
TRAFFIC_REQUESTS = 10
STATUS_FLOW = ["QUEUED", "RUNNING", "FAULT_INJECTED", "COLLECTING_METRICS", "ANALYZING", "AI_ANALYSIS", "COMPLETED"]
runs: dict[str, dict[str, Any]] = {}
run_lock = asyncio.Lock()


class RunRequest(BaseModel):
    targetService: Literal["payment-service", "order-service", "notification-service"]
    failureType: Literal["stop", "restart", "latency"]
    durationSeconds: int = Field(ge=1, le=MAX_DURATION_SECONDS)
    latencyMilliseconds: int | None = None
    trafficRequests: int = Field(default=10, ge=1, le=500)

    @model_validator(mode="after")
    def validate_latency(self) -> "RunRequest":
        if self.failureType == "latency" and self.latencyMilliseconds not in ALLOWED_LATENCIES:
            raise ValueError("latencyMilliseconds must be one of 500, 1000, 2000, or 5000 for latency experiments")
        if self.failureType != "latency" and self.latencyMilliseconds not in (None, 0):
            raise ValueError("latencyMilliseconds is allowed only for latency experiments")
        return self


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def set_status(run: dict[str, Any], status: str) -> None:
    run["status"] = status
    run.setdefault("statusHistory", []).append({"status": status, "at": now()})
    persist_runs()


def persist_runs() -> None:
    try:
        for run in runs.values():
            runs_collection.replace_one({"runId": run["runId"]}, run, upsert=True)
    except PyMongoError as error:
        raise RuntimeError(f"Unable to persist experiment run: {error}") from error


def persist_experiment_records(experiment: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Persist runtime experiment, anomaly, and resilience records in MongoDB."""
    experiment = {key: value for key, value in experiment.items() if key != "_id"}
    anomaly = {
        "experimentId": experiment["experimentId"],
        "anomalyLabel": "ANOMALY" if experiment.get("errorRate", 0) > 50 else "NORMAL",
        "anomalyScore": float(experiment.get("errorRate", 0)),
    }
    resilience = {
        "experimentId": experiment["experimentId"],
        "resilienceScore": max(0.0, round(100 - float(experiment.get("errorRate", 0)), 2)),
    }
    try:
        experiments_collection.replace_one({"experimentId": experiment["experimentId"]}, experiment, upsert=True)
        anomaly_collection.replace_one({"experimentId": anomaly["experimentId"]}, anomaly, upsert=True)
        resilience_collection.replace_one({"experimentId": resilience["experimentId"]}, resilience, upsert=True)
    except PyMongoError as error:
        raise RuntimeError(f"Unable to persist experiment records: {error}") from error
    return anomaly, resilience


def persist_full_resilience_report(run: dict[str, Any]) -> None:
    """Store one consolidated document for status/report consumers and PDF builders."""
    report = {
        "runId": run["runId"],
        "reportVersion": "1.0",
        "createdAt": run.get("createdAt"),
        "updatedAt": now(),
        "executionStatus": run.get("executionStatus"),
        "status": run.get("status"),
        "statusHistory": run.get("statusHistory", []),
        "request": run.get("request", {}),
        "experimentId": run.get("experimentId"),
        "metrics": run.get("metrics", {}),
        "anomaly": run.get("anomaly", {}),
        "resilience": run.get("resilience", {}),
        "aiAnalysis": run.get("aiAnalysis"),
        "error": run.get("error"),
        "failedStage": run.get("failedStage"),
    }
    try:
        full_resilience_collection.replace_one({"runId": run["runId"]}, report, upsert=True)
    except PyMongoError as error:
        raise RuntimeError(f"Unable to persist full resilience report: {error}") from error


async def get_json(client: httpx.AsyncClient, url: str, **kwargs: Any) -> Any:
    response = await client.get(url, **kwargs)
    response.raise_for_status()
    return response.json()


async def prometheus_value(client: httpx.AsyncClient, query: str) -> float:
    """Execute a single instant PromQL query; return 0.0 if no series found."""
    try:
        result = await get_json(client, f"{PROMETHEUS_URL}/api/v1/query", params={"query": query})
        values = result.get("data", {}).get("result", [])
        return float(values[0]["value"][1]) if values else 0.0
    except Exception:
        return 0.0


async def prometheus_snapshot(client: httpx.AsyncClient) -> dict[str, float]:
    """Snapshot internal docker-compose service counters (requests + errors)."""
    queries = {
        "orderRequests": 'sum(http_requests_total{job="order-service"})',
        "orderErrors": 'sum(http_errors_total{job="order-service"})',
        "paymentRequests": 'sum(http_requests_total{job="payment-service"})',
        "paymentErrors": 'sum(http_errors_total{job="payment-service"})',
        "notificationRequests": 'sum(http_requests_total{job="notification-service"})',
        "notificationErrors": 'sum(http_errors_total{job="notification-service"})',
    }
    return {name: await prometheus_value(client, query) for name, query in queries.items()}


async def prometheus_metrics_by_source(
    client: httpx.AsyncClient,
    target_name: str,
    target_source: str,
) -> dict[str, float]:
    """
    Return Prometheus metrics parameterized by target source.

    - docker-compose  → query prom-client counters from the named job
      (http_requests_total, http_errors_total, http_request_duration_seconds p95)
    - external-url    → query Blackbox Exporter probe results
      (probe_success, probe_duration_seconds) for the registered health URL;
      the job name 'blackbox-external' is the dedicated Prometheus scrape job.
    """
    if target_source == "external-url":
        # Blackbox Exporter metrics — keyed on job label set by relabel_configs
        probe_success = await prometheus_value(
            client,
            f'probe_success{{job="blackbox-external",instance="{target_name}"}}',
        )
        probe_duration = await prometheus_value(
            client,
            f'probe_duration_seconds{{job="blackbox-external",instance="{target_name}"}}',
        )
        return {
            "source": "external-url",
            "target": target_name,
            "probeSuccess": probe_success,
            "probeDurationSeconds": round(probe_duration, 4),
            "probeSuccessPercent": round(probe_success * 100, 1),
        }
    else:
        # docker-compose internal target — prom-client instrumented
        job = target_name  # Prometheus job_name matches service name
        requests = await prometheus_value(
            client, f'sum(http_requests_total{{job="{job}"}})',
        )
        errors = await prometheus_value(
            client, f'sum(http_errors_total{{job="{job}"}})',
        )
        p95 = await prometheus_value(
            client,
            f'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{{job="{job}"}}[1m])) by (le))',
        )
        error_rate = round((errors / requests) * 100, 2) if requests > 0 else 0.0
        return {
            "source": "docker-compose",
            "target": target_name,
            "requests": requests,
            "errors": errors,
            "errorRatePercent": error_rate,
            "p95LatencySeconds": round(p95, 4),
        }


async def send_order_traffic(client: httpx.AsyncClient, duration_seconds: int, request_count: int) -> list[dict[str, Any]]:
    async def send(index: int) -> dict[str, Any]:
        await asyncio.sleep((duration_seconds + 2) * index / max(1, request_count - 1))
        started = asyncio.get_running_loop().time()
        try:
            response = await client.post(
                f"{ORDER_SERVICE_URL}/orders",
                json={"orderId": f"automated-{uuid.uuid4()}", "amount": 1},
            )
            return {"successful": response.is_success, "responseTime": round((asyncio.get_running_loop().time() - started) * 1000, 2)}
        except httpx.HTTPError:
            return {"successful": False, "responseTime": round((asyncio.get_running_loop().time() - started) * 1000, 2)}
    return await asyncio.gather(*(send(index) for index in range(request_count)))


def traffic_metrics(traffic: list[dict[str, Any]], experiment: dict[str, Any], before: dict[str, float], after: dict[str, float]) -> dict[str, Any]:
    response_times = [item["responseTime"] for item in traffic]
    successful = sum(item["successful"] for item in traffic)
    failed = len(traffic) - successful
    affected = {experiment["targetService"]}
    if failed and experiment["targetService"] == "payment-service": affected.add("order-service")
    if failed and experiment["targetService"] == "notification-service": affected.update({"payment-service", "order-service"})
    return {
        "totalRequests": len(traffic), "successfulRequests": successful, "failedRequests": failed,
        "errorRate": round((failed / len(traffic)) * 100, 2) if traffic else 0,
        "averageResponseTime": round(sum(response_times) / len(response_times), 2) if response_times else 0,
        "peakResponseTime": max(response_times, default=0), "affectedServices": sorted(affected),
        "cascadingFailure": len(affected) > 1,
        "prometheusObservation": {"before": before, "after": after},
    }


async def execute(
    run: dict[str, Any],
    request: RunRequest,
    auth_header: str | None = None,
    persist_report: bool = False,
) -> None:
    async with run_lock:
        try:
            set_status(run, "RUNNING")
            token_header = auth_header if auth_header else f"Bearer {generate_internal_operator_token()}"
            async with httpx.AsyncClient(timeout=httpx.Timeout(request.durationSeconds + 25)) as client:
                before = await prometheus_snapshot(client)
                controller_request = asyncio.create_task(
                    client.post(
                        f"{CONTROLLER_URL}/experiments",
                        json=request.model_dump(),
                        headers={"Authorization": token_header}
                    )
                )
                set_status(run, "FAULT_INJECTED")
                await asyncio.sleep(0.25)
                traffic = await send_order_traffic(client, request.durationSeconds, request.trafficRequests)
                set_status(run, "COLLECTING_METRICS")
                controller_response = await controller_request
                controller_response.raise_for_status()
                controller_experiment = controller_response.json()
                after = await prometheus_snapshot(client)
                experiment = {**controller_experiment, **traffic_metrics(traffic, controller_experiment, before, after)}
                anomaly, resilience = persist_experiment_records(experiment)
                set_status(run, "ANALYZING")
                set_status(run, "AI_ANALYSIS")
                ai_request = {**experiment, "affectedServiceCount": len(experiment["affectedServices"]), **anomaly, **resilience}
                ai_response = await client.post(f"{AI_SERVICE_URL}/analyze-experiment", json=ai_request)
                ai_response.raise_for_status()
                run.update({"experimentId": experiment["experimentId"], "executionStatus": "COMPLETED", "metrics": experiment, "anomaly": anomaly, "resilience": resilience, "aiAnalysis": ai_response.json()})
                set_status(run, "COMPLETED")
        except Exception as error:
            run.update({"executionStatus": "FAILED", "failedStage": run.get("status", "QUEUED"), "error": str(error)})
            set_status(run, "FAILED")
        finally:
            if persist_report:
                persist_full_resilience_report(run)


app = FastAPI(title="Chaos Experiment Automation", version="1.0.0")


@app.on_event("startup")
async def startup() -> None:
    try:
        mongo_client.admin.command("ping")
    except PyMongoError as error:
        raise RuntimeError(f"MongoDB is unavailable: {error}") from error


@app.get("/health")
async def health() -> dict[str, str]: return {"service": "experiment-automation", "status": "UP"}


@app.post("/run-full-experiment", status_code=202)
async def run_full_experiment(request: RunRequest, http_request: Request) -> dict[str, Any]:
    if run_lock.locked() or any(run.get("status") not in {"COMPLETED", "FAILED"} for run in runs.values()):
        raise HTTPException(status_code=409, detail="An experiment is already running")
    auth_header = http_request.headers.get("authorization")
    run_id = str(uuid.uuid4())
    run = {"runId": run_id, "request": request.model_dump(), "executionStatus": "QUEUED", "status": "QUEUED", "statusHistory": [{"status": "QUEUED", "at": now()}], "createdAt": now()}
    runs[run_id] = run; persist_runs(); asyncio.create_task(execute(run, request, auth_header))
    return run


@app.post("/run-full-resilience-test", status_code=202)
async def run_full_resilience_test(request: RunRequest, http_request: Request) -> dict[str, Any]:
    """Run traffic, fault injection, recovery metrics, and AI analysis as one run."""
    auth_header = http_request.headers.get("authorization")
    if verify_operator_jwt(auth_header) is None:
        raise HTTPException(status_code=401, detail="Valid Operator JWT is required")
    if run_lock.locked() or any(run.get("status") not in {"COMPLETED", "FAILED"} for run in runs.values()):
        raise HTTPException(status_code=409, detail="A resilience test is already running")
    run_id = str(uuid.uuid4())
    run = {
        "runId": run_id,
        "workflow": "full-resilience-test",
        "request": request.model_dump(),
        "executionStatus": "QUEUED",
        "status": "QUEUED",
        "statusHistory": [{"status": "QUEUED", "at": now()}],
        "createdAt": now(),
    }
    runs[run_id] = run
    persist_runs()
    persist_full_resilience_report(run)
    asyncio.create_task(execute(run, request, auth_header, persist_report=True))
    return run


@app.get("/run-full-experiment/{run_id}")
async def get_run(run_id: str) -> dict[str, Any]:
    if run_id not in runs: raise HTTPException(status_code=404, detail="Experiment run not found")
    return runs[run_id]


@app.get("/run-full-resilience-test/{run_id}")
@app.get("/run-full-resilience-test/{run_id}/status")
async def get_full_resilience_status(run_id: str) -> dict[str, Any]:
    """Return live workflow status (or the persisted status after a restart)."""
    if run_id in runs:
        return runs[run_id]
    try:
        report = full_resilience_collection.find_one({"runId": run_id}, {"_id": 0})
    except PyMongoError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    if report is None:
        raise HTTPException(status_code=404, detail="Resilience test not found")
    return report


@app.get("/run-full-resilience-test/{run_id}/report")
async def get_full_resilience_report(run_id: str) -> dict[str, Any]:
    """Return the consolidated, PDF-friendly resilience report."""
    try:
        report = full_resilience_collection.find_one({"runId": run_id}, {"_id": 0})
    except PyMongoError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    if report is None:
        raise HTTPException(status_code=404, detail="Resilience report not found")
    return report


@app.get("/metrics")
async def get_metrics_by_source(
    target: str,
    source: str = "docker-compose",
) -> dict[str, Any]:
    """
    Source-parameterized PromQL query layer (Phase 6).

    Query params:
      - target : service name (docker-compose) or health probe URL (external-url)
      - source : 'docker-compose' | 'external-url'  (default: docker-compose)

    Returns different metric shapes per source:
      docker-compose  → requests, errors, errorRatePercent, p95LatencySeconds
      external-url    → probeSuccess, probeDurationSeconds, probeSuccessPercent
    """
    if source not in {"docker-compose", "external-url"}:
        raise HTTPException(status_code=400, detail="source must be 'docker-compose' or 'external-url'")
    if not target:
        raise HTTPException(status_code=400, detail="target is required")
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
        return await prometheus_metrics_by_source(client, target, source)


@app.get("/metrics/snapshot")
async def get_internal_snapshot() -> dict[str, Any]:
    """
    Full snapshot of all internal docker-compose service metrics in one call.
    Equivalent to the prometheus_snapshot() used before each experiment run.
    """
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
        snapshot = await prometheus_snapshot(client)
    return {"source": "docker-compose", "snapshot": snapshot, "capturedAt": now()}
