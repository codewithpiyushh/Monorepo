from sqlalchemy.orm import Query
from ..models.models import User, ReconciliationProfile

def apply_profile_rls(query: Query, current_user: User, profile_model=ReconciliationProfile) -> Query:
    """
    Applies Row-Level Security (RLS) to a SQLAlchemy query that joins or queries 
    ReconciliationProfile. Filters rows based on the current_user's role and assignments.
    """
    if not current_user:
        return query.filter(False)
        
    role = (current_user.role or "").lower()
    
    # Admins see everything
    if role == "admin":
        return query
        
    # Scoped roles see only what they are assigned to
    if role == "preparer":
        return query.filter(profile_model.assigned_preparer == current_user.id)
    elif role == "reviewer":
        return query.filter(profile_model.assigned_reviewer == current_user.id)
    elif role == "approver":
        return query.filter(profile_model.assigned_approver == current_user.id)
    elif role == "certifier":
        return query.filter(profile_model.assigned_certifier == current_user.id)
        
    # Default deny for any other role
    return query.filter(False)
