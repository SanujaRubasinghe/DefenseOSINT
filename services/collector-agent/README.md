# collector-agent

**Owner:** Member 2

Retrieves public sources (web, DNS, GitHub, news, legal, geo) with provenance

## A2A contract
| Skill | Input | Output |
|---|---|---|
| _TODO_ | _TODO_ | _TODO_ |

## Run just this service
```bash
uvicorn collector_agent.main:app --reload --port 8000
```

## Test
```bash
pytest services/collector-agent/tests
```
