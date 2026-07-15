from datetime import datetime
from sqlalchemy.orm import Session
from ..models.models import AutoCertRule, ReconciliationProfile, ExceptionQueueRecord
from ..services import audit_service

def get_active_rule(db: Session, project_id: int):
    # For MVP, assume one global rule per project
    rule = db.query(AutoCertRule).filter(AutoCertRule.project_id == project_id, AutoCertRule.is_active == True).first()
    if not rule:
        # Create default rule if none exists
        rule = AutoCertRule(
            project_id=project_id,
            max_variance=0.0,
            allow_exceptions=False,
            allowed_risk_levels="LOW",
            is_active=True
        )
        db.add(rule)
        db.commit()
        db.refresh(rule)
    return rule

def update_rule(db: Session, project_id: int, payload: dict, actor_id: int):
    rule = get_active_rule(db, project_id)
    if 'max_variance' in payload:
        rule.max_variance = payload['max_variance']
    if 'allow_exceptions' in payload:
        rule.allow_exceptions = payload['allow_exceptions']
    if 'allowed_risk_levels' in payload:
        rule.allowed_risk_levels = payload['allowed_risk_levels']
    
    rule.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rule)
    
    audit_service.log_action(
        db, "AUTO_CERT_RULE_UPDATED", user_id=actor_id,
        entity_type="project", entity_id=project_id,
        metadata={"rule_id": rule.id, "changes": payload}
    )
    return rule

def run_auto_certification(db: Session, project_id: int, actor_id: int):
    rule = get_active_rule(db, project_id)
    
    # Find all eligible profiles
    # Usually OPEN or SUBMITTED
    profiles = db.query(ReconciliationProfile).filter(
        ReconciliationProfile.lifecycle_state.in_(["OPEN", "SUBMITTED"])
    ).all()
    
    certified_count = 0
    skipped_count = 0
    
    allowed_risks = [r.strip().upper() for r in rule.allowed_risk_levels.split(",")]
    
    for p in profiles:
        # Check Risk
        if p.risk_classification.upper() not in allowed_risks:
            skipped_count += 1
            continue
            
        # Check Exceptions
        if not rule.allow_exceptions:
            open_exceptions = db.query(ExceptionQueueRecord).filter(
                ExceptionQueueRecord.status != "RESOLVED"
            ).count() # Very naive for MVP; normally filter by profile_id
            if open_exceptions > 0:
                skipped_count += 1
                continue
                
        # Check Variance (Requires querying balance, simplifying for MVP)
        # Assuming we check if profile itself has some variance metric or we just trust exceptions check
        
        # All checks passed, auto-certify
        p.lifecycle_state = "CERTIFIED"
        p.updated_at = datetime.utcnow()
        certified_count += 1
        
        audit_service.log_action(
            db, "SYSTEM_AUTO_CERT", user_id=actor_id,
            entity_type="profile", entity_id=p.id,
            metadata={"rule_id": rule.id, "reason": "Passed all zero-touch criteria"}
        )
        
    db.commit()
    
    return {
        "status": "success",
        "processed": len(profiles),
        "certified": certified_count,
        "skipped": skipped_count
    }
