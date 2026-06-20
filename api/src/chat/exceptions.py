from src.exceptions import BadRequest


class UploadedFileNotFound(BadRequest):
    message = "The requested uploaded file was not found."
