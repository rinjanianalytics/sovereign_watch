import pytest
from typing import Dict, Any
from backend.ingestion.aviation_poller.classification import classify_aircraft, MILITARY_OPERATORS, GOV_OPERATORS

class TestADSBClassification:

    @pytest.mark.parametrize("scenario,input_data,expected_affiliation,expected_platform,expected_size", [
        # --- Affiliation Logic ---
        ("Military by dbFlags", {"dbFlags": 1, "category": "A7", "ownOp": "Unknown"}, "military", "helicopter", "unknown"),
        ("Military by Operator", {"dbFlags": 0, "ownOp": "United States Air Force", "category": "A1"}, "military", "fixed_wing", "light"),
        ("Military by Operator variant", {"ownOp": "USAF", "category": "A3"}, "military", "fixed_wing", "large"),
        ("Government by Operator", {"ownOp": "FBI", "category": "A1"}, "government", "fixed_wing", "light"),
        ("Military by Hex Range (AE0000)", {"hex": "AE0000", "ownOp": "Unknown"}, "military", "fixed_wing", "unknown"),
        ("Military by Hex Range (AFFFFF)", {"hex": "AFFFFF", "ownOp": "Unknown"}, "military", "fixed_wing", "unknown"),
        ("Commercial by Callsign (UAL1234)", {"flight": "UAL1234", "category": "A3", "ownOp": "Unknown"}, "commercial", "fixed_wing", "large"),
        ("Commercial by Callsign (AAL456)", {"flight": "AAL456", "category": "A4", "ownOp": "Unknown"}, "commercial", "fixed_wing", "heavy"),
        ("Commercial by Category A3", {"category": "A3", "ownOp": "Unknown", "flight": "N12345"}, "commercial", "fixed_wing", "large"),
        ("Commercial by Category A4", {"category": "A4", "ownOp": "Unknown"}, "commercial", "fixed_wing", "heavy"),
        ("Commercial by Category A5", {"category": "A5", "ownOp": "Unknown"}, "commercial", "fixed_wing", "high_performance"),
        ("General Aviation Default", {"flight": "N123AB", "category": "A1", "ownOp": "Private"}, "general_aviation", "fixed_wing", "light"),

        # --- Platform Logic ---
        ("Helicopter by Category A7", {"category": "A7"}, "general_aviation", "helicopter", "unknown"),
        ("Helicopter by Type H60", {"t": "H60", "category": "A1"}, "general_aviation", "helicopter", "light"),
        ("Drone by Category B6", {"category": "B6"}, "general_aviation", "drone", "unknown"),
        ("Balloon by Category B2", {"category": "B2"}, "general_aviation", "balloon", "unknown"),
        ("Glider by Category B1", {"category": "B1"}, "general_aviation", "glider", "unknown"),
        ("High Performance by Category A6", {"category": "A6"}, "general_aviation", "high_performance", "unknown"),
        ("Fixed Wing Default", {"category": "A1"}, "general_aviation", "fixed_wing", "light"),

        # --- Size Logic ---
        ("Light A1", {"category": "A1"}, "general_aviation", "fixed_wing", "light"),
        ("Small A2", {"category": "A2"}, "general_aviation", "fixed_wing", "small"),
        ("Large A3", {"category": "A3"}, "commercial", "fixed_wing", "large"), # Also triggers commercial via A3
        ("Heavy A4", {"category": "A4"}, "commercial", "fixed_wing", "heavy"), # Also triggers commercial via A4
        ("High Performance A5", {"category": "A5"}, "commercial", "fixed_wing", "high_performance"), # Also commercial via A5
        ("Unknown Default", {"category": "Z9"}, "general_aviation", "fixed_wing", "unknown"),

        # --- Edge Cases ---
        ("Null Fields", {"dbFlags": None, "ownOp": None, "hex": None, "flight": None, "category": None, "t": None}, "general_aviation", "fixed_wing", "unknown"),
        ("Empty Fields", {"dbFlags": "", "ownOp": "", "hex": "", "flight": "", "category": "", "t": ""}, "general_aviation", "fixed_wing", "unknown"),
        ("Case Sensitivity - Operator (Exact Match Required)", {"ownOp": "united states air force"}, "general_aviation", "fixed_wing", "unknown"), # Current logic is case-sensitive? Dictionary keys are Title Case. Let's verify.
        ("Hex Outside Range", {"hex": "ADFFFF"}, "general_aviation", "fixed_wing", "unknown"),
        ("Hex Outside Range 2", {"hex": "B00000"}, "general_aviation", "fixed_wing", "unknown"),
    ])
    def test_classify_aircraft_scenarios(self, scenario, input_data, expected_affiliation, expected_platform, expected_size):
        """
        Test classify_aircraft with various scenarios to ensure correct logic branching.
        """
        result = classify_aircraft(input_data)

        assert result["affiliation"] == expected_affiliation, f"Scenario '{scenario}' failed affiliation check"
        assert result["platform"] == expected_platform, f"Scenario '{scenario}' failed platform check"
        assert result["size"] == expected_size, f"Scenario '{scenario}' failed size check"

    def test_return_structure(self):
        """Verify the complete dictionary structure returned."""
        input_data = {
            "category": "A1",
            "t": "C172",
            "dbFlags": 0,
            "ownOp": "Private",
            "hex": "AABBCC",
            "flight": "N12345",
            "r": "N12345",
            "desc": "Cessna 172",
            "squawk": "1200",
            "emergency": "none"
        }
        result = classify_aircraft(input_data)

        expected_keys = {
            "affiliation", "platform", "size", "icaoType", "category",
            "dbFlags", "operator", "registration", "description",
            "squawk", "emergency"
        }
        assert set(result.keys()) == expected_keys
        assert result["icaoType"] == "C172"
        assert result["registration"] == "N12345"

    def test_operator_constants(self):
        """Ensure critical operators are present in the constants."""
        assert "United States Air Force" in MILITARY_OPERATORS
        assert "USAF" in MILITARY_OPERATORS
        assert "FBI" in GOV_OPERATORS
        assert "CBP" in GOV_OPERATORS
