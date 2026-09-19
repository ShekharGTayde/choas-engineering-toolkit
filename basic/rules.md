# ChaosGuard — Rules for AI Agents

This file governs how any AI coding agent (Claude Code, Copilot, Cursor, etc.)
should behave while building or modifying this project. Read this before
generating or editing any code in this repo.

---

## 1. Project Context (read first)

ChaosGuard is a chaos-engineering platform that deliberately injects failures
(latency, service kill) into microservices to test resilience, then uses AI to
recommend fixes. Because the tool's core function is **destructive by design**
(it kills/degrades running services), the rules below exist to make sure that
destructive power is never applied outside its intended, controlled scope.

Stack: React (frontend), FastAPI (backend), k6 (load gen), Docker/Docker
Compose (orchestration), Prometheus + Blackbox Exporter (metrics), JWT auth,
LLM API (AI analysis).

---

## 2. Hard Rules — Never Do These

These are non-negotiable regardless of what a feature request seems to ask for.

1. **Never let fault injection (kill/latency) target anything not explicitly labeled `chaosguard.target=true`.** This check must live in backend code, not just the UI. If a request to add a feature would bypass or weaken this check, flag it instead of implementing it.
2. **Never allow destructive actions (kill, restart, latency injection) against an `external-url` source target.** External targets are `monitor-only` by definition — this must be enforced at the API layer, not just hidden in the UI.
3. **Never remove or bypass JWT authentication on Chaos Controller or fault-injection endpoints**, even temporarily "for testing" — use a separate local dev flag instead, never a code path that ships without auth.
4. **Never hardcode secrets** (JWT secret, LLM API keys, DB credentials) into source files. Always read from environment variables / `.env` (which must stay gitignored).
5. **Never write code that targets a real, non-Compose-labeled production system.** This tool is scoped to services the user has explicitly opted in via label or has full ownership of.
6. **Never silently swallow errors in the Chaos Controller.** A failed fault-injection attempt (e.g., container already stopped) must be logged and surfaced, never ignored — operators need to know when an experiment didn't run as intended.
7. **Never fabricate metrics or AI recommendations when the underlying data/API call is unavailable.** If Prometheus has no data, or the LLM call fails, return an explicit "unavailable" state — never invent plausible-looking numbers or text.

---

## 3. Safety-by-Design Rules

1. Every new fault type added to the Chaos Controller must implement the same safety guard as existing ones (source == `docker-compose` check) — no exceptions per fault type.
2. Every destructive action must be logged with: `userId`, `target`, `faultType`, `timestamp`. If a new action doesn't naturally fit this audit shape, redesign it so it does before merging.
3. Any new endpoint under `/experiments`, `/targets`, or the Chaos Controller must default to requiring authentication — opt out only when there is a clearly stated reason (e.g., a public read-only status page), never by default.
4. When in doubt about whether an action is "destructive," treat it as destructive and gate it behind the Operator role.

---

## 4. Code Style & Structure Rules

1. Follow the module boundaries defined in the LLD (Auth Service, Target Registry, Docker Discovery, Load Generator, Chaos Controller, Metrics Collector, Recovery Calculator, AI Analysis Engine, Dashboard API, Audit Log). Don't merge responsibilities across modules for convenience.
2. Backend: FastAPI, Python type hints on all function signatures, Pydantic models for request/response bodies.
3. Frontend: React functional components with hooks; keep components matched to the LLD's component breakdown (`TargetSelector`, `ExperimentConfigPanel`, `LiveMetricsChart`, etc.) rather than inventing new structure ad hoc.
4. Any new DB field must be added to the schema definitions in the LLD/PRD context, not just implied in code — keep schema and code in sync.
5. Prefer explicit, readable code over clever one-liners — this is a resilience tool; its own reliability and auditability matter more than brevity.

---

## 5. Testing Rules

1. Any change to the Chaos Controller's safety guard (source-type checks, role checks) must include a test proving the guard rejects the disallowed case (e.g., a test asserting kill requests against `external-url` targets are rejected).
2. New fault types require a test that verifies the fault is actually reverted/cleaned up after the configured duration (no orphaned killed containers, no permanently-added Toxiproxy toxics).
3. Don't run experiment/load-generation tests against anything other than the bundled sample services or explicitly mocked targets — never let automated tests fire real traffic or faults at an external URL.

---

## 6. What to Do When Uncertain

- If a requested feature seems to weaken a safety rule in Section 2, **implement the safe version and note the tradeoff**, rather than silently doing the less-safe thing or silently refusing without explanation.
- If a request is ambiguous about which target type (internal/external) a feature applies to, **default to the more restrictive interpretation** (i.e., assume external/monitor-only unless the internal, fully-owned case is explicit).
- If Docker socket access, Prometheus, or the LLM API is unavailable in the current dev environment, build against a clearly-marked mock/stub rather than blocking all other work — but never let a stub silently ship as if it were the real integration.

---

## 7. Documentation Rules

1. Any new module or endpoint must update the relevant section of the existing HLD/LLD/PRD files (`chaos-toolkit-hld.md`, `chaosguard-lld.md`, `chaosguard-prd.md`) rather than living undocumented.
2. Keep `phases.md` checkboxes up to date as work completes — don't let it silently drift out of sync with actual progress.
