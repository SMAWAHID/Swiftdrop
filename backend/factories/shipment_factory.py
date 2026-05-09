"""
SwiftDrop :: Shipment Factory (GoF — Factory Method Pattern)
============================================================
Rationale
---------
Object creation logic for different shipment types is complex:
each type has a different fare multiplier and validation rules.
Embedding `if shipment_type == 'EXPRESS'` in the service violates
the Open/Closed Principle — every new type requires modifying the
service. The Factory isolates creation behind a stable interface.

Design
------
- BaseShipment     : Abstract product (Template Method for fare)
- StandardShipment : Concrete product — 1.0× multiplier
- ExpressShipment  : Concrete product — 1.8× multiplier (same-day)
- FragileShipment  : Concrete product — 2.2× multiplier (special handling)
- ShipmentFactory  : Creator — registry-based dispatch

Open/Closed: Register new types in _registry without touching
             any existing code.
"""
from __future__ import annotations

from decimal import Decimal
from typing import ClassVar, Dict, Type

from schemas.shipment import ShipmentBookRequest


# ── Abstract Product ──────────────────────────────────────────────────────────

class BaseShipment:
    """
    Abstract product in the Factory pattern.
    Template Method: subclasses override FARE_MULTIPLIER and TYPE_CODE.
    """

    FARE_MULTIPLIER: ClassVar[Decimal] = Decimal("1.0")
    TYPE_CODE: ClassVar[str] = "BASE"

    def __init__(self, request: ShipmentBookRequest) -> None:
        self.request = request

    def calculate_fare(self, base_rate_per_kg: Decimal) -> Decimal:
        """
        Template Method: computes estimated fare.
        base_rate_per_kg × weight × type_multiplier, rounded to 2 dp.
        """
        return (
            base_rate_per_kg
            * self.request.package_weight_kg
            * self.FARE_MULTIPLIER
        ).quantize(Decimal("0.01"))

    def to_db_dict(self) -> Dict[str, object]:
        """Return a dict ready for the INSERT statement."""
        return {
            "shipment_type": self.TYPE_CODE,
            "pickup_address": self.request.pickup_address,
            "delivery_address": self.request.delivery_address,
            "package_weight_kg": self.request.package_weight_kg,
            "package_description": self.request.package_description,
        }


# ── Concrete Products ─────────────────────────────────────────────────────────

class StandardShipment(BaseShipment):
    """Standard delivery — 1–3 business days. Base fare."""
    FARE_MULTIPLIER = Decimal("1.0")
    TYPE_CODE = "STANDARD"


class ExpressShipment(BaseShipment):
    """Express delivery — same day. 1.8× fare premium."""
    FARE_MULTIPLIER = Decimal("1.8")
    TYPE_CODE = "EXPRESS"


class FragileShipment(BaseShipment):
    """Fragile goods — special handling & padding. 2.2× fare premium."""
    FARE_MULTIPLIER = Decimal("2.2")
    TYPE_CODE = "FRAGILE"


# ── Factory (Creator) ─────────────────────────────────────────────────────────

class ShipmentFactory:
    """
    Registry-based Factory.

    _registry maps TYPE_CODE strings → concrete classes.
    Adding a new type: add one entry to _registry.
    No existing code changes required (Open/Closed Principle).
    """

    _registry: ClassVar[Dict[str, Type[BaseShipment]]] = {
        "STANDARD": StandardShipment,
        "EXPRESS": ExpressShipment,
        "FRAGILE": FragileShipment,
    }

    @classmethod
    def create(cls, request: ShipmentBookRequest) -> BaseShipment:
        """
        Resolve the concrete class from the request's shipment_type
        and instantiate it. Raises ValueError for unknown types.
        """
        shipment_cls = cls._registry.get(request.shipment_type.upper())
        if shipment_cls is None:
            valid = ", ".join(cls._registry.keys())
            raise ValueError(
                f"Unknown shipment type '{request.shipment_type}'. "
                f"Valid types: {valid}"
            )
        return shipment_cls(request)

    @classmethod
    def register(cls, type_code: str, klass: Type[BaseShipment]) -> None:
        """
        Extension point: register custom shipment types at runtime.
        Demonstrates the Open/Closed Principle in action.
        """
        cls._registry[type_code.upper()] = klass
