# AI Failure Analysis Service

## Purpose

This service interprets one already-measured chaos experiment with Gemini. The ML and resilience pipelines calculate anomaly and resilience values first; this service explains those supplied values and suggests relevant resilience actions.

## Architecture

```text
Client -> POST /analyze-experiment -> FastAPI -> Gemini
                                      |
                                      -> structured JSON response
```

It runs at `http://localhost:8000` when started with Docker Compose.

## Environment variables

- `GEMINI_API_KEY`: required Gemini API key. Never commit this value.
- `GEMINI_MODEL`: optional model name. Defaults to `gemini-2.5-flash`.
- `GEMINI_TIMEOUT_SECONDS`: optional request timeout. Defaults to `30`.

The root `.gitignore` excludes `.env`. For local use, set variables in PowerShell or create an untracked `.env` file in the project root.

## Start

From the project root:

```powershell
docker compose build ai-service
docker compose up -d ai-service
```

Check the container:

```powershell
docker ps
```

## Endpoints

```http
GET  /health
POST /analyze-experiment
```

Invalid request bodies return `422`. Missing `GEMINI_API_KEY` returns `503`. Gemini timeouts, API errors, and malformed JSON return `502`.

## Test request

```powershell
$body = Get-Content .\data\exp-112-request.json -Raw
Invoke-RestMethod -Method Post -Uri http://localhost:8000/analyze-experiment -ContentType application/json -Body $body
```

The request body must contain the measured experiment fields, including anomaly and resilience results.

## Safety and grounding rules

- The service does not calculate anomaly score, resilience score, error rate, recovery time, or risk level.
- The supplied experiment values are the only source of facts.
- The model must label direct facts as `OBSERVED:` and interpretations as `INFERRED:`.
- Unsupported root causes are not invented; the response states that tracing or log analysis is required.
- Recommendations are limited to mechanisms relevant to the supplied behavior.
- The service does not execute experiments, remediate services, or modify datasets.
