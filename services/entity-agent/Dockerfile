FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

# shared contracts first (changes less often -> better layer caching)
COPY shared /shared
RUN pip install --no-cache-dir -e /shared

COPY services/entity-agent/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && python -m spacy download en_core_web_sm \
 && python -m coreferee install en

COPY services/entity-agent/ .

EXPOSE 8000
CMD ["uvicorn", "entity_agent.main:app", "--host", "0.0.0.0", "--port", "8000"]
