# DefenseOSINT

Multi-agent open-source intelligence platform.
IT 3041 — Information Retrieval and Web Analytics.

Six Python services communicate over A2A: a **Planner** decomposes an
investigation objective, a **Collector** retrieves public sources with
provenance, an **Entity Extractor** structures people/organisations/locations/
events, an **Analyst** writes an evidence-grounded brief, and a **Critic**
challenges it and can send the Planner back for more evidence. A **Gateway**
fronts them all for the React UI.

## Quick start

```bash
git clone https://github.com/SanujaRubasinghe/DefenseOSINT.git && cd DefenseOSINT
cp .env.example .env        # add your API keys
make setup
ollama pull qwen2.5:3b
make up
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Gateway | http://localhost:8000/docs |
| Planner / Collector / Entity / Critic / Analyst | ports 8001–8005 |

## Layout

```
shared/      contracts + A2A client (everyone depends on this)
services/    one folder per agent = one container
frontend/    React + Vite analyst UI
evaluation/  datasets and metric scripts
docs/        architecture, contracts, ownership, security & RAI
tests/       cross-service tests
```

## Contributors
| Member | Role | Owns |
|---|---|---|
| Rubasinghe R.S. | Orchestration and synthesis | gateway, planner-agent, analyst-agent, shared/, docker |
| D.M.A.S.B. Thanayamwatta | Collector / IR | collector-agent |
| H.M.R.M. Vidyanjani | NLP / Entity | entity-agent |
| M.M.M. Javid | Critic / Security / RAI | critic-agent |

See `docs/` for architecture and workflow.
