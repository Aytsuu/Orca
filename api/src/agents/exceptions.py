from src.exceptions import Conflict


class AgentRunAlreadyActive(Conflict):
    message = "An agent run is already active for this project."
    error_code = "AGENT_RUN_ALREADY_ACTIVE"
