import asyncio
import json
import os

from google import genai
from google.genai import types

from .models import ExperimentAnalysisRequest, ExperimentAnalysisResponse
from .prompts import SYSTEM_PROMPT, build_user_prompt


class MissingApiKeyError(RuntimeError):
    pass


class LlmServiceError(RuntimeError):
    pass


def parse_analysis_response(result: object) -> ExperimentAnalysisResponse:
    parsed_response = getattr(result, "parsed", None)
    if parsed_response is not None:
        if isinstance(parsed_response, ExperimentAnalysisResponse):
            return parsed_response
        if isinstance(parsed_response, dict):
            return ExperimentAnalysisResponse.from_json(parsed_response)

    response_text = getattr(result, "text", None)
    if not isinstance(response_text, str) or not response_text.strip():
        raise LlmServiceError("Gemini returned an empty analysis response")

    cleaned_text = response_text.strip()
    if cleaned_text.startswith("```") and cleaned_text.endswith("```"):
        first_newline = cleaned_text.find("\n")
        cleaned_text = cleaned_text[first_newline + 1:-3].strip()

    try:
        response_data = json.loads(cleaned_text)
        return ExperimentAnalysisResponse.from_json(response_data)
    except (json.JSONDecodeError, TypeError, ValueError) as error:
        raise LlmServiceError("Gemini returned malformed analysis JSON") from error


class LlmService:
    def __init__(self) -> None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise MissingApiKeyError("GEMINI_API_KEY is not configured")
        self.client = genai.Client(api_key=api_key)
        self.model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        self.timeout_seconds = float(os.getenv("GEMINI_TIMEOUT_SECONDS", "30"))

    async def analyze(self, experiment: ExperimentAnalysisRequest) -> ExperimentAnalysisResponse:
        payload = experiment.model_dump(mode="json")
        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(
                    self.client.models.generate_content,
                    model=self.model,
                    contents=build_user_prompt(payload),
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_PROMPT,
                        response_mime_type="application/json",
                        response_schema=ExperimentAnalysisResponse,
                    ),
                ),
                timeout=self.timeout_seconds,
            )
        except asyncio.TimeoutError as error:
            raise LlmServiceError("Gemini request timed out") from error
        except Exception as error:
            raise LlmServiceError(f"Gemini API error: {error}") from error

        analysis = parse_analysis_response(result)

        if analysis.experimentId != experiment.experimentId:
            raise LlmServiceError("Gemini response experimentId does not match request")
        return analysis
