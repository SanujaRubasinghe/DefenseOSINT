FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

# shared contracts first (changes less often -> better layer caching)
COPY shared /shared
RUN pip install --no-cache-dir -e /shared

COPY services/planner-agent/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/planner-agent/ .

EXPOSE 8000
CMD ["uvicorn", "planner_agent.main:app", "--host", "0.0.0.0", "--port", "8000"]
