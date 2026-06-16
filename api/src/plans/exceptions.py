from src.exceptions import Conflict, NotFound


class PlanProposalNotFound(NotFound):
    message = "No pending plan proposal was found for this project."
    error_code = "PLAN_PROPOSAL_NOT_FOUND"


class PlanRevertUnavailable(Conflict):
    message = "There is no prior plan version available to revert."
    error_code = "PLAN_REVERT_UNAVAILABLE"


class PlanProposalAlreadyResolved(Conflict):
    message = "The latest plan proposal is no longer pending."
    error_code = "PLAN_PROPOSAL_ALREADY_RESOLVED"
