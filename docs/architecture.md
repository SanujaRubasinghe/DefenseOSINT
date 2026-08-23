# Architecture

```
React UI -> Gateway -> Planner
                         |-- A2A --> Collector  (web, dns, github, news, legal, geo)
                         |-- A2A --> Entity Extractor
                         |-- A2A --> Analyst
                         `-- A2A --> Critic --> pass? finish : re-plan
```

## Rules
1. Services never import each other. Cross-service calls use
   `defenseosint_common.a2a.A2AClient`.
2. Everything on the wire is a model from `defenseosint_common.contracts`.
3. LangGraph runs *inside* an agent, never between agents.
4. No evidence without provenance; no claim without `evidence_ids`.
5. Retrieved web content is untrusted data, never instructions.
6. Config from environment; secrets never committed.

## Why the collectors are not separate agents
DNS, GitHub, news, legal and geo are tools inside the Collector. Making each
one an "agent" would be over-engineering — the academic value comes from
meaningful specialisation, not from renaming Python classes.
