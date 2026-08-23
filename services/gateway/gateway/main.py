"""gateway — FastAPI app and A2A endpoints."""

from defenseosint_common.config import Settings
from fastapi import FastAPI

settings = Settings("gateway")
app = FastAPI(title="gateway")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "gateway"}


# TODO (Member 1): add your A2A skill endpoints here, e.g.
#
# from defenseosint_common.a2a import A2AMessage, reply
# from defenseosint_common.contracts import InvestigationTask, EvidenceBundle
#
# @app.post("/a2a/collect")
# async def collect(msg: A2AMessage):
#     task = InvestigationTask.model_validate(msg.payload)   # validate input
#     bundle = await run_collection(task)                    # your logic
#     return reply(msg, "gateway", bundle)                    # validated output
