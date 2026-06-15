from datetime import date
from typing import List, Optional

from pydantic import BaseModel


class ExplanationPatch(BaseModel):
    root_cause_category: Optional[str] = None
    variance_explanation: Optional[str] = None
    resolution_target_date: Optional[date] = None
    resolution_status: Optional[str] = None


class ExplanationOut(BaseModel):
    balance_id: int
    variance_severity_classification: Optional[str] = None
    root_cause_category: Optional[str] = None
    variance_explanation: Optional[str] = None
    resolution_target_date: Optional[date] = None
    resolution_status: Optional[str] = None
    explained_variance: Optional[float] = None
    unexplained_variance: Optional[float] = None
    flux_amount: Optional[float] = None
    flux_percentage: Optional[float] = None
    explanation_required: bool
    explanation_complete: bool

    class Config:
        from_attributes = True


class WaterfallEntry(BaseModel):
    profile_id: int
    profile_name: str
    period_key: str
    contribution: float
    cumulative: float
    pct_of_total: float
    classification: str


class FluxEntry(BaseModel):
    balance_id: int
    profile_id: int
    profile_name: str
    period_key: str
    source_balance: float
    target_balance: float
    raw_variance: float
    explained_variance: float
    unexplained_variance: float
    flux_amount: Optional[float] = None
    flux_percentage: Optional[float] = None
    classification: str
    risk_classification: Optional[str] = None
    explanation_provided: bool


class VarianceFluxResponse(BaseModel):
    top_unexplained: List[FluxEntry]
    top_flux_shifts: List[FluxEntry]
    waterfall: List[WaterfallEntry]
    total_unexplained: float
    total_profiles: int
    missing_narratives: int = 0
    generated_at: str


class VarianceTrendRow(BaseModel):
    period_key: str
    raw_variance: float
    explained_variance: float
    unexplained_variance: float
    flux_amount: float
    flux_percentage: float
    risk_score: float
    classification: str
