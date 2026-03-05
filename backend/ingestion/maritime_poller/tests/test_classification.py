import pytest
from backend.ingestion.maritime_poller.classification import classify_vessel

class TestVesselClassification:
    @pytest.mark.parametrize("ship_type,expected_category", [
        (30, "fishing"),
        (31, "tug"),
        (32, "tug"),
        (52, "tug"),
        (35, "military"),
        (36, "pleasure"),
        (37, "pleasure"),
        (40, "hsc"),
        (45, "hsc"),
        (49, "hsc"),
        (50, "pilot"),
        (51, "sar"),
        (55, "law_enforcement"),
        (58, "special"),
        (59, "special"),
        (60, "passenger"),
        (65, "passenger"),
        (69, "passenger"),
        (70, "cargo"),
        (75, "cargo"),
        (79, "cargo"),
        (80, "tanker"),
        (85, "tanker"),
        (89, "tanker"),
        (0, "unknown"),
        (99, "unknown"),
    ])
    def test_category_mapping(self, ship_type, expected_category):
        result = classify_vessel(ship_type, 123456789, "Test Vessel")
        assert result["category"] == expected_category

    @pytest.mark.parametrize("ship_type,expected_hazardous", [
        (70, False), # cargo, units 0
        (71, True),  # cargo, units 1
        (74, True),  # cargo, units 4
        (75, False), # cargo, units 5
        (81, True),  # tanker, units 1
        (62, True),  # passenger, units 2
        (43, True),  # hsc, units 3
        (31, False), # tug, units 1 (not in hazardous-eligible categories)
    ])
    def test_hazardous_logic(self, ship_type, expected_hazardous):
        result = classify_vessel(ship_type, 123456789, "Test Vessel")
        assert result["hazardous"] == expected_hazardous

    @pytest.mark.parametrize("mmsi,expected_station,expected_mid", [
        (235000000, "ship", 235),
        (235123456, "ship", 235),
        ("002351234", "coastal", 235),
        ("023512345", "group", 235),
        ("111235123", "sar_aircraft", 235),
        ("823512345", "handheld", 235),
        ("982351234", "craft_associated", 235),
        ("992351234", "navaid", 235),
        ("123456789", "ship", 123),
    ])
    def test_mmsi_parsing(self, mmsi, expected_station, expected_mid):
        result = classify_vessel(70, mmsi, "Test Vessel")
        assert result["stationType"] == expected_station
        assert result["flagMid"] == expected_mid

    def test_return_structure(self):
        result = classify_vessel(70, 235123456, "Cargo Ship")
        assert "category" in result
        assert "shipType" in result
        assert "hazardous" in result
        assert "stationType" in result
        assert "flagMid" in result
        assert result["shipType"] == 70
