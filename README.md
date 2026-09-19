<div align="center">

<h1>⚡ Choas-Engineering-Toolkit</h1>
<h3>AI-Powered Chaos Engineering Toolkit</h3>

<p>
  <img src="https://img.shields.io/badge/Team-FaultHunters-213448?style=for-the-badge&logo=github&logoColor=EAE0CF" />
  <img src="https://img.shields.io/badge/License-MIT-94B4C1?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" />
  <img src="https://img.shields.io/badge/Python-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/AI-Gemini_2.5_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white" />
</p>

<p><em>Break things on purpose. Understand why. Build systems that survive.</em></p>

</div>

---

## Table of Contents

- [Problem Statement](#-problem-statement)
- [The Solution](#-the-solution)
- [Tech Stack](#-tech-stack)
- [Architecture Flowchart](#-architecture-flowchart)
- [Getting Started](#-getting-started)
- [Project Structure](#-project-structure)
- [Contributing Team](#-contributing-team)
- [License](#-license)

---

## Problem Statement

Modern distributed systems — microservices, event-driven pipelines, containerised workloads — fail in ways that are **non-obvious, cascading, and expensive to discover in production**.

Teams face a recurring set of problems:

| Problem | Impact |
|---|---|
| Unknown failure modes lurking in inter-service dependencies | Silent data loss, cascading outages |
| No structured way to verify resilience before a production incident | Reactive firefighting instead of proactive hardening |
| Chaos experiments run manually with no baseline metrics | Anecdotal results, no reproducibility |
| Anomaly detection requires specialist ML expertise | Engineers skip it; blind spots remain |
| Incident reports written post-mortem with incomplete data | Slow learning, repeated failures |

**The core gap:** There is no accessible, end-to-end toolkit that **injects controlled faults, measures their real impact against a live metrics baseline, detects anomalies automatically, scores system resilience, and then explains the results in plain language** — all from a single operator console.

---

## The Solution

**ChaosGuard** is an AI-powered chaos engineering platform that turns chaotic failure scenarios into structured, repeatable, and explainable experiments.

### How It Works

1. **Target real microservices** running in Docker Compose — `payment-service`, `order-service`, `notification-service`.
2. **Inject controlled faults**: stop a container, restart it, or inject artificial network latency (500 ms → 5000 ms).
3. **Measure live impact** using Prometheus scraping + real-time probe chains across services.
4. **Detect anomalies automatically** using an Isolation Forest ML model trained on the captured metrics.
5. **Score resilience** using a quantitative scoring engine that evaluates recovery time, error rate, and service dependency behaviour.
6. **Explain everything** using Google Gemini 2.5 Flash — the AI reads the measured experiment data and produces grounded, cited recommendations in plain English.
7. **Automate experiment pipelines** — schedule multi-step chaos scenarios with no manual intervention.
8. **Load test under chaos** — simulate up to 2,000 concurrent users while a fault is live to understand compounded failure.
9. **Visualise in real time** from the ChaosGuard dashboard — a dual-theme (Night Ops / Daylight) operator console with live charts, status badges, and AI report panels.

### Key Differentiators

- **AI-grounded analysis**: Gemini is constrained to only reference the measured experiment values. It labels facts as `OBSERVED:` and interpretations as `INFERRED:` — no hallucinated root causes.
- **ML-native anomaly detection**: Isolation Forest runs without requiring labelled training data — anomalies are detected unsupervised.
- **Full automation loop**: Chaos → Metrics → Anomaly → Resilience Score → AI Report, all triggered via a single API call.
- **Production-grade dashboard**: Not a prototype UI. A dual-theme operator console designed for long monitoring sessions.

---

## Tech Stack

### Backend Services

| Service | Language / Runtime | Framework | Role |
|---|---|---|---|
| `chaos-controller` | Node.js | Express + Dockerode | Fault injection via Docker socket; experiment lifecycle management |
| `ai-service` | Python | FastAPI | ML pipeline (Isolation Forest, resilience scoring) + Gemini 2.5 Flash analysis |
| `automation-service` | Python | FastAPI | Orchestrates multi-step experiment pipelines |
| `load-test-runner` | Python | FastAPI + asyncio | Concurrent load testing (up to 2,000 users) under live faults |
| `dashboard` | Node.js | Express | Aggregation API + serves the frontend operator console |
| `notification-service` | Node.js | Express | Target microservice — simulates downstream notification fan-out |
| `order-service` | Node.js | Express | Target microservice — simulates order processing with payment dependency |
| `payment-service` | Node.js | Express | Target microservice — simulates payment gateway |

### AI & Machine Learning

| Component | Technology |
|---|---|
| LLM Analysis | Google Gemini 2.5 Flash (`google-generativeai`) |
| Anomaly Detection | Scikit-learn `IsolationForest` |
| Resilience Scoring | Custom Python scoring engine |
| Data Analysis | Pandas, NumPy |

### Observability

| Component | Technology |
|---|---|
| Metrics Collection | Prometheus v2.55.1 |
| Metrics Exposition | `/metrics` endpoints on each target service |
| Real-time Probing | HTTP probe chains (order → payment → notification) |

### Infrastructure & DevOps

| Component | Technology |
|---|---|
| Containerisation | Docker + Docker Compose |
| Networking | Custom bridge network (MTU 1450 for Wi-Fi/WSL2 stability) |
| Fault Injection | Docker socket API (stop, restart, latency injection) |
| Environment Config | `.env` file, `sample.env` template |

### Frontend

| Component | Technology |
|---|---|
| Dashboard UI | Vanilla HTML + CSS + JavaScript |
| Design System | Space Grotesk + JetBrains Mono, dual-theme (Night Ops / Daylight) |
| Charts | Real-time line charts with fault-window shading |
| Fonts | Google Fonts |

---

## Architecture Flowchart

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ChaosGuard Platform                             │
│                                                                         │
│  ┌──────────────┐    HTTP     ┌──────────────────────────────────────┐  │
│  │   Operator   │ ──────────► │          Dashboard  :8080            │  │
│  │  (Browser)   │            │   Operator Console · Dual-theme UI   │  │
│  └──────────────┘            └──────┬─────────┬───────────┬─────────┘  │
│                                     │         │           │             │
│                          ┌──────────┘  ┌──────┘    ┌─────┘             │
│                          ▼             ▼           ▼                   │
│               ┌──────────────┐  ┌───────────┐  ┌──────────────────┐   │
│               │    Chaos     │  │    AI     │  │   Automation     │   │
│               │  Controller  │  │  Service  │  │    Service       │   │
│               │    :4000     │  │   :8000   │  │     :8100        │   │
│               └──────┬───────┘  └─────┬─────┘  └────────┬─────────┘   │
│                      │                │                  │             │
│            Docker    │          ┌─────┴────┐    ┌────────┴──────┐      │
│            Socket    │          │Isolation │    │ Multi-Step    │      │
│               │      │          │  Forest  │    │  Experiment   │      │
│               ▼      │          │  + Score │    │  Pipelines    │      │
│  ┌────────────────────────────┐ └──────────┘    └───────────────┘      │
│  │     Target Microservices  │                                         │
│  │  ┌──────────┐ ┌─────────┐ │    ┌────────────────────────────────┐  │
│  │  │ payment  │ │  order  │ │    │   Load Test Runner  :8200      │  │
│  │  │  :3000   │ │  :3001  │ │    │  Simulates 2000 concurrent     │  │
│  │  └──────────┘ └─────────┘ │    │  users under live fault        │  │
│  │  ┌────────────────────┐   │    └────────────────────────────────┘  │
│  │  │  notification      │   │                                         │
│  │  │     :3002          │   │    ┌────────────────────────────────┐  │
│  │  └────────────────────┘   │    │      Prometheus  :9090         │  │
│  └────────────────────────────┘    │  Scrapes /metrics from all     │  │
│                                    │  target services               │  │
│                                    └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘

  Experiment Lifecycle
  ─────────────────────────────────────────────────────────────────────▶
  [Define Target] → [Inject Fault] → [Probe Impact] → [Collect Metrics]
       → [Isolation Forest Anomaly] → [Resilience Score]
           → [Gemini AI Analysis] → [Dashboard Report]
```

---

## Getting Started

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Docker Desktop | >= 4.x | Must be running with Compose v2 |
| Docker Compose | >= 2.x | Bundled with Docker Desktop |
| Google Gemini API Key | — | [Get one free at Google AI Studio](https://aistudio.google.com/) |

> **WSL2 / Wi-Fi Users**: The compose file sets network MTU to 1450 to prevent ETIMEDOUT errors on wireless or WSL2 environments. No extra config needed.

---

### 1. Clone the Repository

```bash
git clone https://github.com/ShekharGTayde/choas-engineering-toolkit.git
cd choas-engineering-toolkit
```

---

### 2. Configure Environment Variables

Copy the sample environment file and add your Gemini API key:

```powershell
# Windows PowerShell
Copy-Item sample.env .env
```

```bash
# Linux / macOS / WSL2
cp sample.env .env
```

Open `.env` and set:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash          # optional, this is the default
GEMINI_TIMEOUT_SECONDS=30              # optional, this is the default
```

> **Never commit your `.env` file.** It is already excluded in `.gitignore`.

---

### 3. Build & Start All Services

```bash
docker compose up --build -d
```

This starts 9 containers:

| Container | URL | Role |
|---|---|---|
| `chaos-dashboard` | http://localhost:8080 | Main operator console |
| `chaos-controller` | http://localhost:4000 | Fault injection API |
| `ai-analysis-service` | http://localhost:8000 | AI + ML analysis |
| `experiment-automation` | http://localhost:8100 | Automated pipelines |
| `load-test-runner` | http://localhost:8200 | Load testing |
| `payment-service` | http://localhost:3000 | Target service |
| `order-service` | http://localhost:3001 | Target service |
| `notification-service` | http://localhost:3002 | Target service |
| `prometheus` | http://localhost:9090 | Metrics collection |

---

### 4. Open the Dashboard

Navigate to: **http://localhost:8080**

---

### 5. Run Your First Experiment

**Via Dashboard UI:**
1. Navigate to **Experiments** in the sidebar
2. Select a target service (e.g., `payment-service`)
3. Choose a fault type: `stop`, `restart`, or `latency`
4. Set fault duration and click **Run Experiment**
5. Watch live metrics update and wait for the AI report

**Via API (PowerShell):**

```powershell
# Inject a 2-second latency fault into the payment service for 30 seconds
$body = @{
    service       = "payment-service"
    failureType   = "latency"
    latencyMs     = 2000
    durationSeconds = 30
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
    -Uri http://localhost:4000/experiments `
    -ContentType application/json `
    -Body $body
```

---

### 6. Check Service Health

```powershell
# AI Service health
Invoke-RestMethod http://localhost:8000/health

# Chaos Controller experiment list
Invoke-RestMethod http://localhost:4000/experiments
```

---

### 7. Stop All Services

```bash
docker compose down
```

---

## Project Structure

```
chaos-engineering-toolkit/
│
├── docker-compose.yml             # Orchestrates all 9 services
├── prometheus.yml                 # Prometheus scrape config
├── sample.env                     # Environment variable template
├── .env                           # Local secrets (git-ignored)
├── .gitignore
│
├── ai/                            # AI & ML Analysis Service (Python / FastAPI)
│   ├── app/                       # FastAPI application
│   ├── data_analysis.py           # Pandas/NumPy data pipeline
│   ├── isolation_forest.py        # Unsupervised anomaly detection (sklearn)
│   ├── resilience_scoring.py      # Quantitative resilience scoring engine
│   ├── outputs/                   # Analysis result outputs
│   ├── requirements.txt
│   ├── Dockerfile
│   └── README.md
│
├── chaos-controller/              # Fault Injection Service (Node.js / Express)
│   ├── server.js                  # Dockerode-based fault injection API
│   ├── data/                      # Experiment persistence (JSON)
│   ├── package.json
│   └── Dockerfile
│
├── dashboard/                     # Operator Console (Node.js + Vanilla JS/CSS)
│   ├── server.js                  # Aggregation API + static file server
│   ├── public/                    # Frontend assets (HTML, CSS, JS)
│   ├── ui/                        # UI components
│   ├── servers/                   # Registered server configs
│   └── Dockerfile
│
├── automation/                    # Experiment Automation Service (Python / FastAPI)
│   ├── app/                       # Pipeline orchestration logic
│   ├── requirements.txt
│   └── Dockerfile
│
├── load-test-runner/              # Concurrent Load Testing (Python / FastAPI)
│   ├── app/                       # Async load generation engine
│   ├── requirements.txt
│   └── Dockerfile
│
├── experiment-runner/             # Standalone Experiment Runner (Node.js)
│   ├── runner.js                  # CLI-style experiment execution
│   └── package.json
│
├── payment-service/               # Target Microservice (Node.js)
│   └── ...                        # Simulates payment gateway with /metrics
│
├── order-service/                 # Target Microservice (Node.js)
│   └── ...                        # Simulates order processing with /metrics
│
├── notification-service/          # Target Microservice (Node.js)
│   └── ...                        # Simulates notification fan-out with /metrics
│
├── data/                          # Shared experiment data volume
│   └── experiments.json           # Persisted experiment history + AI results
│
├── local-logs/                    # Local container log snapshots
│
└── basic/                         # Design & Reference Docs
    ├── design.md                  # ChaosGuard design system (colors, typography, layout)
    └── memory.md                  # Agent memory / context notes
```

---

## Contributing Team

<div align="center">

### Team FaultHunters

*We break systems intentionally so production never has to.*

</div>

| Role | Name | Responsibilities |
|---|---|---|
| **Dev** | **Shekhar Tayde** | Core backend architecture, chaos-controller, experiment lifecycle engine, Docker socket integration |
| **AI Engineer** | **Aditya Barandwal** | AI service design, Gemini prompt engineering, Isolation Forest anomaly detection, resilience scoring engine |
| **AI Engineer** | **Updesh Janjal** | AI pipeline integration, data analysis workflows, FastAPI service development, ML model tuning |
| **DevOps** | **Piyush** | Docker Compose orchestration, container networking, Prometheus observability setup, CI/CD pipeline |
| **Design** | **Yogesh Magar** | ChaosGuard design system, dual-theme UI (Night Ops / Daylight), dashboard UX, component library |
| **Documentation** | **Inaya Khan** | Technical documentation, README, API references, design system docs, onboarding guides |

---

## License

```
MIT License

Copyright (c) 2026 Team FaultHunters

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

<div align="center">

**Built with fire by [Team FaultHunters](https://github.com/ShekharGTayde)**

*If your system can't survive ChaosGuard — it can't survive production.*

</div>
