import os

from defenseosint_common.config import Settings


class GatewaySettings(Settings):
    def __init__(self) -> None:
        super().__init__("gateway")

        # DefenseOSINT has one operator account, not a user table — matches how
        # every other secret here is managed (env vars, see Settings). Change
        # these in .env for a real deployment; never hardcode credentials.
        self.analyst_username = os.getenv("GATEWAY_ANALYST_USERNAME", "analyst")
        self.analyst_password = os.getenv("GATEWAY_ANALYST_PASSWORD", "change-me")

        self.jwt_secret = os.getenv("GATEWAY_JWT_SECRET", "")
        self.token_ttl_minutes = int(os.getenv("GATEWAY_TOKEN_TTL_MINUTES", "480"))


settings = GatewaySettings()
