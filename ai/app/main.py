from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from .analysis_store import AnalysisStore, AnalysisStoreError
from .llm_service import LlmService, LlmServiceError, MissingApiKeyError
from .models import ExperimentAnalysisRequest, ExperimentAnalysisResponse

analysis_store = AnalysisStore()


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        analysis_store.initialize()
    except AnalysisStoreError as error:
        raise RuntimeError(str(error)) from error
    yield


app = FastAPI(title="AI Failure Analysis Service", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"service": "ai-analysis-service", "status": "UP"}


@app.post("/analyze-experiment", response_model=ExperimentAnalysisResponse)
async def analyze_experiment(request: ExperimentAnalysisRequest) -> ExperimentAnalysisResponse:
    try:
        service = LlmService()
        analysis = await service.analyze(request)
        analysis_store.upsert(analysis)
        return analysis
    except MissingApiKeyError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except LlmServiceError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    except AnalysisStoreError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@app.get("/analysis")
async def get_analyses() -> dict[str, object]:
    try:
        analyses = analysis_store.list_all()
        return {"count": len(analyses), "analyses": analyses}
    except AnalysisStoreError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@app.get("/analysis/{experiment_id}")
async def get_analysis(experiment_id: str) -> dict[str, object]:
    try:
        analysis = analysis_store.get(experiment_id)
    except AnalysisStoreError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    if analysis is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return analysis
