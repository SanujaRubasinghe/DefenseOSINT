"""entity-agent — NER, entity linking, relation extraction."""

import asyncio

from defenseosint_common.a2a import A2AMessage, reply
from defenseosint_common.contracts import EntityBundle, EvidenceBundle
from fastapi import FastAPI

from .extract import clean_entities, extract_entities

app = FastAPI(title="entity-agent")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "entity-agent"}


@app.post("/a2a/extract")
async def extract(msg: A2AMessage):
    bundle = EvidenceBundle.model_validate(msg.payload)
    result = await run_extraction(bundle)
    return reply(msg, "entity-agent", result)


async def run_extraction(bundle: EvidenceBundle) -> EntityBundle:
    # spaCy's NER call is synchronous CPU work; run it off the event loop so
    # one extraction can't stall the health check or a concurrent request.
    extracted = await asyncio.to_thread(extract_entities, bundle)
    # Bounded LLM retype pass — see extract.py for why this is retype-only.
    return await clean_entities(extracted)
