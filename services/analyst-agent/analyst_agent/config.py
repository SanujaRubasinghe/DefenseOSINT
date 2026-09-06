import os

from defenseosint_common.config import Settings


class AnalystSettings(Settings):
    def __init__(self) -> None:
        super().__init__("analyst-agent")
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        self.model = os.getenv("ANALYST_MODEL", "gpt-4o-mini")
        self.timeout = float(os.getenv("ANALYST_TIMEOUT", "90"))

        self.max_evidence_chars = int(os.getenv("ANALYST_MAX_EVIDENCE_CHARS", "60000"))
        self.max_chars_per_record = int(os.getenv("ANALYST_MAX_CHARS_PER_RECORD", "3000"))


settings = AnalystSettings()
