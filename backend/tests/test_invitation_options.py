import pytest
from pydantic import ValidationError

from fieldmaps_api.invitation_schemas import OrgInvitationCreate, ProjectInvitationCreate


@pytest.mark.parametrize("role", ["observer", "viewer", "manager"])
def test_project_invitation_defaults_to_fourteen_days_when_expiry_is_omitted(role: str) -> None:
    invitation = ProjectInvitationCreate.model_validate({"role": role})
    assert invitation.expires_in_days == 14


def test_org_invitation_defaults_to_fourteen_days_when_expiry_is_omitted() -> None:
    invitation = OrgInvitationCreate(role="member")
    assert invitation.expires_in_days == 14


@pytest.mark.parametrize("days", [1, 7, 14, 365])
def test_invitation_keeps_explicit_expiry_when_given(days: int) -> None:
    invitation = ProjectInvitationCreate(role="viewer", expires_in_days=days)
    assert invitation.expires_in_days == days


@pytest.mark.parametrize("days", [0, 366, True])
def test_invitation_refuses_expiry_outside_contract_when_given(days: int) -> None:
    with pytest.raises(ValidationError):
        ProjectInvitationCreate(role="viewer", expires_in_days=days)
