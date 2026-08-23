"""Settings read from environment variables. Never hard-code secrets."""

import os


class Settings:
    def __init__(self, service_name: str) -> None:
        self.service_name = service_name
        self.log_level = os.getenv("LOG_LEVEL", "INFO")

        # A2A peers (docker service names inside the compose network)
        self.planner_url = os.getenv("PLANNER_URL", "http://planner-agent:8000")
        self.collector_url = os.getenv("COLLECTOR_URL", "http://collector-agent:8000")
        self.entity_url = os.getenv("ENTITY_URL", "http://entity-agent:8000")
        self.critic_url = os.getenv("CRITIC_URL", "http://critic-agent:8000")
        self.analyst_url = os.getenv("ANALYST_URL", "http://analyst-agent:8000")

        # Infrastructure
        self.database_url = os.getenv("DATABASE_URL", "")
        self.ollama_url = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")

        # Keys
        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY", "")
        self.a2a_token = os.getenv("A2A_SHARED_TOKEN", "")
