import os

from defenseosint_common.config import Settings


class PlannerSettings(Settings):
    def __init__(self):
        super().__init__("planner-agent")
        self.planner_model = os.getenv("PLANNER_MODEL", "qwen2.5:3b")
        self.llm_timeout = float(os.getenv("LLM_TIMEOUT", "120"))

        self.max_iterations = int(os.getenv("MAX_ITERATIONS", "3"))
        self.max_a2a_calls = int(os.getenv("MAX_A2A_CALLS", "40"))
        self.max_seconds = int(os.getenv("MAX_SECONDS", "600"))
        self.max_tasks_per_plan = int(os.getenv("MAX_TASKS_PER_PLAN", "5"))

settings = PlannerSettings()