import asyncio
import csv
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, model_validator

CONTROLLER_URL = os.getenv("CHAOS_CONTROLLER_URL", "http://chaos-controller:4000")
AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://ai-service:8000")
PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://prometheus:9090")
ORDER_SERVICE_URL = os.getenv("ORDER_SERVICE_URL", "http://order-service:3000")
DATA_DIRECTORY = Path(os.getenv("DATA_DIRECTORY", "/app/data"))
EXPERIMENTS_CSV = DATA_DIRECTORY / "experiments.csv"
ANOMALY_CSV = DATA_DIRECTORY / "anomaly_results.csv"
RESILIENCE_CSV = DATA_DIRECTORY / "resilience_results.csv"
RUNS_JSON = DATA_DIRECTORY / "full_experiment_runs.json"
ALLOWED_SERVICES = {"payment-service", "order-service", "notification-service"}
ALLOWED_FAILURES = {"stop", "restart", "latency"}
ALLOWED_LATENCIES = {500, 1000, 2000, 5000}
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
    DATA_DIRECTORY.mkdir(parents=True, exist_ok=True)
    temporary = RUNS_JSON.with_suffix(".tmp")
    temporary.write_text(json.dumps(list(runs.values()), indent=2) + "\n", encoding="utf-8")
    temporary.replace(RUNS_JSON)


async def get_json(client: httpx.AsyncClient, url: str, **kwargs: Any) -> Any:
    response = await client.get(url, **kwargs)
    response.raise_for_status()
    return response.json()


async def prometheus_value(client: httpx.AsyncClient, query: str) -> float:
    result = await get_json(client, f"{PROMETHEUS_URL}/api/v1/query", params={"query": query})
    values = result.get("data", {}).get("result", [])
    return float(values[0]["value"][1]) if values else 0.0


async def prometheus_snapshot(client: httpx.AsyncClient) -> dict[str, float]:
    queries = {
        "orderRequests": 'sum(http_requests_total{job="order-service"})',
        "orderErrors": 'sum(http_errors_total{job="order-service"})',
        "paymentRequests": 'sum(http_requests_total{job="payment-service"})',
        "paymentErrors": 'sum(http_errors_total{job="payment-service"})',
        "notificationRequests": 'sum(http_requests_total{job="notification-service"})',
        "notificationErrors": 'sum(http_errors_total{job="notification-service"})',
    }
    return {name: await prometheus_value(client, query) for name, query in queries.items()}


async def send_order_traffic(client: httpx.AsyncClient, duration_seconds: int) -> list[dict[str, Any]]:
    async def send(index: int) -> dict[str, Any]:
        await asyncio.sleep((duration_seconds + 2) * index / max(1, TRAFFIC_REQUESTS - 1))
        started = asyncio.get_running_loop().time()
        try:
            response = await client.post(
                f"{ORDER_SERVICE_URL}/orders",
                json={"orderId": f"automated-{uuid.uuid4()}", "amount": 1},
            )
            return {"successful": response.is_success, "responseTime": round((asyncio.get_running_loop().time() - started) * 1000, 2)}
        except httpx.HTTPError:
            return {"successful": False, "responseTime": round((asyncio.get_running_loop().time() - started) * 1000, 2)}
    return await asyncio.gather(*(send(index) for index in range(TRAFFIC_REQUESTS)))


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


def append_experiment_csv(experiment: dict[str, Any]) -> None:
    columns = ["experimentId", "experimentStartTime", "failureStartTime", "recoveryTime", "targetService", "failureType", "configuredFailureDuration", "actualRecoveryDuration", "totalRequests", "successfulRequests", "failedRequests", "errorRate", "averageResponseTime", "peakResponseTime", "affectedServices", "cascadingFailure", "experimentResult", "experimentExecutionStatus", "injectedLatencyMilliseconds"]
    existing_ids = set()
    if EXPERIMENTS_CSV.exists():
        with EXPERIMENTS_CSV.open(newline="", encoding="utf-8") as file:
            existing_ids = {row["experimentId"] for row in csv.DictReader(file)}
    if experiment["experimentId"] in existing_ids:
        return
    with EXPERIMENTS_CSV.open("a", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=columns, quoting=csv.QUOTE_ALL)
        writer.writerow({**experiment, "affectedServices": ";".join(experiment.get("affectedServices", [])), "cascadingFailure": str(experiment.get("cascadingFailure", False)).lower()})


async def run_ml() -> None:
    for script in ("ai/isolation_forest.py", "ai/resilience_scoring.py"):
        process = await asyncio.create_subprocess_exec("python", script, cwd="/app", stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        _, stderr = await process.communicate()
        if process.returncode != 0:
            raise RuntimeError(f"{script} failed: {stderr.decode().strip()}")


def csv_record(file_path: Path, experiment_id: str) -> dict[str, str]:
    with file_path.open(newline="", encoding="utf-8") as file:
        return next((row for row in csv.DictReader(file) if row["experimentId"] == experiment_id), {})


async def execute(run: dict[str, Any], request: RunRequest) -> None:
    async with run_lock:
        try:
            set_status(run, "RUNNING")
            async with httpx.AsyncClient(timeout=httpx.Timeout(request.durationSeconds + 25)) as client:
                before = await prometheus_snapshot(client)
                controller_request = asyncio.create_task(client.post(f"{CONTROLLER_URL}/experiments", json=request.model_dump()))
                set_status(run, "FAULT_INJECTED")
                await asyncio.sleep(0.25)
                traffic = await send_order_traffic(client, request.durationSeconds)
                set_status(run, "COLLECTING_METRICS")
                controller_response = await controller_request
                controller_response.raise_for_status()
                controller_experiment = controller_response.json()
                after = await prometheus_snapshot(client)
                experiment = {**controller_experiment, **traffic_metrics(traffic, controller_experiment, before, after)}
                append_experiment_csv(experiment)
                set_status(run, "ANALYZING")
                await run_ml()
                anomaly = csv_record(ANOMALY_CSV, experiment["experimentId"])
                resilience = csv_record(RESILIENCE_CSV, experiment["experimentId"])
                set_status(run, "AI_ANALYSIS")
                ai_request = {**experiment, "affectedServiceCount": len(experiment["affectedServices"]), **anomaly, **resilience}
                ai_response = await client.post(f"{AI_SERVICE_URL}/analyze-experiment", json=ai_request)
                ai_response.raise_for_status()
                run.update({"experimentId": experiment["experimentId"], "executionStatus": "COMPLETED", "metrics": experiment, "anomaly": anomaly, "resilience": resilience, "aiAnalysis": ai_response.json()})
                set_status(run, "COMPLETED")
        except Exception as error:
            run.update({"executionStatus": "FAILED", "failedStage": run.get("status", "QUEUED"), "error": str(error)})
            set_status(run, "FAILED")


app = FastAPI(title="Chaos Experiment Automation", version="1.0.0")


@app.get("/health")
async def health() -> dict[str, str]: return {"service": "experiment-automation", "status": "UP"}


@app.post("/run-full-experiment", status_code=202)
async def run_full_experiment(request: RunRequest) -> dict[str, Any]:
    if run_lock.locked() or any(run.get("status") not in {"COMPLETED", "FAILED"} for run in runs.values()):
        raise HTTPException(status_code=409, detail="An experiment is already running")
    run_id = str(uuid.uuid4())
    run = {"runId": run_id, "request": request.model_dump(), "executionStatus": "QUEUED", "status": "QUEUED", "statusHistory": [{"status": "QUEUED", "at": now()}], "createdAt": now()}
    runs[run_id] = run; persist_runs(); asyncio.create_task(execute(run, request))
    return run


@app.get("/run-full-experiment/{run_id}")
async def get_run(run_id: str) -> dict[str, Any]:
    if run_id not in runs: raise HTTPException(status_code=404, detail="Experiment run not found")
    return runs[run_id]
