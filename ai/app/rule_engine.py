"""
rule_engine.py — Deterministic rule-based fallback analysis for Phase 9.

Used when:
  - anomalyLabel == "ANOMALY"  (ML confirmed anomalous behavior)
  - AND the Gemini LLM call failed (timeout, API error, or missing key)

Produces a fully structured ExperimentAnalysisResponse using only the
experiment metrics — no LLM required. Guarantees the run never ends in
FAILED status purely because of an AI service outage.
"""

from .models import (
    ExperimentAnalysisRequest,
    ExperimentAnalysisResponse,
    Recommendation,
    SuggestedExperiment,
)


# ── Recommendation rule table ────────────────────────────────────────────────
# Each entry: (condition_fn, priority, action, reason)
_RECOMMENDATION_RULES: list[tuple] = [
    (
        lambda r: (r.errorRate or 0) >= 50,
        "CRITICAL",
        "Implement circuit breaker on upstream callers",
        "Error rate exceeded 50% during the fault window. Callers should open a circuit breaker "
        "to fail fast and prevent cascade amplification.",
    ),
    (
        lambda r: (r.errorRate or 0) >= 20,
        "HIGH",
        "Add retry with exponential backoff",
        "Error rate between 20–50% suggests transient failures that a well-tuned retry policy "
        "with jitter could absorb without surfacing errors to end users.",
    ),
    (
        lambda r: r.cascadingFailure is True,
        "HIGH",
        "Introduce bulkhead isolation between services",
        "Cascading failure was observed. Separate thread-pool or connection-pool bulkheads will "
        "prevent a single service failure from exhausting shared resources.",
    ),
    (
        lambda r: (r.actualRecoveryDuration or 0) > 30,
        "HIGH",
        "Add health-check readiness probe and faster restart policy",
        "Recovery took more than 30 seconds. A liveness/readiness probe with a tighter restart "
        "policy will surface failures to the orchestrator sooner.",
    ),
    (
        lambda r: r.failureType == "latency" and (r.injectedLatencyMilliseconds or 0) >= 2000,
        "HIGH",
        "Enforce strict client-side timeouts",
        "High injected latency was observed. Callers must set explicit AbortSignal / connect+read "
        "timeouts to avoid thread exhaustion under downstream slowness.",
    ),
    (
        lambda r: (r.affectedServiceCount or 1) > 1,
        "MEDIUM",
        "Implement graceful degradation for downstream dependencies",
        "Multiple services were affected. Each service should return a degraded but valid response "
        "when its dependencies are unavailable (e.g. cached result, empty list, default value).",
    ),
    (
        lambda r: (r.peakResponseTime or 0) > 5000,
        "MEDIUM",
        "Add distributed tracing to identify latency hotspots",
        "Peak response time exceeded 5 seconds. Distributed tracing (e.g. OpenTelemetry) will "
        "pinpoint which service or database call is the primary latency contributor.",
    ),
    (
        lambda r: r.failureType == "stop",
        "MEDIUM",
        "Configure automatic container restart policy",
        "A stop fault was injected. Container restart=always (Docker) or Kubernetes liveness probe "
        "should recover the service automatically without manual intervention.",
    ),
    (
        lambda r: True,  # always-on baseline recommendation
        "LOW",
        "Add structured logging and metrics alerting",
        "Baseline recommendation: ensure each service emits structured logs and that Prometheus "
        "alert rules fire within one scrape interval of a fault injection.",
    ),
]


def _select_recommendations(request: ExperimentAnalysisRequest) -> list[Recommendation]:
    """Apply rule table and return matching recommendations (deduplicated by priority+action)."""
    seen: set[str] = set()
    recs: list[Recommendation] = []
    for condition, priority, action, reason in _RECOMMENDATION_RULES:
        key = f"{priority}:{action}"
        if key not in seen and condition(request):
            seen.add(key)
            recs.append(Recommendation(priority=priority, action=action, reason=reason))
    return recs


def _suggest_next_experiments(request: ExperimentAnalysisRequest) -> list[SuggestedExperiment]:
    """Suggest complementary experiments based on what was injected."""
    service = request.targetService
    failure = request.failureType
    suggestions: list[SuggestedExperiment] = []

    if failure != "latency":
        suggestions.append(SuggestedExperiment(
            failureType="latency",
            targetService=service,
            reason=f"Test {service} under sustained high-latency to measure timeout effectiveness.",
        ))
    if failure != "stop":
        suggestions.append(SuggestedExperiment(
            failureType="stop",
            targetService=service,
            reason=f"Validate restart/recovery time and readiness probe behaviour for {service}.",
        ))
    if request.cascadingFailure:
        # suggest injecting on a caller service to test isolation
        callers = {
            "payment-service": "order-service",
            "order-service": "notification-service",
            "notification-service": "order-service",
        }
        caller = callers.get(service)
        if caller:
            suggestions.append(SuggestedExperiment(
                failureType="latency",
                targetService=caller,
                reason=(
                    f"Cascading failure was observed. Inject latency into {caller} to verify "
                    "bulkhead isolation prevents it from propagating back to {service}."
                ),
            ))
    return suggestions


def build_rule_based_analysis(request: ExperimentAnalysisRequest) -> ExperimentAnalysisResponse:
    """
    Construct a deterministic analysis report for an anomalous experiment when
    the Gemini LLM is unavailable. Uses the rule table above.
    """
    service = request.targetService
    failure = request.failureType
    error_rate = request.errorRate or 0.0
    recovery = request.actualRecoveryDuration or 0.0
    peak_rt = request.peakResponseTime or 0.0
    avg_rt = request.averageResponseTime or 0.0
    risk = request.riskLevel or "HIGH"
    cascading = request.cascadingFailure is True
    affected_count = request.affectedServiceCount or 1
    anomaly_score = request.anomalyScore

    # ── Failure mechanism inference ──────────────────────────────────────────
    if failure == "stop":
        mechanism = (
            f"OBSERVED: Container stop caused {service} to become unavailable. "
            f"INFERRED: Dependent callers experienced connection-refused errors propagating "
            f"upstream. {'Cascading failure confirmed across ' + str(affected_count) + ' services.' if cascading else ''} "
            "Likely mechanism based on observed behavior; root cause requires additional tracing/log analysis."
        )
    elif failure == "latency":
        latency_ms = request.injectedLatencyMilliseconds or 0
        mechanism = (
            f"OBSERVED: {latency_ms}ms artificial latency injected into {service}. "
            f"INFERRED: Thread exhaustion or timeout breach at caller boundary likely caused "
            f"the {error_rate:.1f}% error rate. Peak response time: {peak_rt:.0f}ms. "
            "Likely mechanism based on observed behavior; root cause requires additional tracing/log analysis."
        )
    else:
        mechanism = (
            f"OBSERVED: Container restart applied to {service}. "
            f"INFERRED: In-flight requests during restart window failed; recovery window "
            f"({recovery:.2f}s) represents time-to-readiness for the container. "
            "Likely mechanism based on observed behavior; root cause requires additional tracing/log analysis."
        )

    # ── Observed behavior list ───────────────────────────────────────────────
    observed = [
        f"OBSERVED: Fault type '{failure}' injected into '{service}'.",
        f"OBSERVED: Error rate during fault window: {error_rate:.1f}%.",
        f"OBSERVED: Average response time: {avg_rt:.0f}ms. Peak: {peak_rt:.0f}ms.",
        f"OBSERVED: System recovered in {recovery:.2f}s after fault removal.",
        f"OBSERVED: {affected_count} service(s) affected. Cascading failure: {'YES' if cascading else 'NO'}.",
        f"OBSERVED: Isolation Forest anomaly score: {anomaly_score:.4f} — classified ANOMALY." if anomaly_score is not None else "OBSERVED: Classified as ANOMALY by Isolation Forest.",
        "NOTE: This analysis was generated by the rule-based fallback engine because the Gemini LLM was unavailable.",
    ]

    # ── Severity explanation ─────────────────────────────────────────────────
    if error_rate >= 80 or risk == "CRITICAL":
        severity = (
            f"CRITICAL severity. {error_rate:.1f}% error rate with risk level {risk}. "
            "The fault caused near-complete service unavailability."
        )
    elif error_rate >= 40 or risk == "HIGH":
        severity = (
            f"HIGH severity. {error_rate:.1f}% error rate with risk level {risk}. "
            "Significant portion of traffic was impacted."
        )
    elif error_rate >= 10:
        severity = (
            f"MEDIUM severity. {error_rate:.1f}% error rate. "
            "Partial degradation observed; within acceptable thresholds for some SLOs."
        )
    else:
        severity = (
            f"LOW–MEDIUM severity. {error_rate:.1f}% error rate. "
            f"Despite being an anomaly by ML score, direct user impact appears limited."
        )

    recs = _select_recommendations(request)
    suggestions = _suggest_next_experiments(request)

    return ExperimentAnalysisResponse(
        experimentId=request.experimentId,
        analysisSource="rule-based-fallback",
        failureSummary=(
            f"An anomalous {failure} fault was detected on {service} "
            f"(Isolation Forest: ANOMALY{f', score={anomaly_score:.4f}' if anomaly_score is not None else ''}). "
            f"Error rate reached {error_rate:.1f}% with recovery in {recovery:.2f}s. "
            f"{'Cascading failure propagated to ' + str(affected_count) + ' services. ' if cascading else ''}"
            "LLM analysis was unavailable; this report was generated by the rule-based fallback engine."
        ),
        severityExplanation=severity,
        observedBehavior=observed,
        likelyFailureMechanism=mechanism,
        resilienceAssessment=(
            f"The {service} service showed anomalous behavior under a {failure} fault with risk level {risk}. "
            f"Recovery duration of {recovery:.2f}s "
            f"{'exceeds recommended SLO targets and ' if recovery > 30 else ''}"
            "indicates opportunities for improvement. "
            "Refer to the recommendations below for targeted resilience engineering actions."
        ),
        recommendations=recs,
        suggestedExperiments=suggestions,
    )
