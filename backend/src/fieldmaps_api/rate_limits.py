"""Per-process pilot limits keyed by verified user, never by client-supplied identity."""

import math
import re
from collections.abc import Callable
from dataclasses import dataclass
from threading import Lock
from time import monotonic
from typing import Final
from uuid import UUID

from fieldmaps_api.errors import DomainError


class RateLimitError(DomainError):
    def __init__(self, retry_after: int) -> None:
        super().__init__(
            "rate_limited",
            "Too many requests; retry later",
            429,
            headers={"Retry-After": str(retry_after)},
        )
        self.retry_after: int = retry_after


@dataclass(frozen=True, slots=True)
class Policy:
    name: str
    capacity: int
    seconds: int


ORGANIZATIONS: Final = Policy("organizations", 5, 3600)
INVITATIONS: Final = Policy("invitations", 60, 3600)
EMAILS: Final = Policy("project-emails", 60, 3600)
REDEMPTION: Final = Policy("invitation-access", 10, 600)
DELETION: Final = Policy("account-deletion", 3, 3600)
ZONE_VALIDATION: Final = Policy("zone-validation", 30, 60)
ZONE_PUBLICATION: Final = Policy("zone-publication", 10, 60)


def policy_for(method: str, path: str) -> Policy | None:
    path = path.rstrip("/")
    if method == "DELETE" and path == "/v1/me":
        return DELETION
    if method != "POST":
        return None
    policies = (
        (r"/v1/projects/[^/]+/emails", EMAILS),
        (r"/v1/projects/[^/]+/sites/[^/]+/zone-drafts/[^/]+/validate", ZONE_VALIDATION),
        (
            r"/v1/projects/[^/]+/(?:sites/[^/]+/zone-drafts/[^/]+/publish|packages)",
            ZONE_PUBLICATION,
        ),
        (r"/v1/orgs", ORGANIZATIONS),
    )
    for pattern, policy in policies:
        if re.fullmatch(pattern, path):
            return policy
    if path in ("/v1/invitations/preview", "/v1/invitations/redeem"):
        return REDEMPTION
    if re.fullmatch(r"/v1/(?:orgs|projects)/[^/]+/invitations", path):
        return INVITATIONS
    return None


@dataclass(frozen=True, slots=True)
class Bucket:
    tokens: float
    updated: float
    expires: float


class RateLimiter:
    """Own mutable token buckets for one app instance, with idle-user cleanup."""

    def __init__(self, clock: Callable[[], float] = monotonic) -> None:
        self.clock: Callable[[], float] = clock
        self.buckets: dict[tuple[UUID, str], Bucket] = {}
        self.lock: Lock = Lock()

    def consume(self, user_id: UUID, policy: Policy) -> None:
        with self.lock:
            now = self.clock()
            expired = [key for key, value in self.buckets.items() if value.expires <= now]
            for key in expired:
                del self.buckets[key]
            key = (user_id, policy.name)
            previous = self.buckets.get(key, Bucket(float(policy.capacity), now, now))
            rate = policy.capacity / policy.seconds
            tokens = min(float(policy.capacity), previous.tokens + (now - previous.updated) * rate)
            if tokens < 1:
                raise RateLimitError(max(1, math.ceil((1 - tokens) / rate)))
            self.buckets[key] = Bucket(tokens - 1, now, now + policy.seconds)
