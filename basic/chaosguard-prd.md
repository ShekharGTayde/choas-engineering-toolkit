# Product Requirements Document (PRD)

## Product: ChaosGuard
**Version:** 1.0 (MVP)
**Document owner:** Team

---

## 1. Purpose

ChaosGuard is a developer platform that combines controlled chaos experiments,
real-time observability, and AI-driven analysis to help engineering teams
discover microservice performance and resilience issues before they reach
production. This document defines the scope, requirements, and success
criteria for the MVP.

---

## 2. Problem Statement

Teams building microservice architectures have no reliable way to know how
their system behaves under failure conditions — a slow dependency, a crashed
service, network degradation — until it happens live in production. Existing
tools (Postman, Jenkins, load testers) validate systems only under healthy
conditions. Industry data shows enterprise outages cost $9,000–$15,000 per
minute on average, and real incidents (AWS, Meta) demonstrate how a single
degraded component can cascade into multi-million-dollar, multi-hour outages.
There is no accessible, lightweight tool that lets small-to-mid teams
proactively test and fix these failure modes before deployment.

---

## 3. Goals and Objectives

| Goal | Description |
|---|---|
| G1 | Let teams deliberately inject controlled failures into their own microservices |
| G2 | Measure and visualize system behavior and recovery time during failure |
| G3 | Automatically detect failure patterns and generate actionable fix recommendations |
| G4 | Support both internal (owned) services and external/existing services for latency monitoring |
| G5 | Be lightweight enough for a small team to adopt without dedicated SRE infrastructure |

### Non-goals (explicitly out of scope for MVP)
- Kubernetes-native chaos experiments (Docker Compose only for MVP)
- Multi-region/cloud failure simulation
- Destructive fault injection against external/third-party services
- Automatic self-healing/remediation (recommendations only, not auto-fix)

---

## 4. Target Users

| Persona | Need |
|---|---|
| Backend/DevOps Engineer | Wants to verify their service survives a dependency failure before shipping |
| Engineering Team Lead | Wants a measurable resilience metric (recovery time) to track over sprints |
| Small startup team (no SRE) | Wants chaos testing without adopting Kubernetes or paying for Gremlin |

---

## 5. User Stories

1. **As an Operator**, I want to log in securely so that only authorized users can trigger destructive experiments.
2. **As an Operator**, I want to auto-discover services running in my own Docker Compose setup so I don't have to manually register each one.
3. **As an Operator**, I want to register an external service by URL so I can monitor its latency without needing infrastructure access.
4. **As an Operator**, I want to select a fault type (latency or kill) and duration so I can run a targeted experiment.
5. **As a Viewer**, I want to see a live timeline of response time and error rate during an experiment so I can observe system behavior in real time.
6. **As a Viewer**, I want to see the computed recovery time after an experiment so I have a concrete resilience metric.
7. **As a Viewer**, I want an AI-generated, plain-English explanation of what went wrong and how to fix it, so I don't have to manually interpret raw metrics.
8. **As a Team Lead**, I want a history of past experiments so I can track whether resilience is improving over time.
9. **As any user**, I want external services to be protected from destructive actions so the tool can never be misused to disrupt infrastructure we don't own.

---

## 6. Functional Requirements

### 6.1 Authentication & Access Control
- FR1: Users must log in via email/password; system issues a JWT
- FR2: Two roles supported — `Viewer` (read-only) and `Operator` (can trigger experiments)
- FR3: All fault-injection endpoints must reject requests without a valid Operator-role JWT
- FR4: Every triggered experiment must be logged with user ID, timestamp, target, and fault type

### 6.2 Target Selection
- FR5: System must auto-discover Docker Compose services labeled `chaosguard.target=true`
- FR6: Users must be able to manually register an external service via URL
- FR7: External targets must be flagged as `monitor-only` and never accept kill/latency-injection requests, enforced at the API layer (not just UI)

### 6.3 Fault Injection
- FR8: System must support at least two fault types for internal services: latency injection and service kill
- FR9: Latency injection must be configurable (duration, delay amount)
- FR10: Service kill must automatically restart the target after the configured duration
- FR11: All fault actions must be logged with start/end timestamps

### 6.4 Load Generation
- FR12: System must generate configurable synthetic traffic (via k6) against the selected target during an experiment

### 6.5 Metrics Collection
- FR13: System must scrape internal service metrics (response time, error rate, status) at least once per second during an active experiment
- FR14: System must probe external targets for latency/uptime via a black-box style prober
- FR15: All metrics must be timestamped and queryable for a given experiment window

### 6.6 Recovery Time Calculation
- FR16: System must compute Mean Recovery Time per experiment, defined as the time from fault removal to metrics returning within a configurable threshold of pre-fault baseline, sustained for a configurable window

### 6.7 Dashboard
- FR17: Dashboard must display a live timeline chart (response time/error rate) with the fault-injection window visually highlighted
- FR18: Dashboard must display computed recovery time per completed experiment
- FR19: Dashboard must display experiment history, filterable by target and fault type
- FR20: Fault-trigger controls must only be visible/enabled for Operator-role users; external targets must never show destructive controls

### 6.8 AI Analysis
- FR21: System must trigger AI analysis automatically when an anomaly (e.g., error rate above threshold) is detected during or after an experiment
- FR22: AI output must include a plain-English root-cause summary and at least one actionable recommendation
- FR23: If the AI/LLM call fails, system must fall back to a rule-based summary rather than showing no result

---

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Safety | Fault injection must be strictly limited to services explicitly labeled/owned by the user; no destructive action may ever target an external/unlabeled service |
| Security | All API endpoints (except login) must require a valid JWT; passwords stored with bcrypt hashing |
| Performance | Metrics collection overhead must not materially distort the very latency/error metrics being measured (sub-1s scrape interval, low-overhead exporters) |
| Usability | A new user should be able to run their first experiment within 10 minutes of setup, without needing to read external documentation |
| Portability | Entire system must run via a single `docker-compose up`, with no cloud dependency required for local/demo use |
| Auditability | Every experiment must be traceable to a user, target, fault type, and timestamp |
| Extensibility | New fault types must be addable without changes to the core architecture (pluggable handler pattern) |

---

## 8. Technical Requirements / Stack

| Layer | Technology |
|---|---|
| Frontend | React + Recharts |
| Backend | FastAPI |
| Load generation | k6 |
| Fault injection | Docker Engine API (kill/restart), Toxiproxy (latency) |
| External monitoring | Blackbox-style HTTP prober |
| Metrics store | Prometheus |
| Orchestration | Docker Compose |
| AI layer | LLM API (Claude/GPT) for pattern-to-recommendation generation |
| Auth | JWT + bcrypt |

---

## 9. Success Metrics (MVP)

| Metric | Target |
|---|---|
| Mean Recovery Time reduction | Demonstrable decrease after applying an AI recommendation and re-testing (validates the "Validate: Retest & Verify" loop) |
| Time to first experiment | New user can complete login → target selection → first experiment run in under 10 minutes |
| Fault types supported | ≥ 2 (latency, kill) at MVP |
| AI recommendation relevance | Recommendation correctly identifies the deliberately-introduced root cause in demo scenarios |
| Safety | Zero destructive actions possible against unlabeled/external targets, verified by test cases |

---

## 10. Assumptions & Constraints

- Assumes the target system being tested runs in Docker (Compose) for full fault-injection capability
- Assumes external targets only require latency/uptime checking, not deep failure injection
- Assumes LLM API access (Claude/GPT) is available for the AI analysis layer
- Constrained to a single-machine/local Docker Compose deployment for MVP; multi-node/cloud scaling is a future phase

---

## 11. Future Scope (Post-MVP)

- Kubernetes-native fault injection (Litmus-style CRDs)
- Additional fault types: packet loss, CPU/memory stress, DNS failure
- CI/CD pipeline integration (Jenkins/GitHub Actions) for automated pre-deploy chaos testing
- Multi-replica / load-balanced service awareness (distinguishing true resilience from load-balancer masking)
- Team collaboration features (shared experiment history, comments, approvals)

---

## 12. Team & Ownership (per Innovation flow: Discover → Break → Understand → Recommend → Validate)

| Area | Owner |
|---|---|
| Fault injection, orchestration, Docker/Prometheus setup | DevOps lead |
| Dashboard, backend API, recovery-time computation | Dev |
| Pattern detection, LLM integration, recommendation generation | AI engineer |
