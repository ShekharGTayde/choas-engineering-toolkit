import json
import os
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any

from .models import ExperimentAnalysisResponse


class AnalysisStoreError(RuntimeError):
    """Raised when saved AI analysis data cannot be read or written safely."""


class AnalysisStore:
    def __init__(self, path: str | Path | None = None) -> None:
        configured_path = path or os.getenv("AI_ANALYSIS_STORE_PATH", "/app/data/ai_analysis.json")
        self.path = Path(configured_path)

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self._write([])
            return
        self._read()

    def list_all(self) -> list[dict[str, Any]]:
        return self._read()

    def get(self, experiment_id: str) -> dict[str, Any] | None:
        return next(
            (analysis for analysis in self._read() if analysis.get("experimentId") == experiment_id),
            None,
        )

    def upsert(self, analysis: ExperimentAnalysisResponse) -> dict[str, Any]:
        saved_analysis = analysis.model_dump(mode="json")
        saved_analysis["analyzedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        analyses = self._read()
        updated = False
        for index, existing_analysis in enumerate(analyses):
            if existing_analysis.get("experimentId") == saved_analysis["experimentId"]:
                analyses[index] = saved_analysis
                updated = True
                break
        if not updated:
            analyses.append(saved_analysis)

        self._write(analyses)
        return saved_analysis

    def _read(self) -> list[dict[str, Any]]:
        try:
            if not self.path.exists():
                return []
            with self.path.open("r", encoding="utf-8") as file:
                content = file.read().strip()
            if not content:
                return []
            analyses = json.loads(content)
        except (OSError, json.JSONDecodeError) as error:
            raise AnalysisStoreError(f"Unable to read analysis store: {error}") from error

        if not isinstance(analyses, list) or not all(isinstance(analysis, dict) for analysis in analyses):
            raise AnalysisStoreError("Analysis store must contain a JSON array of analysis objects")
        return analyses

    def _write(self, analyses: list[dict[str, Any]]) -> None:
        temporary_path: str | None = None
        try:
            with NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=self.path.parent,
                prefix=f".{self.path.name}.",
                suffix=".tmp",
                delete=False,
            ) as temporary_file:
                json.dump(analyses, temporary_file, ensure_ascii=False, indent=2)
                temporary_file.write("\n")
                temporary_path = temporary_file.name
            Path(temporary_path).replace(self.path)
        except OSError as error:
            raise AnalysisStoreError(f"Unable to write analysis store: {error}") from error
        finally:
            if temporary_path:
                Path(temporary_path).unlink(missing_ok=True)
