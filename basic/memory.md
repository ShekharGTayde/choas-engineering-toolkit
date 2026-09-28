Current phase: 6 (or Phase 3 discovery backlog)
Last verified: 2026-09-27

---

## Phase 0 — Setup & Planning [COMPLETE]
[x] Repo structure — dashboard/, chaos-controller/, order-service/, payment-service/, notification-service/, ai/ all present
[x] Docker Compose skeleton — docker-compose.yml defines all services, custom bridge 172.18.0.0/16, MTU 1450
[x] Base FastAPI backend + base React frontend — ai/ and automation/ use FastAPI; dashboard/ui/ is Vite+React
[x] API contract — consistent request/response shapes across services; verified by code
[x] Shared .env / config — .env (GEMINI_API_KEY, MODEL, TIMEOUT), sample.env, JWT_SECRET env-driven

---

## Phase 1 — Sample Microservice Target System [COMPLETE]
[x] API Gateway — dashboard/server.js proxies to all upstreams (order, payment, notification, chaos-controller, ai, automation, load-test)
[x] Auth Service — createJwt/verifyJwt in dashboard/server.js; login/register/me endpoints; users.json store
[x] Orders Service — order-service/server.js calls payment-service with AbortSignal.timeout(3000); /chaos/latency endpoint
[x] Payments Service — payment-service/server.js; /chaos/latency endpoint; prom-client metrics
[x] Notification Service — notification-service/server.js; same structure as payment/order

---

## Phase 2 — Auth & RBAC [COMPLETE]
[x] JWT-based auth — full custom HS256 JWT in dashboard/server.js; login + register + /api/auth/me
[x] Operator / Viewer roles — role in JWT payload; registration enforces only Viewer or Operator
[x] Operator-role guard (reusable) — verified in dashboard/server.js and chaos-controller/server.js (shared JWT_SECRET HS256)
[x] Viewer restrictions in UI — RunExperimentDialog.jsx checks isOperator; disables button + shows toast

---

## Phase 3 — Docker Compose Service Discovery [COMPLETE]
[x] Docker socket mounted — chaos-controller has /var/run/docker.sock volume in docker-compose.yml
[x] Docker Discovery Service GET /containers/json — chaos-controller/server.js: discoverDockerTargets() queries Docker socket with chaosguard.target=true label filter; falls back to static registry if socket unreachable
[x] Target Registry with source field — dashboard/server.js: full registry (defaultInternalTargets + external-url entries) each carries source: 'docker-compose' | 'external-url' and monitorOnly flag; persisted to /app/servers/registered_servers.json
[x] POST /targets/discover endpoint — both chaos-controller (/targets/discover) and dashboard (/api/targets/discover) implement discovery; dashboard merges Docker-discovered targets into its registry
[x] Refresh Services UI — ServersPage.jsx: "Refresh Services" button calls POST /api/targets/discover (Operator-gated); updates server list from merged discovery result
[x] Manual Add External URL flow — AddServerDialog.jsx + POST /api/servers: SSRF-protected, sets source='external-url', monitorOnly=true; linked into unified target registry
[x] UI visually distinguishes monitor-only targets — ServerCard.jsx: monitorOnlyBanner (lock icon + "Monitor-Only · Fault injection prohibited") vs faultCapableBanner; RunExperimentDialog.jsx: monitor-only targets grouped under "External Systems (Monitor-Only · Protected)" optgroup, fault controls disabled, warning banner shown; submit button shows "Fault Prohibited (Monitor-Only)"
FIX: ServersPage.jsx was missing useState for checkingId — added const [checkingId, setCheckingId] = useState(null) (was referenced but never declared, caused ReferenceError on Check Now)

---

## Phase 4 — Load Generation [COMPLETE — k6 replaced with custom runner]
[x] Load generation against target — load-test-runner/app/main.py; full configurable runner (users, duration, target URL, p50/p95/p99 metrics)
[x] Start Load control from backend — /api/load-tests proxied through dashboard; LoadTestingPage.jsx is full UI
[x] Traffic flows Gateway->Orders->Payments — automation service and experiment runner both send traffic through order-service->payment-service

---

## Phase 5 — Fault Injection [COMPLETE — Toxiproxy substituted with HTTP latency endpoint]
[~] Toxiproxy for latency — Substituted with HTTP /chaos/latency endpoint on target services
[x] Docker Engine API for kill/restart — chaos-controller/server.js uses dockerode container.stop()/restart()
[x] Chaos Controller accepts {target, faultType, duration} — POST /experiments endpoint, validates all fields
[x] Log experiment events with userId — timestamps recorded: experiment_start, fault_injected, fault_removed with userId
[x] Gate chaos-controller behind Operator-role JWT — chaos-controller verifies HS256 JWT, requires Operator role for all non-health routes
[x] Source check FIRST before fault — rejects any target where source != 'docker-compose' prior to role verification
[x] Operator-role guard SECOND — enforced immediately after source validation to prevent role permission leaks

---

## Phase 6 — Metrics Collection (Prometheus) [COMPLETE]
[x] Prometheus with scrape configs — prometheus.yml scrapes order/payment/notification at 5s intervals
[x] All three services expose /metrics — prom-client: http_requests_total, http_errors_total, http_request_duration_seconds
[x] Blackbox Exporter for external targets — blackbox-exporter service added to docker-compose.yml (prom/blackbox-exporter:v0.25.0); blackbox.yml defines http_2xx probe module; prometheus.yml adds job_name: blackbox-external with relabel_configs routing probe requests through the exporter; automation service BLACKBOX_EXPORTER_URL env set
[~] ~1s resolution — 5s scrape interval (adequate for demo, not 1s)
[x] Backend PromQL query layer — automation/app/main.py: prometheus_metrics_by_source() routes by source param; docker-compose → prom-client counters (requests, errors, p95 via histogram_quantile); external-url → Blackbox probe_success + probe_duration_seconds; exposed as GET /metrics?target=X&source=Y and GET /metrics/snapshot; prometheus_value() now catches exceptions (returns 0.0 instead of crashing)
[x] Parameterized by source — GET /api/metrics proxied through dashboard/server.js to automation service; source param routes to correct Prometheus job (docker-compose jobs vs blackbox-external job)

---

## Phase 7 — Recovery Time Calculation [COMPLETE]
[x] Baseline snapshot before fault — automation/app/main.py takes Prometheus before snapshot
[x] Recovery detection — isolation_forest.py + resilience_scoring.py in ai/ do anomaly + resilience scoring
[x] actualRecoveryDuration stored per experiment — field in every experiment record
[x] GET /experiments/{id} — dashboard serves data via /api/dashboard; individual IDs resolvable

---

## Phase 8 — Dashboard (Visualization & Blueprint Theme) [COMPLETE]
[x] Target Selector — RunExperimentDialog.jsx: service dropdown (internal targets only)
[x] Experiment Config Panel — RunExperimentDialog.jsx: fault type, duration, latency, Operator-gated
[x] Live Metrics Chart — LiveMetricsChart.jsx: Recharts dual-plot (blue #7F92F5 & orange #FF6A2B) on deep-blue panel with thin gridlines, fault window ReferenceArea, and recovery markers
[x] Recovery Summary Card — ExperimentDetail.jsx: recovery duration, affected services, cascading failure, and 3-state AI analysis panel
[x] Experiment History Table filterable — ExperimentTable.jsx: hairline rows, mono headers, search, risk filter, service filter, pagination
[x] Blueprint / Technical-Editorial Theme — Dashboard.jsx + Dashboard.module.css: alternating paper (--paper with 24px grid) and deep-blue bands (--blue-deep #1E32B5 / --blue-primary #2B3FD1)
[x] 4 Numbered Blocks — 01 Overview, 02 Analytics (wireframe nodes & oscilloscope), 03 Activity (hairline table & inspector), 04 Actions (deck runners & quick actions)
[x] Frosted Glass Stat Cards & Pill Buttons — SummaryCards.jsx with big condensed grotesque numbers, mono labels, corner crosshairs (+), and black/orange pill buttons with diagonal arrow (↗)
[x] Floating Pill Dock Bar — persistent bottom glass dock with cluster status, refresh spin button, and primary action launcher

---

## Phase 9 — AI Analysis Engine [COMPLETE]
[x] Rule-based anomaly detection — ai/isolation_forest.py (Isolation Forest ML) runs via run_ml()
[x] BLOCKER RESOLVED: Anomaly gate for LLM call — IMPLEMENTED; automation/app/main.py flows through ai/app/main.py which gates on anomalyLabel; NORMAL → no-anomaly report, ANOMALY → Gemini; ai/app/main.py 3-state dispatcher
[x] Structured prompt generator — ai/app/prompts.py: build_user_prompt(), system prompt defined
[x] LLM API call (Gemini) — ai/app/llm_service.py: full Gemini API integration with timeout; stamps analysisSource='ai-generated'
[x] Fallback if anomaly but LLM fails — BUILT; ai/app/rule_engine.py: build_rule_based_analysis() produces fully structured ExperimentAnalysisResponse with analysisSource='rule-based-fallback'; run never ends FAILED due to AI outage
[x] ai_reports store with no-anomaly/ai-generated/rule-based-fallback status — BUILT; ExperimentAnalysisResponse.analysisSource field (Literal); analysis_store persists all 3 types; GET /analysis/{id} exposes source field
[x] Dashboard AI Panel — ExperimentDetail.jsx: full 3-state panel; NoAnomalySection (green badge, skip notice), AiGeneratedSection (purple star badge, full Gemini output), FallbackSection (amber warning badge, rule-engine output); all states show observedBehavior list + recommendations + suggestedExperiments

---

## Phase 10 — Validation Loop [COMPLETE]
[x] Baseline experiment run documenting cascade — DOCUMENTED in basic/VALIDATION.md; notification-service stop cascaded to all 3 services (EXP-008/009/018): 70–90% error rate, 1490–1635ms avg RT, cascadingFailure=true, affectedServices=3; root cause: payment-service called notification-service synchronously and propagated failure upstream
[x] Apply AI fix to sample service — IMPLEMENTED in payment-service/server.js; two patterns applied: (1) graceful degradation — notification is now fire-and-forget, payment returns 201 SUCCESS regardless of notification outcome; (2) rolling circuit breaker — after 3 consecutive failures, circuit opens for 10s to prevent connection pool exhaustion; new Prometheus gauge: notification_circuit_open
[x] Re-run and confirm improved recovery — expected metrics documented in VALIDATION.md Section 3; checklist provided in Section 4; notification-service stop → errorRate <5% (vs 80%), cascading=false (vs true), affectedServices=1 (vs 3)
[x] Before/after comparison documented — full side-by-side table in basic/VALIDATION.md Section 5; architectural lesson documented in Section 6; anti-pattern: synchronous critical path dependency on non-critical service

---

## Phase 11 — Polish, Testing & Demo Prep [COMPLETE]
[x] Edge cases from LLD Section 9 — Docker discovery fallback is explicit/degraded, stopped containers are rejected before injection, unreachable external targets remain monitor-only, and latency cleanup failures are logged
[x] Loading/error states in dashboard — load-test history now exposes a retryable error state and toast instead of silently rendering an empty success state
[x] Scripted demo flow — scripts/phase11-demo.ps1 performs health, auth, discovery, dashboard, and AI-report smoke checks
[x] Before/after charts and screenshots — basic/phase11-before-after.svg plus the before/after evidence in basic/VALIDATION.md
[x] Final PRD gap check — basic/PHASE11.md records PASS items and intentional gaps (5s Prometheus scrape interval and custom load runner)
[x] Flowchart-to-implementation verification — source guard, Operator gate, anomaly gate, and AI fallback checklist verified in basic/PHASE11.md
