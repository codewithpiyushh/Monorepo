import sys
sys.path.insert(0, '.')
from app.database import SessionLocal
from app.models.models import ReconciliationBalance, ReconciliationProfile, User
from app.services.variance_service import get_variance_flux_summary, get_variance_trends

db = SessionLocal()
admin = db.query(User).filter(User.username == 'admin').first()

# Test variance flux
flux = get_variance_flux_summary(db, profile_id=None, period_key=None, top_n=5, current_user=admin)
print('=== Variance Flux ===')
print('  total_profiles:', flux['total_profiles'])
print('  total_unexplained:', flux['total_unexplained'])
print('  missing_narratives:', flux['missing_narratives'])
print('  waterfall entries:', len(flux['waterfall']))
print('  top_unexplained:', len(flux['top_unexplained']))
print('  top_flux_shifts:', len(flux['top_flux_shifts']))

# Test variance trends
trends = get_variance_trends(db, profile_id=None, months=6, current_user=admin)
print()
print('=== Variance Trends ===')
for t in trends:
    print('  Period', t['period_key'], ': raw=', t['raw_variance'], ', unexplained=', t['unexplained_variance'])
db.close()
