from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str | None = Field(default=None, max_length=80)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class PasswordChangeIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class Profile(BaseModel):
    """What the student chooses to share; both products use it for personalisation."""

    model_config = ConfigDict(extra="ignore")

    field_of_study: str | None = Field(default=None, max_length=120)
    year_of_study: str | None = Field(default=None, max_length=60)
    interests: str | None = Field(default=None, max_length=500)


class ProfileUpdateIn(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)
    profile: Profile | None = None

    @field_validator("display_name")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return v.strip() or None if v else v


class DeleteAccountIn(BaseModel):
    password: str | None = Field(default=None, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str | None
    display_name: str | None
    is_guest: bool
    profile: dict[str, Any]
    created_at: datetime


class SessionOut(BaseModel):
    user: UserOut | None
    usage: dict[str, Any] | None = None
