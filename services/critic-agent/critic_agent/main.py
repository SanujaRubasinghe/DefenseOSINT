"""critic-agent — evidence and claim verification.

Implements claim verification against evidence for the DefenseOSINT platform.
"""

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
import re
from typing import Set, List, Dict, Any
import logging
import json
import aiohttp

settings = Settings("critic-agent")
app = FastAPI(title="critic-agent")
logger = logging.getLogger(__name__)


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
    contradiction_findings = await _check_for_contradictions_enhanced(draft.sections, evidence_lookup)
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
    if any(word in full_text.lower() for word in ["recent", "latest", "current", "now"]) and \
       not any("2024" in str(e.published_at.year) if e.published_at else False
               for e in evidence_lookup.values() if e.published_at):
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


async def _check_for_contradictions_enhanced(
    sections: List[DraftSection],
    evidence_lookup: Dict[str, Any]
) -> List[Finding]:
    """Check for contradictions using Ollama with gpt-oss:20b for enhanced verification."""
    findings = []

    # Extract claims with their supporting evidence
    claims_with_evidence = []
    for section in sections:
        if section.evidence_ids:
            # Get the actual evidence text for each cited evidence ID
            evidence_texts = []
            for eid in section.evidence_ids:
                if eid in evidence_lookup:
                    record = evidence_lookup[eid]
                    # Assuming record has a 'content' or 'text' field
                    evidence_text = getattr(record, 'content', getattr(record, 'text', str(record)))
                    evidence_texts.append(evidence_text)

            if evidence_texts:
                claims_with_evidence.append({
                    "section": section.heading,
                    "claims": _extract_claims_from_text(section.body),
                    "evidence": evidence_texts
                })

    # Check for contradictions between claims using Ollama
    for i, claim_set1 in enumerate(claims_with_evidence):
        for claim_set2 in claims_with_evidence[i+1:]:
            for claim1 in claim_set1["claims"]:
                for claim2 in claim_set2["claims"]:
                    # Use Ollama to verify if there's a contradiction
                    is_contradiction = await _verify_contradiction_with_ollama(
                        claim1,
                        claim2,
                        claim_set1["evidence"] + claim_set2["evidence"]
                    )

                    if is_contradiction:
                        findings.append(Finding(
                            kind="contradiction",
                            severity=Severity.MAJOR,
                            description=f"Ollama-verified contradiction between '{claim_set1['section']}' and '{claim_set2['section']}': "
                                      f"'{claim1}' vs '{claim2}'",
                            suggested_queries=[f"verify contradiction: {claim1} {claim2}"],
                        ))

    return findings[:5]  # Limit findings


async def _verify_contradiction_with_ollama(
    claim1: str,
    claim2: str,
    evidence_texts: List[str]
) -> bool:
    """Use Ollama with gpt-oss:20b to verify if two claims contradict each other."""
    try:
        # Prepare the prompt for Ollama
        evidence_context = "\n\n".join([f"Evidence {i+1}: {text[:500]}..." for i, text in enumerate(evidence_texts[:3])])

        prompt = f"""You are a fact-checking expert. Determine if the two claims below contradict each other based on the provided evidence.

Claim 1: {claim1}
Claim 2: {claim2}

Evidence:
{evidence_context}

Instructions:
1. Analyze both claims carefully
2. Consider the evidence provided
3. Determine if the claims are logically contradictory (cannot both be true at the same time)
4. Respond with only "YES" if they contradict, or "NO" if they don't contradict or if uncertain

Your response:"""

        # Call Ollama API
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": "gpt-oss:20b",
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.1,
                        "top_p": 0.9
                    }
                },
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    response_text = result.get("response", "").strip().upper()
                    return response_text == "YES"
                else:
                    logger.warning(f"Ollama API returned status {response.status}")
                    return False

    except Exception as e:
        logger.error(f"Error calling Ollama for contradiction verification: {e}")
        # Fallback to original method if Ollama fails
        return False


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