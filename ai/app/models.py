from typing import Any, Literal

from pydantic import BaseModel, Field


class ExperimentAnalysisRequest(BaseModel):
    experimentId: str
    targetService: str
    failureType: str
    configuredFailureDuration: float | None = None
    injectedLatencyMilliseconds: float | None = None
    actualRecoveryDuration: float | None = None
    totalRequests: int | None = None
    successfulRequests: int | None = None
    failedRequests: int | None = None
    errorRate: float | None = Field(default=None, ge=0, le=100)
    averageResponseTime: float | None = None
    peakResponseTime: float | None = None
    affectedServiceCount: int | None = None
    cascadingFailure: bool | None = None
    anomalyLabel: str | None = None
    anomalyScore: float | None = None
    resilienceScore: float | None = Field(default=None, ge=0, le=100)
    riskLevel: str | None = None


class Recommendation(BaseModel):
    priority: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    action: str
    reason: str


class SuggestedExperiment(BaseModel):
    failureType: str
    targetService: str
    reason: str


class ExperimentAnalysisResponse(BaseModel):
    experimentId: str
    failureSummary: str
    severityExplanation: str
    observedBehavior: list[str]
    likelyFailureMechanism: str
    resilienceAssessment: str
    recommendations: list[Recommendation]
    suggestedExperiments: list[SuggestedExperiment]

    @classmethod
    def from_json(cls, value: Any) -> "ExperimentAnalysisResponse":
        return cls.model_validate(value)
