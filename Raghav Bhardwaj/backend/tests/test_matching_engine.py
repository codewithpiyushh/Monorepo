import pytest
from backend.app.services.matching_engine import AdvancedMatchingEngine, RecordView
from backend.app.models.models import ReconciliationProfile

def test_matching_engine_classification():
    # Setup mock profile
    profile = ReconciliationProfile(
        id=1,
        tolerance_threshold=0.01,
        auto_approve_threshold=0.90,
        materiality_limit=10.0,
    )
    
    engine = AdvancedMatchingEngine(profile)
    
    # Test FULL_MATCH
    assert engine._classify(0.95, 0.0) == "FULL_MATCH"
    
    # Test PARTIAL_MATCH
    assert engine._classify(0.75, 0.0) == "PARTIAL_MATCH"
    
    # Test UNMATCHED
    assert engine._classify(0.40, 0.0) == "UNMATCHED"
    
    # Test VARIANCE_FLAGGED
    assert engine._classify(0.95, 15.0) == "VARIANCE_FLAGGED"

def test_record_view():
    import json
    from backend.app.models.models import ReconciliationRecord
    
    r = ReconciliationRecord(
        id=1,
        amount=100.0,
        tx_date="2026-07-03",
        reference="REF123",
        entity="EntityA",
        account="Acc1",
        period="2026-07",
        source_system="GL",
        currency="USD",
        payload_json=json.dumps({"description": "Test Desc"})
    )
    
    view = RecordView.from_orm(r)
    assert view.id == 1
    assert view.amount == 100.0
    assert view.reference == "REF123"
    assert view.description == "Test Desc"
    assert view.currency == "USD"
