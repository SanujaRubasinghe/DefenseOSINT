# entity-agent

**Owner:** Member 3

NER, entity linking, relation extraction and cross-referencing

## A2A contract
| Skill | Input | Output |
|---|---|---|
| `extract` | `EvidenceBundle` | `EntityBundle` |

Entities are extracted with spaCy (`en_core_web_sm`) NER over each evidence
record's content, restricted to PERSON / ORG / LOCATION / EVENT. The same
entity mentioned different ways across documents is merged into one record via
a deterministic `canonical_id` (a hash of entity type + normalised name), with
`evidence_ids` and `aliases` accumulated across every record that mentions it.

Relation extraction (`relationships` is currently always empty) is a follow-up
piece of work — see the handover guide's "what comes next".

## Run just this service
```bash
python -m spacy download en_core_web_sm   # once
uvicorn entity_agent.main:app --reload --port 8000
```

## Test
```bash
pytest services/entity-agent/tests
```
