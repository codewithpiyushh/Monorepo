from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException
from datetime import datetime
from ..models.models import (
    ReconciliationProfile, ExceptionQueueRecord, MatchGroup, 
    ReconciliationBalance, CertificationWorkflow
)
from ..rbac.rls import apply_profile_rls

def get_signoffs(db: Session, current_user_id: int, current_user, project_id: Optional[int] = None) -> List[dict]:
    # Base query for profiles the user is an approver for
    query = db.query(ReconciliationProfile).filter(ReconciliationProfile.active == True)
    
    # Apply RLS so they only see their assigned profiles
    query = apply_profile_rls(query, current_user, profile_model=ReconciliationProfile)
    
    if project_id:
        query = query.filter(ReconciliationProfile.project_id == project_id)
        
    profiles = query.all()
    
    # Group profiles by some virtual "entity" or just return them as individual sign-offs for now.
    # To match the UI, let's map each Profile to an "Entity Sign-off"
    result = []
    
    for prof in profiles:
        # Get cert workflow status
        wf = db.query(CertificationWorkflow).filter(
            CertificationWorkflow.profile_id == prof.id
        ).order_by(CertificationWorkflow.created_at.desc()).first()
        
        status = "In Progress"
        if wf:
            if wf.status == "APPROVED":
                status = "Signed Off"
            elif wf.status == "UNDER_REVIEW":
                status = "Ready for Sign-off"
            elif wf.status == "CERTIFIED":
                status = "Signed Off"
        
        # Get exception count
        exc_count = db.query(ExceptionQueueRecord).join(MatchGroup).filter(
            MatchGroup.profile_id == prof.id,
            ExceptionQueueRecord.status.notin_(["RESOLVED", "CLOSED"])
        ).count()
        
        # Get balances
        balances = db.query(ReconciliationBalance).filter(ReconciliationBalance.profile_id == prof.id).all()
        accounts = len(balances)
        reconciled = len([b for b in balances if b.status in ("RECONCILED", "EXPLAINED")])
        total_balance = sum(b.balance_amount for b in balances if b.balance_amount)
        
        result.append({
            "id": prof.id,
            "entity": prof.name,
            "region": "Global",
            "portfolio": prof.reconciliation_type,
            "status": status,
            "accounts": accounts,
            "reconciled": reconciled,
            "exceptions": exc_count,
            "totalBalance": f"${total_balance:,.2f}",
            "preparers": ["Assigned Preparer"],
            "dueDate": "Period Close",
        })
        
    return result

def signoff_entity(db: Session, signoff_id: int, user_id: int) -> dict:
    # signoff_id here represents the profile_id
    wf = db.query(CertificationWorkflow).filter(
        CertificationWorkflow.profile_id == signoff_id,
        CertificationWorkflow.status == "UNDER_REVIEW"
    ).order_by(CertificationWorkflow.created_at.desc()).first()
    
    if not wf:
        raise HTTPException(status_code=400, detail="No active review workflow found for this profile")
        
    wf.status = "APPROVED"
    wf.approved_by = user_id
    wf.approved_at = datetime.utcnow()
    db.commit()
    
    return {"status": "success"}
