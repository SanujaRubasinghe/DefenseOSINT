# Security and Responsible AI

Owner: Member 4. The ground rules bind everyone.

## Ground rules
- No API key, token or password in any tracked file — including notebooks,
  fixtures and report screenshots. If one is committed, **rotate it**;
  reverting does not remove it from history.
- Retrieved documents are untrusted data. Never concatenate fetched text into
  a system prompt.
- Log investigation ID, agent, action and outcome — not full personal content.
- Minimise personal data: collect it only when the objective requires it.

## Controls to demonstrate by the final submission
| Control | Where | Demonstrated by |
|---|---|---|
| Authentication | gateway + A2A bearer token | request without a token is rejected |
| Input validation | gateway, each A2A handler | malformed task rejected at the boundary |
| Secret management | `.env`, not in the image | no keys in `git log -S` |
| Tool isolation | collector source allowlist | disallowed domain refused and logged |
| Audit logging | gateway + agents | trace of one full investigation |
| Prompt-injection resistance | critic-agent tests | a page telling the agent to ignore its rules fails |
| Evidence traceability | contracts | every claim links to its source |
| Human review | UI | confidence and caveats shown; no autonomous action |

## Responsible AI risks
Hallucination, source bias, false confidence, automation bias, privacy,
prompt injection, misuse. Mitigations: source attribution, evidence chains,
confidence indicators, cross-source corroboration, data minimisation, access
control, human-in-the-loop.
