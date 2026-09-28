import os
from datetime import datetime, timezone
from typing import Any

from pymongo import MongoClient
from pymongo.errors import PyMongoError

from .models import ExperimentAnalysisResponse


class AnalysisStoreError(RuntimeError):
    """Raised when saved AI analysis data cannot be read or written safely."""


class AnalysisStore:
    def __init__(self, path: str | None = None) -> None:
        # ``path`` is retained only for source compatibility; persistence is MongoDB-only.
        self.mongo_uri = os.environ["MONGODB_URI"]
        self.database_name = os.getenv("MONGODB_DB", "chaosguard")
        self.client = MongoClient(self.mongo_uri, serverSelectionTimeoutMS=5000)
        self.collection = self.client[self.database_name]["ai_reports"]

    def initialize(self) -> None:
        try:
            self.client.admin.command("ping")
        except PyMongoError as error:
            raise AnalysisStoreError(f"MongoDB is unavailable: {error}") from error

    def list_all(self) -> list[dict[str, Any]]:
        try:
            return list(self.collection.find({}, {"_id": 0}))
        except PyMongoError as error:
            raise AnalysisStoreError(f"Unable to read analysis store: {error}") from error

    def get(self, experiment_id: str) -> dict[str, Any] | None:
        try:
            return self.collection.find_one({"experimentId": experiment_id}, {"_id": 0})
        except PyMongoError as error:
            raise AnalysisStoreError(f"Unable to read analysis store: {error}") from error

    def upsert(self, analysis: ExperimentAnalysisResponse) -> dict[str, Any]:
        saved_analysis = analysis.model_dump(mode="json")
        saved_analysis["analyzedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        try:
            self.collection.replace_one(
                {"experimentId": saved_analysis["experimentId"]},
                saved_analysis,
                upsert=True,
            )
        except PyMongoError as error:
            raise AnalysisStoreError(f"Unable to write analysis store: {error}") from error
        return saved_analysis
