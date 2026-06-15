from src.exceptions import Conflict, NotFound


class PlanProposalNotFound(NotFound):
    message = "No pending plan proposal was found for this project."
    error_code = "PLAN_PROPOSAL_NOT_FOUND"


class PlanRevertUnavailable(Conflict):
    message = "There is no prior plan version available to revert."
    error_code = "PLAN_REVERT_UNAVAILABLE"
