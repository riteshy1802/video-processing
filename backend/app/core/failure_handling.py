import random
from enum import Enum

class FailureType(str, Enum):
    RETRYABLE = "RETRYABLE"
    PERMANENT = "PERMANENT"
    CANCELLED = "CANCELLED"

MAX_RETRY_ATTEMPTS = 3
BASE_RETRY_DELAY_SECONDS = 2.0
MAX_RETRY_DELAY_SECONDS = 30.0

def calculate_retry_delay(attempt: int) -> float:
    """
    Exponential backoff with jitter.

    attempt=1 -> ~2s
    attempt=2 -> ~4s
    attempt=3 -> ~8s
    """
    exponential_delay = BASE_RETRY_DELAY_SECONDS * (2 ** (attempt - 1))
    capped_delay = min(exponential_delay, MAX_RETRY_DELAY_SECONDS)

    jitter = random.uniform(0, capped_delay * 0.25)

    return capped_delay + jitter

class RetryableJobError(Exception):
    """The operation may succeed if attempted again."""
    pass


class PermanentJobError(Exception):
    """Retrying the same operation will not fix the failure."""
    pass


class JobCancelledError(Exception):
    """Processing was intentionally cancelled."""
    pass

def classify_failure(exc: Exception) -> FailureType:
    if isinstance(exc, JobCancelledError):
        return FailureType.CANCELLED

    if isinstance(exc, PermanentJobError):
        return FailureType.PERMANENT

    if isinstance(exc, RetryableJobError):
        return FailureType.RETRYABLE

    # Unknown failures should initially be treated as retryable.
    # Later the retry limit prevents infinite retries.
    return FailureType.RETRYABLE