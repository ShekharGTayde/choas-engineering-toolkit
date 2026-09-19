"""
Load Test Runner — Pre-Deployment Testing Service
Runs controlled load tests against target microservices and produces
detailed performance + capacity reports.
"""

import asyncio
import json
import math
import os
import statistics
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, model_validator

# ── Configuration ─────────────────────────────────────────────────────────────
AI_SERVICE_URL   = os.getenv("AI_SERVICE_URL",   "http://ai-service:8000")
DATA_DIRECTORY   = Path(os.getenv("DATA_DIRECTORY", "/app/data"))
LOAD_TESTS_FILE  = DATA_DIRECTORY / "load_tests.json"

MAX_USERS        = int(os.getenv("MAX_USERS",    "2000"))
MAX_DURATION_SEC = int(os.getenv("MAX_DURATION", "600"))   # 10 minutes
REQUEST_TIMEOUT  = float(os.getenv("REQUEST_TIMEOUT", "10"))
ALLOW_LOCAL_TARGETS = os.getenv("ALLOW_LOCAL_TARGETS", "true").lower() == "true"
MAX_REQUESTS = int(os.getenv("MAX_REQUESTS", "100000"))

# ── In-memory test registry ───────────────────────────────────────────────────
tests: dict[str, dict[str, Any]] = {}
test_lock = asyncio.Lock()
tasks: dict[str, asyncio.Task] = {}

# ── Helpers ───────────────────────────────────────────────────────────────────
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def percentile(data: list[float], p: float) -> float:
    if not data:
        return 0.0
    sorted_data = sorted(data)
    k = (len(sorted_data) - 1) * p / 100
    f, c = math.floor(k), math.ceil(k)
    if f == c:
        return round(sorted_data[int(k)], 2)
    return round(sorted_data[f] * (c - k) + sorted_data[c] * (k - f), 2)

def compute_metrics(results: list[dict]) -> dict:
    if not results:
        return {}
    latencies = [r["latencyMs"] for r in results if r.get("latencyMs") is not None]
    successes = [r for r in results if r.get("success")]
    failures  = [r for r in results if not r.get("success")]
    total     = len(results)
    error_rate = round((len(failures) / total) * 100, 2) if total else 0.0
    return {
        "totalRequests":      total,
        "successfulRequests": len(successes),
        "failedRequests":     len(failures),
        "errorRate":          error_rate,
        "avgLatencyMs":       round(statistics.mean(latencies), 2) if latencies else 0,
        "minLatencyMs":       round(min(latencies), 2) if latencies else 0,
        "maxLatencyMs":       round(max(latencies), 2) if latencies else 0,
        "p50LatencyMs":       percentile(latencies, 50),
        "p95LatencyMs":       percentile(latencies, 95),
        "p99LatencyMs":       percentile(latencies, 99),
        "medianLatencyMs":    percentile(latencies, 50),
    }

def set_status(test: dict, status: str, extra: dict | None = None) -> None:
    test["status"] = status
    test.setdefault("statusHistory", []).append({"status": status, "at": now_iso()})
    if extra:
        test.update(extra)
    persist_tests()

def persist_tests() -> None:
    DATA_DIRECTORY.mkdir(parents=True, exist_ok=True)
    tmp = LOAD_TESTS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(list(tests.values()), indent=2) + "\n", encoding="utf-8")
    tmp.replace(LOAD_TESTS_FILE)

def load_tests_from_disk() -> None:
    if LOAD_TESTS_FILE.exists():
        try:
            saved = json.loads(LOAD_TESTS_FILE.read_text(encoding="utf-8"))
            for t in (saved if isinstance(saved, list) else []):
                tests[t["testId"]] = t
        except Exception:
            pass

def validate_target_url(raw_url: str) -> None:
    parsed = urlparse(raw_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("targetUrl must be an absolute http:// or https:// URL")
    if not ALLOW_LOCAL_TARGETS and parsed.hostname.lower() in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("Local targets are disabled for this runner")
    if not ALLOW_LOCAL_TARGETS and parsed.hostname.startswith(("10.", "192.168.", "169.254.")):
        raise ValueError("Private and metadata network targets are disabled for this runner")

# ── Pydantic models ───────────────────────────────────────────────────────────
ALLOWED_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}
ALLOWED_ENVS    = {"Local", "Development", "Staging"}

class LoadTestRequest(BaseModel):
    serviceName:          str = Field(min_length=1, max_length=80)
    targetUrl:            str = Field(min_length=1, max_length=512)
    healthUrl:            str = Field(min_length=1, max_length=512)
    endpoint:             str = Field(default="/health", max_length=512)
    httpMethod:           str = Field(default="GET")
    environment:          str = Field(default="Development")
    requestBody:          str | None = None   # JSON string
    requestHeaders:       dict[str, str] = {}
    startUsers:           int = Field(default=10,   ge=1,  le=500)
    maxUsers:             int = Field(default=100,  ge=1,  le=MAX_USERS)
    rampUpSeconds:        int = Field(default=30,   ge=5,  le=300)
    durationSeconds:      int = Field(default=60,   ge=10, le=MAX_DURATION_SEC)
    maxErrorRatePct:      float = Field(default=5.0, ge=0, le=100)
    maxP95LatencyMs:      float = Field(default=1000.0, ge=10)
    recoveryObserveSec:   int = Field(default=15,   ge=5,  le=60)
    requestRate:          float | None = Field(default=None, gt=0, le=10000)
    timeoutSeconds:       float = Field(default=10, gt=0, le=60)
    maxRequests:          int = Field(default=MAX_REQUESTS, ge=1, le=MAX_REQUESTS)
    confirmation:         bool = False

    @model_validator(mode="after")
    def validate_fields(self) -> "LoadTestRequest":
        if self.httpMethod.upper() not in ALLOWED_METHODS:
            raise ValueError(f"httpMethod must be one of {ALLOWED_METHODS}")
        if self.environment not in ALLOWED_ENVS:
            raise ValueError(f"environment must be one of {ALLOWED_ENVS}")
        if self.maxUsers < self.startUsers:
            raise ValueError("maxUsers must be >= startUsers")
        validate_target_url(self.targetUrl)
        validate_target_url(self.healthUrl)
        if self.requestBody and self.httpMethod.upper() in {"GET", "DELETE"}:
            raise ValueError(f"{self.httpMethod} requests cannot include a request body")
        if self.requestBody:
            try:
                json.loads(self.requestBody)
            except json.JSONDecodeError as exc:
                raise ValueError(f"requestBody must be valid JSON: {exc.msg}") from exc
        if not self.confirmation:
            raise ValueError("Explicit test-environment confirmation is required")
        self.httpMethod = self.httpMethod.upper()
        return self

# ── Single request probe ──────────────────────────────────────────────────────
async def fire_request(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    headers: dict,
    body: str | None,
) -> dict:
    started = asyncio.get_event_loop().time()
    try:
        resp = await client.request(
            method, url,
            headers={**headers, "User-Agent": "ChaosLoadTester/1.0"},
            content=body.encode() if body else None,
            timeout=REQUEST_TIMEOUT,
        )
        latency_ms = (asyncio.get_event_loop().time() - started) * 1000
        return {"success": resp.status_code < 400, "httpStatus": resp.status_code, "latencyMs": round(latency_ms, 2)}
    except Exception as exc:
        latency_ms = (asyncio.get_event_loop().time() - started) * 1000
        return {"success": False, "httpStatus": None, "latencyMs": round(latency_ms, 2), "error": str(exc)}

# ── Health probe ──────────────────────────────────────────────────────────────
async def health_probe(client: httpx.AsyncClient, url: str) -> dict:
    started = asyncio.get_event_loop().time()
    try:
        r = await client.get(url, timeout=5.0)
        latency_ms = (asyncio.get_event_loop().time() - started) * 1000
        return {"status": "UP" if r.status_code < 400 else "DOWN", "httpStatus": r.status_code, "latencyMs": round(latency_ms, 2)}
    except Exception as exc:
        latency_ms = (asyncio.get_event_loop().time() - started) * 1000
        return {"status": "DOWN", "httpStatus": None, "latencyMs": round(latency_ms, 2), "error": str(exc)}

# ── Concurrency wave ──────────────────────────────────────────────────────────
async def run_wave(
    client: httpx.AsyncClient,
    concurrent: int,
    duration_sec: float,
    req: LoadTestRequest,
    full_url: str,
) -> list[dict]:
    """Fire `concurrent` workers for `duration_sec` seconds; collect all results."""
    results: list[dict] = []
    stop_event = asyncio.Event()

    async def worker() -> None:
        while not stop_event.is_set() and len(results) < req.maxRequests:
            r = await fire_request(client, req.httpMethod, full_url, req.requestHeaders, req.requestBody)
            results.append(r)
            if req.requestRate:
                await asyncio.sleep(max(0, concurrent / req.requestRate))

    tasks = [asyncio.create_task(worker()) for _ in range(concurrent)]
    await asyncio.sleep(duration_sec)
    stop_event.set()
    await asyncio.gather(*tasks, return_exceptions=True)
    return results

# ── Main execution ────────────────────────────────────────────────────────────
async def execute_load_test(test: dict, req: LoadTestRequest) -> None:
    test_id = test["testId"]

    # Build the full URL the load test runner calls from *inside Docker*
    full_url = req.targetUrl.rstrip("/") + req.endpoint

    # Extra headers for JSON body
    headers = dict(req.requestHeaders)
    if req.requestBody:
        headers.setdefault("Content-Type", "application/json")

    limits = httpx.Limits(max_connections=req.maxUsers + 50, max_keepalive_connections=req.maxUsers)
    async with httpx.AsyncClient(limits=limits, follow_redirects=True) as client:
        try:
            set_status(test, "STARTING")

            # ── Baseline health check ──────────────────────────────────────
            baseline = await health_probe(client, req.healthUrl)
            test["baseline"] = baseline
            persist_tests()

            if baseline["status"] != "UP":
                set_status(test, "FAILED", {"failedStage": "BASELINE", "error": f"Service not healthy before test: {baseline}"})
                return

            set_status(test, "RUNNING")

            # ── Build ramp levels ──────────────────────────────────────────
            # Create ~6 evenly spaced steps from startUsers → maxUsers
            n_steps = min(8, max(3, req.maxUsers // max(1, req.startUsers)))
            step_users = []
            for i in range(n_steps):
                u = int(req.startUsers + (req.maxUsers - req.startUsers) * i / max(1, n_steps - 1))
                step_users.append(max(1, u))
            if step_users[-1] != req.maxUsers:
                step_users.append(req.maxUsers)

            # Time per wave
            wave_duration = max(5.0, req.durationSeconds / len(step_users))

            ramp_levels: list[dict] = []
            all_results: list[dict] = []
            safe_capacity = req.startUsers
            degradation_point: int | None = None
            breaking_point: int | None = None
            timeline: list[dict] = []
            start_ts = asyncio.get_event_loop().time()

            for level_idx, concurrent in enumerate(step_users):
                set_status(test, "RAMPING_UP")
                test["currentUsers"] = concurrent
                persist_tests()
                if len(all_results) >= req.maxRequests:
                    break

                wave_results = await run_wave(client, concurrent, wave_duration, req, full_url)
                all_results.extend(wave_results)

                m = compute_metrics(wave_results)
                elapsed = asyncio.get_event_loop().time() - start_ts
                rps = round(len(wave_results) / wave_duration, 2)
                throughput = round(m.get("successfulRequests", 0) / wave_duration, 2)

                level_entry = {
                    "level": level_idx + 1,
                    "concurrentUsers": concurrent,
                    "durationSec": round(wave_duration, 1),
                    "requestsPerSec": rps,
                    "throughput": throughput,
                    **m,
                    "elapsedSec": round(elapsed, 1),
                }
                ramp_levels.append(level_entry)
                timeline.append({
                    "at": now_iso(),
                    "users": concurrent,
                    "errorRate": m.get("errorRate", 0),
                    "p95Ms": m.get("p95LatencyMs", 0),
                    "rps": rps,
                })

                error_rate = m.get("errorRate", 0)
                p95         = m.get("p95LatencyMs", 0)

                # Capacity tracking
                if error_rate <= req.maxErrorRatePct and p95 <= req.maxP95LatencyMs:
                    safe_capacity = concurrent
                elif degradation_point is None:
                    degradation_point = concurrent
                    set_status(test, "DEGRADING")

                # Breaking point: error rate > 50% or p95 > 4× threshold
                if breaking_point is None and (error_rate > 50 or p95 > req.maxP95LatencyMs * 4):
                    breaking_point = concurrent

                # Live progress update
                test["liveMetrics"] = {
                    "currentUsers": concurrent,
                    "totalRequests": len(all_results),
                    "errorRate": error_rate,
                    "p95LatencyMs": p95,
                    "requestsPerSec": rps,
                }
                persist_tests()

            # ── Recovery observation ──────────────────────────────────────
            if test.get("status") == "CANCELLED":
                return
            set_status(test, "RUNNING")
            test["currentUsers"] = 0
            persist_tests()

            recovery_start = asyncio.get_event_loop().time()
            recovery_checks: list[dict] = []
            recovered_at: float | None = None

            for _ in range(req.recoveryObserveSec):
                await asyncio.sleep(1.0)
                check = await health_probe(client, req.healthUrl)
                recovery_checks.append(check)
                if check["status"] == "UP" and recovered_at is None:
                    recovered_at = asyncio.get_event_loop().time() - recovery_start
                    break

            recovery_duration = round(asyncio.get_event_loop().time() - recovery_start, 2)
            final_health = await health_probe(client, req.healthUrl)

            # ── Final aggregated metrics ──────────────────────────────────
            total_m = compute_metrics(all_results)
            total_elapsed = asyncio.get_event_loop().time() - start_ts
            total_rps = round(len(all_results) / max(1, total_elapsed), 2)

            # ── Capacity score (0-100) ────────────────────────────────────
            # Formula:
            #  - 40 pts: safe_capacity / maxUsers  (capacity ratio)
            #  - 30 pts: 1 - (errorRate / 100)    (reliability)
            #  - 30 pts: 1 - min(1, p95 / (maxP95 * 3))  (latency health)
            cap_ratio    = min(1.0, safe_capacity / max(1, req.maxUsers))
            rel_score    = max(0.0, 1.0 - total_m.get("errorRate", 0) / 100)
            p95_score    = max(0.0, 1.0 - min(1.0, total_m.get("p95LatencyMs", 0) / (req.maxP95LatencyMs * 3)))
            capacity_score = round(cap_ratio * 40 + rel_score * 30 + p95_score * 30)

            # ── Overall verdict ────────────────────────────────────────────
            if safe_capacity >= req.maxUsers and total_m.get("errorRate", 0) < req.maxErrorRatePct:
                verdict = "PASS"
                verdict_message = f"Service handled all {req.maxUsers} concurrent users within thresholds."
            elif degradation_point and degradation_point > req.startUsers:
                verdict = "WARNING"
                verdict_message = (
                    f"Service is stable up to approximately {safe_capacity} concurrent users "
                    f"but performance degradation begins above this level."
                )
            else:
                verdict = "FAIL"
                verdict_message = (
                    f"Service showed instability at {degradation_point or req.startUsers} users "
                    f"— below the requested maximum of {req.maxUsers}."
                )

            # ── AI analysis ────────────────────────────────────────────────
            ai_analysis = None
            try:
                ai_payload = {
                    "experimentId": test_id,
                    "targetService": req.serviceName,
                    "failureType": "load_test",
                    "configuredFailureDuration": float(req.durationSeconds),
                    "totalRequests": total_m.get("totalRequests", 0),
                    "successfulRequests": total_m.get("successfulRequests", 0),
                    "failedRequests": total_m.get("failedRequests", 0),
                    "errorRate": total_m.get("errorRate", 0),
                    "averageResponseTime": total_m.get("avgLatencyMs", 0),
                    "peakResponseTime": total_m.get("maxLatencyMs", 0),
                    "cascadingFailure": (breaking_point is not None),
                    "affectedServiceCount": 1,
                    "anomalyLabel": "ANOMALY" if verdict == "FAIL" else "NORMAL",
                    "resilienceScore": float(capacity_score),
                    "riskLevel": "CRITICAL" if verdict == "FAIL" else ("HIGH" if verdict == "WARNING" else "LOW"),
                }
                async with httpx.AsyncClient(timeout=35.0) as ai_client:
                    ai_resp = await ai_client.post(f"{AI_SERVICE_URL}/analyze-experiment", json=ai_payload)
                    if ai_resp.status_code == 200:
                        ai_analysis = ai_resp.json()
            except Exception:
                pass  # AI is optional — don't fail the test

            # ── Assemble final result ──────────────────────────────────────
            result = {
                "totalRequests":       total_m.get("totalRequests", 0),
                "successfulRequests":  total_m.get("successfulRequests", 0),
                "failedRequests":      total_m.get("failedRequests", 0),
                "errorRate":           total_m.get("errorRate", 0),
                "avgLatencyMs":        total_m.get("avgLatencyMs", 0),
                "minLatencyMs":        total_m.get("minLatencyMs", 0),
                "maxLatencyMs":        total_m.get("maxLatencyMs", 0),
                "p50LatencyMs":        total_m.get("p50LatencyMs", 0),
                "p95LatencyMs":        total_m.get("p95LatencyMs", 0),
                "p99LatencyMs":        total_m.get("p99LatencyMs", 0),
                "requestsPerSec":      total_rps,
                "throughput":          round(total_m.get("successfulRequests", 0) / max(1, total_elapsed), 2),
                "elapsedSec":          round(total_elapsed, 2),
            }

            set_status(test, "COMPLETED", {
                "completedAt":     now_iso(),
                "result":          result,
                "rampLevels":      ramp_levels,
                "timeline":        timeline,
                "safeCapacity":    safe_capacity,
                "degradationPoint": degradation_point,
                "breakingPoint":   breaking_point,
                "capacityScore":   capacity_score,
                "verdict":         verdict,
                "verdictMessage":  verdict_message,
                "health": {
                    "before":           baseline,
                    "after":            final_health,
                    "recoveryDurationSec": recovery_duration,
                    "recoveredAt":      recovered_at,
                },
                "aiAnalysis": ai_analysis,
                "currentUsers": 0,
            })

        except asyncio.CancelledError:
            set_status(test, "CANCELLED", {"cancelledAt": now_iso()})
        except Exception as exc:
            set_status(test, "FAILED", {
                "failedStage": test.get("status", "RUNNING"),
                "error":       str(exc),
                "failedAt":    now_iso(),
            })

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="Load Test Runner", version="1.0.0")


@app.on_event("startup")
async def startup():
    load_tests_from_disk()


@app.get("/health")
async def health():
    return {"service": "load-test-runner", "status": "UP"}


@app.get("/api/load-tests")
async def list_tests():
    return {"tests": list(tests.values())}


@app.post("/api/load-tests", status_code=202)
async def start_test(req: LoadTestRequest):
    # Check for already-running test
    running = [t for t in tests.values() if t.get("status") not in ("COMPLETED", "FAILED", "CANCELLED")]
    if running:
        raise HTTPException(status_code=409, detail="A load test is already running.")

    test_id = f"LT-{str(uuid.uuid4())[:8].upper()}"
    test = {
        "testId":        test_id,
        "serviceName":   req.serviceName,
        "targetUrl":     req.targetUrl,
        "healthUrl":     req.healthUrl,
        "endpoint":      req.endpoint,
        "httpMethod":    req.httpMethod,
        "environment":   req.environment,
        "config": {
            "startUsers":       req.startUsers,
            "maxUsers":         req.maxUsers,
            "rampUpSeconds":    req.rampUpSeconds,
            "durationSeconds":  req.durationSeconds,
            "maxErrorRatePct":  req.maxErrorRatePct,
            "maxP95LatencyMs":  req.maxP95LatencyMs,
        },
        "status":        "QUEUED",
        "statusHistory": [{"status": "QUEUED", "at": now_iso()}],
        "createdAt":     now_iso(),
        "currentUsers":  0,
        "liveMetrics":   {},
    }
    tests[test_id] = test
    persist_tests()
    tasks[test_id] = asyncio.create_task(execute_load_test(test, req))
    return test


@app.get("/api/load-tests/{test_id}")
async def get_test(test_id: str):
    if test_id not in tests:
        raise HTTPException(status_code=404, detail="Load test not found.")
    return tests[test_id]


@app.get("/api/load-tests/{test_id}/results")
async def get_results(test_id: str):
    if test_id not in tests:
        raise HTTPException(status_code=404, detail="Load test not found.")
    return tests[test_id]


@app.post("/api/load-tests/validate")
async def validate_endpoint(req: LoadTestRequest):
    started = asyncio.get_event_loop().time()
    headers = dict(req.requestHeaders)
    if req.requestBody:
        headers.setdefault("Content-Type", "application/json")
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            response = await client.request(req.httpMethod, req.targetUrl.rstrip("/") + req.endpoint,
                                            headers=headers, content=req.requestBody,
                                            timeout=req.timeoutSeconds)
        return {"reachable": True, "status": "UP" if response.status_code < 400 else "DOWN",
                "httpStatus": response.status_code,
                "latencyMs": round((asyncio.get_event_loop().time() - started) * 1000, 2)}
    except Exception as exc:
        return {"reachable": False, "status": "DOWN", "httpStatus": None,
                "latencyMs": round((asyncio.get_event_loop().time() - started) * 1000, 2), "error": str(exc)}


@app.post("/api/load-tests/{test_id}/cancel")
async def cancel_test(test_id: str):
    if test_id not in tests:
        raise HTTPException(status_code=404, detail="Load test not found.")
    t = tests[test_id]
    if t["status"] in ("COMPLETED", "FAILED", "CANCELLED"):
        raise HTTPException(status_code=409, detail="Test already finished.")
    task = tasks.get(test_id)
    if task and not task.done():
        task.cancel()
    set_status(t, "CANCELLED", {"cancelledAt": now_iso()})
    return t


@app.post("/api/load-tests/{test_id}/stop")
async def stop_test(test_id: str):
    return await cancel_test(test_id)


@app.delete("/api/load-tests/{test_id}")
async def delete_test(test_id: str):
    if test_id not in tests:
        raise HTTPException(status_code=404, detail="Load test not found.")
    del tests[test_id]
    persist_tests()
    return {"ok": True}
