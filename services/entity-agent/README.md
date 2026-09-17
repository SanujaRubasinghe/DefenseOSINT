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

Relations are extracted with a shallow dependency-pattern match: for each
sentence, a small lemma lexicon (`work` -> `works_for`, `base` ->
`headquartered_in`, etc.) is checked against the sentence's trigger tokens,
and the syntactic subject/object of that trigger (direct, or via a
preposition) are matched against recognised entities. It deliberately never
emits a relation from plain co-occurrence — only from a matched syntactic
pattern — since an unsupported link is exactly what critic-agent's citation
checks are meant to catch. Confidence is intentionally lower than entity
confidence, since this is a heuristic pattern match, not a model judgement.

## Run just this service
```bash
python -m spacy download en_core_web_sm   # once
uvicorn entity_agent.main:app --reload --port 8000
```

## Test
```bash
pytest services/entity-agent/tests
```
