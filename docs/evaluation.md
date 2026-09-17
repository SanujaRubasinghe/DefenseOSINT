# Evaluation

Build the datasets in the first weeks, not the last one.

| Dataset | Path | Target size | Metrics | Owner |
|---|---|---|---|---|
| IR relevance | `evaluation/datasets/ir/` | 30–50 queries with labelled relevant sources | Precision@K, Recall@K, MRR | Member 2 |
| NER + relations | `evaluation/datasets/nlp/` | 20–30 annotated documents | Precision, Recall, F1 | Member 3 |
| End-to-end | `evaluation/datasets/e2e/` | 5–8 investigation scenarios | evidence-support rate, contradiction detection, latency, agent turns | Member 1 |

Running `python evaluation/run_eval.py nlp` requires entity-agent's
own dependencies, which `make setup` does not install:
`pip install -r services/entity-agent/requirements.txt` and
`python -m spacy download en_core_web_sm`.

Store examples as JSONL with a stable `id`. Run `python evaluation/run_eval.py`;
results land in `evaluation/results/` (git-ignored). Copy the numbers you keep
into this file with the date and commit hash — a metric without its commit is
not evidence.

## NLP results

**2026-09-17, commit `e0cff97`** — 23 documents (8 synthetic + 15 real headlines
from BBC/Al Jazeera/UN News feeds):

| | Precision | Recall | F1 |
|---|---|---|---|
| Entities (overall) | 0.821 | 0.807 | 0.814 |
| — PERSON | 0.688 | 0.786 | 0.733 |
| — ORG | 0.800 | 0.750 | 0.774 |
| — LOCATION | 0.920 | 0.852 | 0.885 |
| Relations | 1.000 | 0.714 | 0.833 |

PERSON is the weakest category: `en_core_web_sm` repeatedly misclassifies
single-surname mentions ("Trump", "Guterres") as ORG, and produced one entity
boundary error ("Ilhan Omar attacker" instead of "Ilhan Omar"). Both relation
recall misses are downstream of an entity type error — the correct subject
or object was found, but tagged as the wrong type ("Blackridge Holdings" and
"Vilnius" both mistagged as PERSON), so the relation's type-pair check
correctly refused to link them (see `entity_agent/extract.py`'s
`RELATION_TRIGGERS`). No real headline in this dataset used any of the 8
supported relation predicates, so relation precision/recall here is driven
entirely by the synthetic documents.
