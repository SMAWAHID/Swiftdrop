"""
SwiftDrop :: Custom Exception Hierarchy
Design: Domain exceptions are plain Python classes.
        FastAPI exception handlers translate them to HTTP responses.
        This keeps business logic free from HTTP concerns (Low Coupling).
"""


class SwiftDropException(Exception):
    """Base exception for all SwiftDrop domain errors."""


class ShipmentNotFoundError(SwiftDropException, LookupError):
    """Raised when a shipment UUID does not exist."""


class ShipmentAlreadyAcceptedError(SwiftDropException, ValueError):
    """
    Raised when a driver attempts to accept a non-PENDING shipment.
    Maps to HTTP 409 Conflict — semantic conflict, not a client error.
    """


class DriverProfileNotFoundError(SwiftDropException, LookupError):
    """Raised when authenticated user has no driver profile."""


class VendorProfileNotFoundError(SwiftDropException, PermissionError):
    """Raised when authenticated user has no vendor profile."""
