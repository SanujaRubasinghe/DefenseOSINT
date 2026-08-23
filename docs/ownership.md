# Who owns what

| Member | Role | Services | Branch | Evaluation metric |
|---|---|---|---|---|
| 1 | Leader / integration | gateway, planner-agent, analyst-agent, shared/, docker, CI | `feature/planner-a2a`, `feature/analyst-service` | End-to-end latency, reliability, A2A failure recovery |
| 2 | Collector / IR | collector-agent | `feature/collector-service` | Precision@K, Recall@K, MRR |
| 3 | NLP / Entity | entity-agent | `feature/entity-service` | NER + relation Precision, Recall, F1 |
| 4 | Critic / Security / RAI | critic-agent, security & RAI docs | `feature/critic-security` | Unsupported-claim rate, injection tests, provenance coverage |

Frontend work is shared; coordinate in the group chat before editing the same
component.

Ownership means you write it, test it, document it, and answer for it at the
viva. It does not mean nobody else may touch it.
