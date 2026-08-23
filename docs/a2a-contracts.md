# A2A contracts

Defined in `shared/defenseosint_common/contracts.py`.

| Caller | Callee | Skill | Input | Output |
|---|---|---|---|---|
| planner | collector | `collect` | InvestigationTask | EvidenceBundle |
| planner | entity | `extract` | EvidenceBundle | EntityBundle |
| planner | analyst | `synthesize` | EvidenceBundle + EntityBundle | IntelligenceDraft |
| planner | critic | `assess` | IntelligenceDraft + EvidenceBundle | CriticAssessment |

Every request is wrapped in an `A2AMessage`; every reply is an `A2AResponse`.
If a peer is down the response comes back with `ok=False` and the Planner
re-plans instead of hanging.

Changing a contract: bump `CONTRACT_VERSION`, update this table in the same
PR, and tag all four members.
