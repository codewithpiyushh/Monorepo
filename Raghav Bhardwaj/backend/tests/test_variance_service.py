import pytest
from backend.app.services.variance_service import _classify_variance, _safe_flux_pct

def test_safe_flux_pct():
    assert _safe_flux_pct(50.0, 100.0) == 50.0
    
    assert _safe_flux_pct(100.0, 0.0) == 0.0
    
    # Zero to zero
    assert _safe_flux_pct(0.0, 0.0) == 0.0

def test_classify_variance():
    assert _classify_variance(5.0, 10.0, 50.0) == "WITHIN_THRESHOLD"
    
    assert _classify_variance(20.0, 10.0, 50.0) == "MATERIAL_VARIANCE"
    
    assert _classify_variance(60.0, 10.0, 50.0) == "CRITICAL_VARIANCE"

