import sys
import random
from datetime import datetime, date

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.models import (
    ReconciliationProfile,
    ReconciliationBalance,
    VarianceSnapshot,
    User
)
from app.services.variance_service import (
    CLASS_BALANCED,
    CLASS_WITHIN_THRESHOLD,
    CLASS_MATERIAL_VARIANCE,
    CLASS_CRITICAL_VARIANCE
)
from app.services.variance_service import refresh_balance_variance

def seed_historical_variance(db: Session):
    print("Seeding historical variance data for analytics dashboard...")
    profiles = db.query(ReconciliationProfile).all()
    if not profiles:
        print("No profiles found.")
        return

    admin = db.query(User).filter(User.username == "admin").first()
    actor_id = admin.id if admin else 1
    
    current_period = '2026-07'
    historical_periods = ['2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01']
    
    # 1. Generate Historical Balances and Snapshots
    for p in profiles:
        base_balance = random.uniform(10000, 500000)
        
        for period in historical_periods:
            # Fluctuate balance historically
            base_balance = base_balance * random.uniform(0.9, 1.1)
            
            raw_variance = random.choice([0, random.uniform(0, 1000), random.uniform(1000, 5000)])
            classification = CLASS_BALANCED
            if raw_variance == 0:
                classification = CLASS_BALANCED
            elif raw_variance < 500:
                classification = CLASS_WITHIN_THRESHOLD
            elif raw_variance < 3000:
                classification = CLASS_MATERIAL_VARIANCE
            else:
                classification = CLASS_CRITICAL_VARIANCE
                
            flux_pct = random.uniform(-15, 15)
            flux_amt = base_balance * (flux_pct / 100.0)
            
            # Check if balance exists
            existing_bal = db.query(ReconciliationBalance).filter_by(profile_id=p.id, period_key=period).first()
            if not existing_bal:
                # Create Balance for history
                bal = ReconciliationBalance(
                    profile_id=p.id,
                    period_key=period,
                    status='CERTIFIED',
                    source_balance=base_balance + raw_variance,
                    target_balance=base_balance,
                    variance_amount=raw_variance,
                    explained_variance=0.0,
                    unexplained_variance=raw_variance,
                    flux_amount=flux_amt,
                    flux_percentage=flux_pct,
                    variance_severity_classification=classification,
                    created_by=actor_id,
                    updated_by=actor_id
                )
                db.add(bal)
                db.commit()
            
            # Check if snapshot exists
            existing_snap = db.query(VarianceSnapshot).filter_by(profile_id=p.id, period_key=period).first()
            if not existing_snap:
                # Create Snapshot for history
                snap = VarianceSnapshot(
                    profile_id=p.id,
                    period_key=period,
                    raw_variance=raw_variance,
                    explained_variance=0.0,
                    unexplained_variance=raw_variance,
                    flux_amount=flux_amt,
                    flux_percentage=flux_pct,
                    risk_score_at_snapshot=float(p.risk_score or 0),
                    variance_classification=classification,
                    created_at=datetime.utcnow()
                )
                db.add(snap)
                db.commit()
            
    # 2. Refresh variance for current period balances to compute flux correctly now that history exists
    current_balances = db.query(ReconciliationBalance).filter(ReconciliationBalance.period_key == current_period).all()
    for b in current_balances:
        try:
            refresh_balance_variance(db, b.id, actor_id=actor_id, persist=True)
        except Exception as e:
            pass
            
    print("Historical variance data seeded successfully!")

if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed_historical_variance(db)
    finally:
        db.close()
