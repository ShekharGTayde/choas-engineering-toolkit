FROM python:3.12-slim

WORKDIR /app

COPY automation/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY automation/app ./automation/app
COPY ai/isolation_forest.py ai/resilience_scoring.py ./ai/

EXPOSE 8100

CMD ["uvicorn", "automation.app.main:app", "--host", "0.0.0.0", "--port", "8100"]
