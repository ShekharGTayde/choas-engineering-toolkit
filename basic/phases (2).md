# ChaosGuard — Build Phases

This file breaks the project into sequential phases. Each phase has a goal,
deliverables, and owner(s), so the team can build incrementally and always
have something demoable at the end of each phase.

---

## Phase 0 — Setup & Planning
**Goal:** Get the base environment ready before writing feature code.

- [ ] Set up repo structure (frontend, backend, sample-services, infra)
- [ ] Set up Docker Compose skeleton (empty services, network defined)
- [ ] Set up base FastAPI backend project + base React frontend project
- [ ] Agree on API contract (endpoint names, request/response shapes) from the PRD
- [ ] Set up shared `.env` / config approach for secrets (JWT secret, LLM API key)

**Owner:** Whole team
**Demoable at end:** `docker-compose up` boots empty shells of every service

---

## Phase 1 — Sample Microservice Target System
**Goal:** Have something to actually test against.

- [ ] Build API Gateway (routes to Auth/Orders/Payments)
- [ ] Build Auth Service (simple JWT check, simulated dependency)
- [ ] Build Orders Service (calls Payments; configurable timeout on/off)
- [ ] Build Payments Service (simulates external dependency, configurable delay)
- [ ] Each service exposes `/health` and `/metrics`
- [ ] Add Docker Compose labels (`chaosguard.target=true`, etc.) to each service

**Owner:** DevOps lead + Dev
**Demoable at end:** Sample app runs end-to-end via Docker Compose, health checks pass

---

## Phase 2 — Authentication & Access Control
**Goal:** Secure the toolkit itself before any destructive features exist.

- [ ] Build Auth Service (login endpoint, JWT issuance, bcrypt password hashing)
- [ ] Define `Viewer` and `Operator` roles
- [ ] Add JWT-verification middleware to backend API
- [ ] Build login UI in React, store JWT client-side
- [ ] Add role-based UI gating (Operator-only controls hidden for Viewers)
- [ ] **Add explicit "Operator role?" check as a reusable backend guard/decorator**, applied to any endpoint that can affect a running system (not just UI hiding) — this is what Phase 5's fault-injection endpoints will depend on

**Owner:** Dev
**Demoable at end:** User can log in, receives a role, protected routes reject unauthenticated calls, and non-Operator calls are rejected server-side (not just hidden client-side)

---

## Phase 3 — Docker Compose Service Discovery
**Goal:** Auto-detect testable services instead of manual config.

- [ ] Mount Docker socket into backend container
- [ ] Implement Docker Discovery Service (`GET /containers/json?filters=chaosguard.target=true`)
- [ ] Store discovered targets in Target Registry (DB), each tagged with a `source` field (`docker-compose` or `external-url`)
- [ ] Build `POST /targets/discover` endpoint
- [ ] Build "Refresh Services" UI on the dashboard, listing discovered targets
- [ ] Add manual "Add External URL" flow (flagged `source: external-url`, `monitor-only`)
- [ ] **UI must visually distinguish `monitor-only` targets** (e.g. disabled/greyed fault controls) so Viewers/Operators can see up front which targets cannot be faulted

**Owner:** DevOps lead + Dev
**Demoable at end:** Dashboard shows live list of running sample services, auto-refreshed, with internal vs. external targets clearly marked

---

## Phase 4 — Load Generation
**Goal:** Create real traffic to observe during experiments.

- [ ] Integrate k6 script(s) to generate configurable traffic against a target
- [ ] Expose a simple "Start Load" control from the backend (duration, request rate)
- [ ] Confirm traffic flows visibly through Gateway → Orders → Payments

**Owner:** DevOps lead
**Demoable at end:** Triggering load generates visible traffic/logs across the sample services

---

## Phase 5 — Fault Injection (Core Chaos Engine)
**Goal:** The actual "chaos" — inject controlled failures.

- [ ] Integrate Toxiproxy for latency injection between services
- [ ] Implement Docker Engine API calls for kill/restart (internal targets only)
- [ ] Build Chaos Controller service: accepts `{ target, faultType, duration }`
- [ ] **Enforce safety guard as the first check inside the Chaos Controller, before any fault logic runs**: reject kill/latency requests where `target.source != docker-compose` (i.e. `monitor-only` / `external-url` targets are always rejected, regardless of caller role)
- [ ] **Enforce Operator-role guard as the second check**, using the reusable guard built in Phase 2 — order matters: source check first, then role check, so rejected-source responses don't leak whether the caller had permission
- [ ] Log `experiment_start`, `fault_injected`, `fault_removed` timestamps with `userId`
- [ ] Gate all Chaos Controller endpoints behind Operator-role JWT

**Owner:** DevOps lead
**Demoable at end:** Operator can trigger a real kill or latency fault on a chosen internal service via API; the same request against an external/monitor-only target, or from a Viewer account, is rejected with a clear error

---

## Phase 6 — Metrics Collection (Prometheus)
**Goal:** Capture what actually happened during a fault.

- [ ] Set up Prometheus with scrape configs for all internal (`docker-compose`) services
- [ ] Set up Blackbox Exporter for external/monitor-only targets, scraped on a separate job so internal vs. external metrics can be queried independently
- [ ] Verify metrics are captured at ~1s resolution during a test experiment
- [ ] Build backend query layer (PromQL queries wrapped in API endpoints), parameterized by target `source` so the dashboard can route to the right exporter's data

**Owner:** DevOps lead
**Demoable at end:** Can query Prometheus and see real response-time/error-rate data around a fault window, for both an internal fault-tested service and an external monitor-only service

---

## Phase 7 — Recovery Time Calculation
**Goal:** Turn raw metrics into the project's core resilience metric.

- [ ] Define baseline calculation (pre-fault average response time/error rate)
- [ ] Implement recovery-detection logic (metrics within X% of baseline for Y seconds)
- [ ] Compute and store `recovery_time_seconds` per experiment (a single value per experiment run — not averaged across runs)
- [ ] Expose via `GET /experiments/{id}`

**Owner:** Dev
**Demoable at end:** Every completed experiment shows a concrete recovery-time number

---

## Phase 8 — Dashboard (Visualization)
**Goal:** Make everything visible and demoable.

- [ ] Build Target Selector component (internal + external targets, external ones visually marked monitor-only)
- [ ] Build Experiment Config Panel (fault type, duration — disabled fields for external targets)
- [ ] Build Live Metrics Chart (Recharts line chart, polling live metrics)
- [ ] Build Recovery Summary Card
- [ ] Build Experiment History Table (filterable)
- [ ] Highlight fault-injection window visually on the timeline chart

**Owner:** Dev
**Demoable at end:** Full experiment can be run and watched end-to-end from the UI

---

## Phase 9 — AI Analysis Engine
**Goal:** Turn metrics into human-readable insight — but only call the (costlier/slower) LLM when something's actually worth explaining.

- [ ] Implement rule-based anomaly detection (threshold breaches, cross-service correlation) — this runs on **every** completed experiment
- [ ] **Anomaly detection is the gate for the LLM call**: if no anomaly is detected, skip the LLM entirely and mark the experiment "metrics only" (this is the flowchart's intended behavior — update if a different design is chosen)
- [ ] Build structured prompt generator (target, fault, metric deltas, correlated services) — invoked only when an anomaly was detected
- [ ] Integrate LLM API call for root-cause summary + recommendations
- [ ] Build fallback: if an anomaly *was* detected but the LLM call fails (timeout/error), fall back to a rule-based summary instead of leaving the report blank
- [ ] Store results in `ai_reports`, link to experiment, with a status field (`no-anomaly` / `ai-generated` / `rule-based-fallback`)
- [ ] Build AI Report Panel in the dashboard, rendering differently per status (e.g. "No anomalies detected — metrics only" vs. a full AI report vs. a fallback summary)

**Owner:** AI engineer
**Demoable at end:** After an experiment with induced failure, dashboard shows an AI-written explanation + fix recommendation; after a clean experiment with no anomaly, dashboard clearly shows "metrics only" instead of an empty/broken AI panel

---

## Phase 10 — Validation Loop ("Discover → Break → Understand → Recommend → Validate")
**Goal:** Prove the tool's core value proposition end-to-end.

- [ ] Run baseline experiment on Orders→Payments with no timeout configured → observe cascading failure + long recovery time
- [ ] Apply the AI's recommended fix (e.g., add timeout/circuit breaker) to the sample service
- [ ] Re-run the same experiment → confirm improved recovery time and no cascade
- [ ] Document before/after comparison for the demo

**Owner:** Whole team
**Demoable at end:** A clear "before fix vs after fix" story — the strongest demo moment

---

## Phase 11 — Polish, Testing & Demo Prep
**Goal:** Get ready for judges.

- [x] Handle edge cases from LLD Section 9 (Docker socket unreachable, container already stopped, external target unreachable)
- [x] Add loading states / error states to the dashboard
- [x] Write a scripted demo flow (2-minute walkthrough)
- [x] Prepare before/after charts and AI report screenshots for slides
- [x] Final review of PRD requirements vs what's actually built (gap check)
- [x] **Verify the flowchart-to-implementation checklist**: Operator-role gate before fault injection, source-based safety guard before fault injection, anomaly-gated AI call with fallback — confirm all three actually behave as documented in Phases 2, 5, and 9

**Owner:** Whole team

---

## Suggested Build Order Summary

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
   → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10 → Phase 11
```

Phases 1–2 can run in parallel once Phase 0 is done. Phase 6 (Prometheus)
can start as soon as Phase 1 services expose `/metrics`, in parallel with
Phase 5 (fault injection) — both just need the sample services to exist.
