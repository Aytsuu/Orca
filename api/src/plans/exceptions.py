from src.exceptions import BadRequest, Conflict, NotFound


class PlanProposalNotFound(NotFound):
    message = "No pending plan proposal was found for this project."
    error_code = "PLAN_PROPOSAL_NOT_FOUND"


class PlanRevertUnavailable(Conflict):
    message = "There is no prior plan version available to revert."
    error_code = "PLAN_REVERT_UNAVAILABLE"


class PlanProposalAlreadyResolved(Conflict):
    message = "The latest plan proposal is no longer pending."
    error_code = "PLAN_PROPOSAL_ALREADY_RESOLVED"


class PlanPhaseNotFound(NotFound):
    message = "The requested plan phase was not found."
    error_code = "PLAN_PHASE_NOT_FOUND"


class PlanTaskNotFound(NotFound):
    message = "The requested plan task was not found."
    error_code = "PLAN_TASK_NOT_FOUND"


class PlanGapNotFound(NotFound):
    message = "The requested gap notice was not found."
    error_code = "PLAN_GAP_NOT_FOUND"


class PlanRiskNotFound(NotFound):
    message = "The requested risk item was not found."
    error_code = "PLAN_RISK_NOT_FOUND"


class PlanAttachmentNotFound(NotFound):
    message = "The requested task attachment was not found."
    error_code = "PLAN_ATTACHMENT_NOT_FOUND"


class PlanChangeNotFound(NotFound):
    message = "The requested proposal change was not found."
    error_code = "PLAN_CHANGE_NOT_FOUND"


class PhaseDeleteRequiresForce(BadRequest):
    message = "This phase still contains tasks. Retry with force=true to delete it."
    error_code = "PLAN_PHASE_DELETE_REQUIRES_FORCE"
