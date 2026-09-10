"""critic-agent — evidence and claim verification.

Implements claim verification against evidence for the DefenseOSINT platform.
"""

import asyncio
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

import httpx
from defenseosint_common.a2a import A2AMessage, reply
from defenseosint_common.config import Settings
from defenseosint_common.contracts import (
    CriticAssessment,
    DraftSection,
    EvidenceBundle,
    Finding,
    IntelligenceDraft,
    Severity,
)
from fastapi import FastAPI

settings = Settings("critic-agent")
app = FastAPI(title="critic-agent")
logger = logging.getLogger(__name__)

# A contradiction check is binary NLI with a one-token answer, so it does not
# need a large model. qwen2.5:3b is already pulled for the planner, which keeps
# it warm in Ollama and inside VRAM.
CRITIC_MODEL = os.getenv("CRITIC_MODEL", "qwen2.5:3b")
LLM_TIMEOUT = float(os.getenv("CRITIC_LLM_TIMEOUT", "20"))
# Hard ceiling on model calls per assessment. Claim pairs grow quadratically
# with section count, and the planner drops the critic after 60s (A2AClient).
MAX_VERIFICATIONS = int(os.getenv("CRITIC_MAX_VERIFICATIONS", "10"))


@app.get("/health")
async def health():
    return {"status": "ok", "service": "critic-agent"}


@app.post("/a2a/assess")
async def assess(msg: A2AMessage):
    draft = IntelligenceDraft.model_validate(msg.payload["draft"])
    evidence = EvidenceBundle.model_validate(msg.payload["evidence"])
    iteration = int(msg.payload.get("iteration", 0))
    result = await run_assessment(draft, evidence, iteration)
    return reply(msg, "critic-agent", result)


async def run_assessment(
    draft: IntelligenceDraft, evidence: EvidenceBundle, iteration: int
) -> CriticAssessment:
    """
    Perform claim verification by checking if claims in the draft are supported by evidence.

    Process:
    1. Extract all evidence IDs from the evidence bundle
    2. For each section in the draft, check if claims are supported by cited evidence
    3. Identify unsupported claims, missing citations, contradictions, and gaps
    4. Use Ollama to verify contradictions between claims and evidence
    5. Return assessment with findings and recommendations
    """
    logger.info(f"Starting critic assessment for investigation {draft.investigation_id}, iteration {iteration}")

    # Build lookup of evidence by ID
    evidence_lookup: Dict[str, Any] = {record.evidence_id: record for record in evidence.records}
    cited_evidence_ids: Set[str] = set()

    # Collect all evidence IDs cited in the draft
    for section in draft.sections:
        cited_evidence_ids.update(section.evidence_ids)

    findings: List[Finding] = []

    # Check each section for issues
    for i, section in enumerate(draft.sections):
        section_findings = await _analyze_section(section, evidence_lookup, cited_evidence_ids)
        findings.extend(section_findings)

    # Check for overall gaps and contradictions
    gap_findings = await _check_for_gaps(draft, evidence_lookup)
    findings.extend(gap_findings)

    # Check for contradictions using Ollama for enhanced verification
    contradiction_findings = await _check_for_contradictions_ollama(draft.sections, evidence_lookup)
    findings.extend(contradiction_findings)

    # Calculate citation coverage
    total_sections = len(draft.sections) or 1
    sections_with_citations = sum(1 for section in draft.sections if section.evidence_ids)
    citation_coverage = sections_with_citations / total_sections

    # Determine if assessment passes (no critical findings and sufficient coverage)
    critical_findings = [f for f in findings if f.severity == Severity.CRITICAL]
    major_findings = [f for f in findings if f.severity == Severity.MAJOR]

    passed = len(critical_findings) == 0 and len(major_findings) <= 1 and citation_coverage >= 0.7
    requires_recollection = not passed and iteration < 3  # Allow up to 3 iterations

    logger.info(f"Assessment complete: {len(findings)} findings, coverage: {citation_coverage:.2f}, passed: {passed}")

    return CriticAssessment(
        investigation_id=draft.investigation_id,
        passed=passed,
        citation_coverage=citation_coverage,
        findings=findings,
        requires_recollection=requires_recollection,
        iteration=iteration,
    )


async def _analyze_section(
    section: DraftSection,
    evidence_lookup: Dict[str, Any],
    cited_evidence_ids: Set[str]
) -> List[Finding]:
    """Analyze a single section for claim support issues."""
    findings = []

    if not section.evidence_ids:
        findings.append(Finding(
            kind="missing_citation",
            severity=Severity.MAJOR,
            description=f"Section '{section.heading}' contains claims without any supporting evidence.",
            claim=_extract_claim_from_text(section.body),
            suggested_queries=_generate_search_queries(section.body),
        ))
        return findings

    # Check if cited evidence actually exists
    invalid_citations = [eid for eid in section.evidence_ids if eid not in evidence_lookup]
    if invalid_citations:
        findings.append(Finding(
            kind="invalid_citation",
            severity=Severity.MAJOR,
            description=f"Section '{section.heading}' cites non-existent evidence: {invalid_citations}",
            claim=_extract_claim_from_text(section.body),
            suggested_queries=[],  # No suggested queries for invalid citations
        ))

    # Check for unsupported claims (simplified heuristic)
    unsupported_claims = _detect_unsupported_claims(section.body, evidence_lookup, section.evidence_ids)
    for claim in unsupported_claims:
        findings.append(Finding(
            kind="unsupported_claim",
            severity=Severity.MAJOR,
            description=f"Claim in section '{section.heading}' lacks sufficient evidence support: {claim}",
            claim=claim,
            suggested_queries=_generate_search_queries(claim),
        ))

    return findings


async def _check_for_gaps(
    draft: IntelligenceDraft,
    evidence_lookup: Dict[str, Any]
) -> List[Finding]:
    """Check for gaps in coverage - missing aspects that should be covered."""
    findings = []

    # Simple gap detection: look for expected entities/concepts that aren't covered
    full_text = f"{draft.title} {draft.executive_summary} " + \
                " ".join([s.heading + " " + s.body for s in draft.sections])

    # Look for temporal gaps
    current_year = datetime.now(timezone.utc).year
    if any(word in full_text.lower() for word in ["recent", "latest", "current", "now"]) and \
       not any(e.provenance.published_at.year >= current_year - 1
               for e in evidence_lookup.values() if e.provenance.published_at):
        findings.append(Finding(
            kind="gap",
            severity=Severity.MINOR,
            description="Document discusses recent events but evidence may lack recent sources.",
            suggested_queries=["latest developments", "recent updates"],
        ))

    return findings


async def _check_for_contradictions(
    sections: List[DraftSection],
    evidence_lookup: Dict[str, Any]
) -> List[Finding]:
    """Check for contradictory claims within or between sections."""
    findings = []

    # Extract potential claims from each section
    section_claims = []
    for section in sections:
        if section.evidence_ids:  # Only check sections with evidence
            claims = _extract_claims_from_text(section.body)
            for claim in claims:
                section_claims.append({
                    "text": claim,
                    "section": section.heading,
                    "evidence_ids": section.evidence_ids
                })

    # Look for contradictory pairs (simplified approach)
    contradiction_patterns = [
        (r"\b(increase|rise|grow)\b", r"\b(decrease|fall|decline|drop)\b"),
        (r"\b(effective|successful|work)\b", r"\b(ineffective|unsuccessful|fail)\b"),
        (r"\b(legal|legitimate)\b", r"\b(illegal|illicit|unlawful)\b"),
    ]

    for i, claim1 in enumerate(section_claims):
        for claim2 in section_claims[i+1:]:
            text1_lower = claim1["text"].lower()
            text2_lower = claim2["text"].lower()

            for pos_pattern, neg_pattern in contradiction_patterns:
                if (re.search(pos_pattern, text1_lower) and re.search(neg_pattern, text2_lower)) or \
                   (re.search(neg_pattern, text1_lower) and re.search(pos_pattern, text2_lower)):
                    findings.append(Finding(
                        kind="contradiction",
                        severity=Severity.MAJOR,
                        description=f"Potential contradiction between '{claim1['section']}' and '{claim2['section']}': "
                                  f"'{claim1['text']}' vs '{claim2['text']}'",
                        suggested_queries=[f"{claim1['text']} {claim2['text']} verification"],
                    ))

    return findings[:3]  # Limit to avoid too many findings


# Cheap antonym screen. Only claim pairs that trip one of these reach the
# model, so the number of LLM calls stays bounded rather than quadratic in the
# claim count. The model's job is to reject the false positives this screen
# inevitably produces, which is where it actually earns its cost.
CONTRADICTION_PATTERNS = [
    (r"\b(increase|increased|rise|rose|grow|grew|expand\w*)\b", r"\b(decrease|decreased|fall|fell|declin\w*|drop\w*|shrank|shrunk)\b"),
    (r"\b(effective|successful|succeeded)\b", r"\b(ineffective|unsuccessful|failed|failure)\b"),
    (r"\b(legal|legitimate|lawful)\b", r"\b(illegal|illicit|unlawful)\b"),
    (r"\b(confirmed|verified|proven)\b", r"\b(unconfirmed|unverified|disputed|alleged)\b"),
    (r"\b(owns|owned|acquired|acquisition)\b", r"\b(sold|divested|disposed)\b"),
]


def _trips_antonym_screen(text1: str, text2: str) -> bool:
    a, b = text1.lower(), text2.lower()
    for positive, negative in CONTRADICTION_PATTERNS:
        if (re.search(positive, a) and re.search(negative, b)) or (
            re.search(negative, a) and re.search(positive, b)
        ):
            return True
    return False


def _shortlist_contradiction_candidates(
    sections: List[DraftSection],
    evidence_lookup: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Pairs worth spending a model call on, capped at MAX_VERIFICATIONS."""
    entries = []
    for section in sections:
        if not section.evidence_ids:
            continue
        evidence_texts = [
            getattr(evidence_lookup[eid], "content", str(evidence_lookup[eid]))
            for eid in section.evidence_ids
            if eid in evidence_lookup
        ]
        if evidence_texts:
            entries.append({
                "section": section.heading,
                "claims": _extract_claims_from_text(section.body),
                "evidence": evidence_texts,
            })

    candidates: List[Dict[str, Any]] = []
    for i, first in enumerate(entries):
        for second in entries[i + 1:]:
            for claim1 in first["claims"]:
                for claim2 in second["claims"]:
                    if not _trips_antonym_screen(claim1, claim2):
                        continue
                    candidates.append({
                        "claim1": claim1,
                        "claim2": claim2,
                        "section1": first["section"],
                        "section2": second["section"],
                        "evidence": first["evidence"] + second["evidence"],
                    })
                    if len(candidates) >= MAX_VERIFICATIONS:
                        return candidates
    return candidates


async def _check_for_contradictions_ollama(
    sections: List[DraftSection],
    evidence_lookup: Dict[str, Any]
) -> List[Finding]:
    """Screen claim pairs, then confirm the survivors with the model in parallel."""
    candidates = _shortlist_contradiction_candidates(sections, evidence_lookup)
    if not candidates:
        return []

    logger.info("Verifying %d contradiction candidate(s) with %s", len(candidates), CRITIC_MODEL)
    verdicts = await asyncio.gather(
        *(
            _verify_contradiction_with_ollama(c["claim1"], c["claim2"], c["evidence"])
            for c in candidates
        )
    )

    findings: List[Finding] = []
    for candidate, verdict in zip(candidates, verdicts):
        pair = f"'{candidate['claim1']}' vs '{candidate['claim2']}'"
        between = f"between '{candidate['section1']}' and '{candidate['section2']}'"

        if verdict is True:
            findings.append(Finding(
                kind="contradiction",
                severity=Severity.MAJOR,
                description=f"Model-verified contradiction {between}: {pair}",
                claim=candidate["claim1"],
                suggested_queries=[f"verify contradiction: {candidate['claim1']}"],
            ))
        elif verdict is None:
            # The model could not be reached or gave no usable answer. Report
            # the screen's suspicion at lower severity rather than dropping it
            # silently, so a degraded critic is visible instead of looking
            # like a clean pass.
            findings.append(Finding(
                kind="unverified_contradiction",
                severity=Severity.MINOR,
                description=(
                    f"Possible contradiction {between} flagged by keyword screen, but model "
                    f"verification was unavailable: {pair}"
                ),
                claim=candidate["claim1"],
                suggested_queries=[f"verify contradiction: {candidate['claim1']}"],
            ))
        # verdict is False -> the model cleared it; drop the false positive.

    return findings[:5]


async def _verify_contradiction_with_ollama(
    claim1: str,
    claim2: str,
    evidence_texts: List[str]
) -> Optional[bool]:
    """Ask the model whether two claims contradict.

    Returns True/False for a clear verdict, or None when the model could not be
    reached or answered ambiguously. None is deliberately distinct from False:
    the caller must not read "could not check" as "no contradiction".
    """
    try:
        # Prepare the prompt for Ollama
        evidence_context = "\n\n".join([f"Evidence {i+1}: {text[:500]}..." for i, text in enumerate(evidence_texts[:3])])

        # Two worked examples: a 3B model is unreliable at this without them.
        # The instruction to judge the statements themselves matters — asking it
        # to decide "based on the evidence" makes it answer NO whenever the
        # evidence is thin, which is most of the time.
        prompt = f"""You judge whether two statements are logically contradictory: whether both cannot be true at the same time about the same subject and period. Judge the statements themselves. Use the context only to resolve what they refer to; thin context is not a reason to answer UNCLEAR.

Answer with exactly one word: YES, NO, or UNCLEAR.

Example 1
A: The site was taken offline in June.
B: The site remained operational throughout June.
Answer: YES

Example 2
A: The firm is based in Riga.
B: The firm was founded in 2012.
Answer: NO

Now judge this pair.
Context: {evidence_context}
A: {claim1}
B: {claim2}
Answer:"""

        # settings.ollama_url resolves to the compose service name; "localhost"
        # inside this container would be the critic itself, not Ollama.
        async with httpx.AsyncClient(timeout=LLM_TIMEOUT) as client:
            response = await client.post(
                f"{settings.ollama_url.rstrip('/')}/api/generate",
                json={
                    "model": CRITIC_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    # Deterministic: this is a classification, not generation.
                    "options": {"temperature": 0, "num_predict": 8},
                },
            )
            response.raise_for_status()

        answer = response.json().get("response", "").strip().upper()
        if answer.startswith("YES"):
            return True
        if answer.startswith("NO"):
            return False
        if not answer.startswith("UNCLEAR"):
            logger.warning("Unparsable verdict from %s: %r", CRITIC_MODEL, answer[:80])
        return None

    except Exception as e:
        logger.error("Contradiction verification failed (%s): %s", CRITIC_MODEL, e)
        return None


def _extract_claim_from_text(text: str) -> str:
    """Extract a representative claim from text (simplified)."""
    # Take first sentence or up to 200 chars
    sentences = re.split(r'[.!?]+', text)
    if sentences:
        claim = sentences[0].strip()
        if len(claim) > 200:
            claim = claim[:197] + "..."
        return claim if claim else text[:100]
    return text[:100]


def _extract_claims_from_text(text: str) -> List[str]:
    """Extract potential claims from text."""
    sentences = re.split(r'[.!?]+', text)
    claims = []
    for sentence in sentences:
        sentence = sentence.strip()
        if len(sentence) > 10 and len(sentence) < 300:  # Reasonable claim length
            claims.append(sentence)
    return claims


def _detect_unsupported_claims(
    text: str,
    evidence_lookup: Dict[str, Any],
    cited_evidence_ids: List[str]
) -> List[str]:
    """Detect claims that appear to lack adequate support."""
    claims = _extract_claims_from_text(text)
    unsupported = []

    # Heuristic: if we have very few evidence sources for many claims, flag as potentially unsupported
    if len(cited_evidence_ids) < 2 and len(claims) > 2:
        # Likely insufficient evidence for multiple claims
        return claims[:2]  # Flag first couple claims

    # Check for specific claim types that need strong evidence
    strong_evidence_needed = [
        r"\b\d+%\b",  # Statistics
        r"\bstudy shows\b",
        r"\bresearch indicates\b",
        r"\bevidence suggests\b",
        r"\baccording to.*data\b",
    ]

    for claim in claims:
        claim_lower = claim.lower()
        for pattern in strong_evidence_needed:
            if re.search(pattern, claim_lower):
                # These claims really need solid evidence
                if len(cited_evidence_ids) < 2:
                    unsupported.append(claim)
                break

    return unsupported[:3]  # Limit results


def _generate_search_queries(claim: str) -> List[str]:
    """Generate suggested search queries to verify a claim."""
    # Extract key terms from claim
    words = re.findall(r'\b[a-zA-Z]{3,}\b', claim.lower())
    # Remove common words
    stop_words = {'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'has', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use'}
    key_words = [w for w in words if w not in stop_words and len(w) > 3]

    # Generate query variations
    queries = []
    if len(key_words) >= 2:
        queries.append(" ".join(key_words[:4]))  # Top 4 keywords
        queries.append(" ".join(key_words[:3]))  # Top 3 keywords

    if key_words:
        queries.append(key_words[0])  # Single most important term

    # Add verification context
    if len(queries) < 3:
        queries.append(f"{claim} verification")
        queries.append(f"{claim} fact check")

    return list(dict.fromkeys(queries))[:3]  # Remove duplicates, limit to 3


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)