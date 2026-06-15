from __future__ import annotations

from src.exceptions import Forbidden


def require_approver_membership(membership: dict) -> None:
    if not membership["can_approve"]:
        raise Forbidden("Approval permission is required.")


def require_editor_membership(membership: dict) -> None:
    if not membership["can_edit"] and membership["role"] != "creator":
        raise Forbidden("Edit permission is required.")
