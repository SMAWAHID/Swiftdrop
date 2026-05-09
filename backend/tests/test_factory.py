"""
SwiftDrop :: ShipmentFactory unit tests
========================================
Verifies the GoF Factory + Template-Method fare calculation:

  STANDARD : base_rate × weight × 1.0
  EXPRESS  : base_rate × weight × 1.8
  FRAGILE  : base_rate × weight × 2.2
  unknown  : raises ValueError

These are pure unit tests — no DB, no HTTP — proving the factory
honors the Open/Closed extension contract.
"""
from decimal import Decimal

import pytest

from factories.shipment_factory import (
    ExpressShipment,
    FragileShipment,
    ShipmentFactory,
    StandardShipment,
)
from schemas.shipment import ShipmentBookRequest


def _make_request(shipment_type: str, weight: str = "10.000") -> ShipmentBookRequest:
    return ShipmentBookRequest(
        shipment_type=shipment_type,
        pickup_address="SITE Industrial Area, Karachi",
        delivery_address="Clifton Block 4, Karachi",
        package_weight_kg=Decimal(weight),
        package_description="Test parcel",
    )


class TestShipmentFactory:
    BASE = Decimal("80.00")  # PKR per kg, same as services.shipment_service

    def test_standard_shipment_uses_1x_multiplier(self):
        s = ShipmentFactory.create(_make_request("STANDARD", "10.000"))
        assert isinstance(s, StandardShipment)
        # 80 × 10 × 1.0 = 800.00
        assert s.calculate_fare(self.BASE) == Decimal("800.00")

    def test_express_shipment_uses_1_8x_multiplier(self):
        s = ShipmentFactory.create(_make_request("EXPRESS", "10.000"))
        assert isinstance(s, ExpressShipment)
        # 80 × 10 × 1.8 = 1440.00
        assert s.calculate_fare(self.BASE) == Decimal("1440.00")

    def test_fragile_shipment_uses_2_2x_multiplier(self):
        s = ShipmentFactory.create(_make_request("FRAGILE", "10.000"))
        assert isinstance(s, FragileShipment)
        # 80 × 10 × 2.2 = 1760.00
        assert s.calculate_fare(self.BASE) == Decimal("1760.00")

    def test_factory_normalises_lowercase_type_codes(self):
        # The Pydantic validator upper-cases the input — confirm it survives the trip.
        s = ShipmentFactory.create(_make_request("express", "5.000"))
        assert isinstance(s, ExpressShipment)
        assert s.calculate_fare(self.BASE) == Decimal("720.00")

    def test_unknown_type_raises_value_error(self):
        # Bypass the Pydantic Literal so we hit the factory's own guard.
        bad = ShipmentBookRequest.model_construct(
            shipment_type="DRONE",
            pickup_address="A" * 10,
            delivery_address="B" * 10,
            package_weight_kg=Decimal("1.000"),
            package_description=None,
        )
        with pytest.raises(ValueError, match="Unknown shipment type"):
            ShipmentFactory.create(bad)

    def test_register_extension_point_is_open_for_extension(self):
        class CryoShipment(StandardShipment):
            FARE_MULTIPLIER = Decimal("3.5")
            TYPE_CODE = "CRYO"

        ShipmentFactory.register("CRYO", CryoShipment)
        try:
            req = ShipmentBookRequest.model_construct(
                shipment_type="CRYO",
                pickup_address="A" * 10,
                delivery_address="B" * 10,
                package_weight_kg=Decimal("2.000"),
                package_description=None,
            )
            s = ShipmentFactory.create(req)
            assert isinstance(s, CryoShipment)
            assert s.calculate_fare(self.BASE) == Decimal("560.00")
        finally:
            ShipmentFactory._registry.pop("CRYO", None)
