from src.exceptions import Forbidden, NotFound


class ProjectNotFound(NotFound):
    message = "Project not found."
    error_code = "PROJECT_NOT_FOUND"


class ProjectAccessDenied(Forbidden):
    message = "You are not a member of this project."
    error_code = "PROJECT_ACCESS_DENIED"
