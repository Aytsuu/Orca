from src.exceptions import BadRequest, Conflict, NotFound


class MemberAlreadyExists(Conflict):
    message = "That session is already a member of the project."
    error_code = "MEMBER_ALREADY_EXISTS"


class MemberNotFound(NotFound):
    message = "Project member not found."
    error_code = "MEMBER_NOT_FOUND"


class InvalidPermissionsUpdate(BadRequest):
    message = "At least one permission field must be provided."
    error_code = "INVALID_PERMISSIONS_UPDATE"
