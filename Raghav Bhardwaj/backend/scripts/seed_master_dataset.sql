-- =============================================================================
--  DRMS MASTER TEST DATASET  ·  Version 2.0
--  Enterprise Solutions Architecture Seed Script
--  All foreign keys are cross-referenced and structurally consistent.
--  Run via: python scripts/load_master_dataset.py --reset
-- =============================================================================

-- ─── Safety: clear and restart identity sequences ─────────────────────────────
PRAGMA foreign_keys = OFF;
-- SET FOREIGN_KEY_CHECKS = 0;

-- =============================================================================
-- BLOCK 1 ─ USER ACCOUNTS (5 users covering 4 DRMS roles)
-- IDs are pinned so every downstream FK reference is deterministic.
-- Removed: reviewer role (merged into approver), auditor role
-- =============================================================================

DELETE FROM users;

INSERT INTO users (id, username, email, hashed_password, role, is_active, created_at) VALUES
(1,  'admin.sys',      'admin@drms.internal',        '$2b$12$ADMIN_HASH_PLACEHOLDER_01',  'admin',     1, '2026-01-02 08:00:00'),
(2,  'prep.alice',     'alice.chen@drms.internal',   '$2b$12$PREP1_HASH_PLACEHOLDER_02',  'preparer',  1, '2026-01-03 08:30:00'),
(3,  'prep.bob',       'bob.kumar@drms.internal',    '$2b$12$PREP2_HASH_PLACEHOLDER_03',  'preparer',  1, '2026-01-03 09:00:00'),
(4,  'appr.james',     'james.ford@drms.internal',   '$2b$12$APPR_HASH_PLACEHOLDER_05',   'approver',  1, '2026-01-05 08:00:00'),
(5,  'cfo.margaret',   'margaret.wu@drms.internal',  '$2b$12$CFO__HASH_PLACEHOLDER_08',   'certifier', 1, '2026-01-06 09:00:00');


-- =============================================================================
-- BLOCK 2 ─ PROJECTS (10 projects, one per reconciliation type)
-- =============================================================================

DELETE FROM projects;

INSERT INTO projects (id, name, description, status, created_by, created_at, updated_at) VALUES
(1,  'Cash & Bank Reconciliation Q2-2026',        'Main operating account bank recon – Wells Fargo', 'active', 1, '2026-04-01 07:00:00', '2026-06-01 07:00:00'),
(2,  'Accounts Receivable Aging Q2-2026',          'AR subledger vs GL – Trade receivables',          'active', 1, '2026-04-01 07:10:00', '2026-06-01 07:10:00'),
(3,  'Accounts Payable Reconciliation Q2-2026',    'AP subledger vs GL – Vendor invoices',            'active', 1, '2026-04-01 07:20:00', '2026-06-01 07:20:00'),
(4,  'Intercompany Elimination Q2-2026',           'IC transactions between APAC and EMEA entities',  'active', 1, '2026-04-01 07:30:00', '2026-06-01 07:30:00'),
(5,  'Payroll Reconciliation Q2-2026',             'Payroll disbursements vs payroll register',       'active', 1, '2026-04-01 07:40:00', '2026-06-01 07:40:00'),
(6,  'Inventory Valuation Reconciliation Q2-2026', 'Perpetual inventory vs physical count',           'active', 1, '2026-04-01 07:50:00', '2026-06-01 07:50:00'),
(7,  'Fixed Assets Reconciliation Q2-2026',        'Fixed asset register vs GL asset accounts',       'active', 1, '2026-04-01 08:00:00', '2026-06-01 08:00:00'),
(8,  'Prepaid & Accruals Q2-2026',                 'Prepaid expenses vs amortisation schedule',       'active', 1, '2026-04-01 08:10:00', '2026-06-01 08:10:00'),
(9,  'Investment Portfolio Reconciliation Q2-2026','Custody statement vs investment ledger',           'active', 2, '2026-04-01 08:20:00', '2026-06-01 08:20:00'),
(10, 'Fraud Risk Monitoring – High Alert Q2-2026', 'Anomaly & fraud pattern detection profiles',      'active', 1, '2026-04-01 08:30:00', '2026-06-01 08:30:00');


-- =============================================================================
-- BLOCK 3 ─ RECONCILIATION PROFILES (10 profiles)
-- Risk mix: 6 clean, 2 minor variance, 2 critical variance
-- =============================================================================

DELETE FROM reconciliation_profiles;

INSERT INTO reconciliation_profiles
  (id, project_id, name, reconciliation_type, frequency,
   tolerance_threshold, date_window_days,
   workflow_config_json, matching_rules_json,
   assigned_preparer, assigned_reviewer, assigned_approver, assigned_certifier,
   risk_classification, risk_score, risk_scored_at,
   due_days, auto_approve_threshold, materiality_limit,
   lifecycle_state, active, created_at, updated_at)
VALUES
-- ── Profile 1: Cash & Bank – CLEAN (FULL_MATCH, LOW risk) ──────────────────
(1,  1, 'WF-Operating-Account-2026-06', 'BANK_RECONCILIATION', 'MONTHLY',
    50.00, 2,
    '{"require_preparer":true,"require_reviewer":true,"require_approver":false,"require_certifier":false,"sod_enforced":true}',
    '{"primary":"EXACT","fallback":["TOLERANCE","DATE_WINDOW"],"key_fields":["reference","amount"]}',
    2, 4, 5, 8,
    'LOW',   12.5, '2026-06-01 00:05:00',
    5, 0.98, 500.00,
    'IN_PROGRESS', 1, '2026-04-01 07:00:00', '2026-06-01 07:00:00'),

-- ── Profile 2: AR – CLEAN (FULL_MATCH, LOW risk) ────────────────────────────
(2,  2, 'AR-Trade-Receivables-2026-06', 'ACCOUNTS_RECEIVABLE', 'MONTHLY',
    25.00, 3,
    '{"require_preparer":true,"require_reviewer":true,"require_approver":false,"require_certifier":false,"sod_enforced":true}',
    '{"primary":"EXACT","fallback":["TOLERANCE"],"key_fields":["invoice_number","amount"]}',
    2, 4, 5, 8,
    'LOW',   8.0,  '2026-06-01 00:05:00',
    5, 0.97, 250.00,
    'PREPARED', 1, '2026-04-01 07:10:00', '2026-06-01 07:10:00'),

-- ── Profile 3: AP – CLEAN (FULL_MATCH, LOW risk) ────────────────────────────
(3,  3, 'AP-Vendor-Invoices-2026-06', 'ACCOUNTS_PAYABLE', 'MONTHLY',
    10.00, 3,
    '{"require_preparer":true,"require_reviewer":true,"require_approver":false,"require_certifier":false,"sod_enforced":true}',
    '{"primary":"EXACT","fallback":["FUZZY","TOLERANCE"],"key_fields":["invoice_number","vendor_id"]}',
    3, 4, 5, 8,
    'LOW',   6.5,  '2026-06-01 00:05:00',
    5, 0.97, 100.00,
    'UNDER_REVIEW', 1, '2026-04-01 07:20:00', '2026-06-01 07:20:00'),

-- ── Profile 4: Intercompany – CLEAN (FULL_MATCH, MEDIUM risk) ───────────────
(4,  4, 'IC-APAC-EMEA-Elimination-2026-06', 'INTERCOMPANY', 'MONTHLY',
    100.00, 5,
    '{"require_preparer":true,"require_reviewer":true,"require_approver":true,"require_certifier":false,"sod_enforced":true}',
    '{"primary":"EXACT","fallback":["TOLERANCE","DATE_WINDOW"],"key_fields":["ic_ref","entity_pair","amount"]}',
    2, 4, 5, 8,
    'MEDIUM', 34.2, '2026-06-01 00:05:00',
    7, 0.95, 1000.00,
    'IN_PROGRESS', 1, '2026-04-01 07:30:00', '2026-06-01 07:30:00'),

-- ── Profile 5: Payroll – CLEAN (FULL_MATCH, LOW risk) ───────────────────────
(5,  5, 'Payroll-Register-2026-06', 'PAYROLL', 'MONTHLY',
    1.00, 0,
    '{"require_preparer":true,"require_reviewer":true,"require_approver":false,"require_certifier":false,"sod_enforced":true}',
    '{"primary":"EXACT","fallback":[],"key_fields":["employee_id","period","amount"]}',
    3, 6, 5, 8,
    'LOW',   5.0,  '2026-06-01 00:05:00',
    3, 0.99, 50.00,
    'CERTIFIED', 1, '2026-04-01 07:40:00', '2026-06-01 07:40:00'),

-- ── Profile 6: Inventory – CLEAN (FULL_MATCH, MEDIUM risk) ──────────────────
(6,  6, 'Inventory-Valuation-2026-06', 'INVENTORY', 'MONTHLY',
    200.00, 7,
    '{"require_preparer":true,"require_reviewer":true,"require_approver":false,"require_certifier":false,"sod_enforced":true}',
    '{"primary":"EXACT","fallback":["TOLERANCE"],"key_fields":["sku","warehouse","amount"]}',
    2, 6, 5, 8,
    'MEDIUM', 28.0, '2026-06-01 00:05:00',
    7, 0.95, 2000.00,
    'IN_PROGRESS', 1, '2026-04-01 07:50:00', '2026-06-01 07:50:00'),

-- ── Profile 7: Fixed Assets – MINOR VARIANCE (MEDIUM risk) ──────────────────
(7,  7, 'Fixed-Assets-Register-2026-06', 'FIXED_ASSETS', 'MONTHLY',
    500.00, 5,
    '{"require_preparer":true,"require_reviewer":true,"require_approver":true,"require_certifier":false,"sod_enforced":true}',
    '{"primary":"EXACT","fallback":["TOLERANCE"],"key_fields":["asset_id","amount"]}',
    2, 4, 5, 8,
    'MEDIUM', 47.8, '2026-06-01 00:05:00',
    7, 0.94, 5000.00,
    'IN_PROGRESS', 1, '2026-04-01 08:00:00', '2026-06-01 08:00:00'),

-- ── Profile 8: Prepaid & Accruals – MINOR VARIANCE (MEDIUM risk) ────────────
(8,  8, 'Prepaid-Accruals-2026-06', 'ACCRUALS', 'MONTHLY',
    150.00, 3,
    '{"require_preparer":true,"require_reviewer":true,"require_approver":false,"require_certifier":false,"sod_enforced":true}',
    '{"primary":"EXACT","fallback":["TOLERANCE","DATE_WINDOW"],"key_fields":["accrual_ref","amount"]}',
    3, 4, 5, 8,
    'MEDIUM', 42.1, '2026-06-01 00:05:00',
    5, 0.95, 1500.00,
    'IN_PROGRESS', 1, '2026-04-01 08:10:00', '2026-06-01 08:10:00'),

-- ── Profile 9: Investment – CRITICAL VARIANCE (HIGH risk) ───────────────────
(9,  9, 'Investment-Portfolio-2026-06', 'INVESTMENT', 'MONTHLY',
    1000.00, 7,
    '{"require_preparer":true,"require_reviewer":true,"require_approver":true,"require_certifier":true,"sod_enforced":true}',
    '{"primary":"EXACT","fallback":["TOLERANCE","DATE_WINDOW","FUZZY"],"key_fields":["cusip","amount","currency"]}',
    2, 4, 5, 8,
    'HIGH',  78.4, '2026-06-01 00:05:00',
    5, 0.90, 10000.00,
    'IN_PROGRESS', 1, '2026-04-01 08:20:00', '2026-06-01 08:20:00'),

-- ── Profile 10: Fraud Risk – CRITICAL VARIANCE (CRITICAL risk) ──────────────
(10, 10, 'Fraud-Risk-High-Alert-2026-06', 'FRAUD_MONITORING', 'DAILY',
    0.01, 0,
    '{"require_preparer":true,"require_reviewer":true,"require_approver":true,"require_certifier":true,"sod_enforced":true}',
    '{"primary":"EXACT","fallback":[],"key_fields":["reference","amount","entity"]}',
    2, 4, 5, 8,
    'CRITICAL', 91.7, '2026-06-01 00:05:00',
    1, 1.00, 0.01,
    'IN_PROGRESS', 1, '2026-04-01 08:30:00', '2026-06-01 08:30:00');


-- =============================================================================
-- BLOCK 4 ─ FINANCIAL CLOSE CALENDAR (one calendar per profile for June 2026)
-- =============================================================================

DELETE FROM financial_close_calendar;

INSERT INTO financial_close_calendar
  (id, profile_id, cycle_type, period_key, start_date, end_date, due_date, status, is_locked, created_at)
VALUES
(1,  1,  'MONTHLY', '2026-06', '2026-06-01', '2026-06-30', '2026-07-05', 'IN_PROGRESS', 0, '2026-06-01 00:00:00'),
(2,  2,  'MONTHLY', '2026-06', '2026-06-01', '2026-06-30', '2026-07-05', 'IN_PROGRESS', 0, '2026-06-01 00:00:00'),
(3,  3,  'MONTHLY', '2026-06', '2026-06-01', '2026-06-30', '2026-07-05', 'IN_PROGRESS', 0, '2026-06-01 00:00:00'),
(4,  4,  'MONTHLY', '2026-06', '2026-06-01', '2026-06-30', '2026-07-07', 'IN_PROGRESS', 0, '2026-06-01 00:00:00'),
(5,  5,  'MONTHLY', '2026-06', '2026-06-01', '2026-06-30', '2026-07-03', 'CLOSED',      1, '2026-06-01 00:00:00'),
(6,  6,  'MONTHLY', '2026-06', '2026-06-01', '2026-06-30', '2026-07-07', 'IN_PROGRESS', 0, '2026-06-01 00:00:00'),
(7,  7,  'MONTHLY', '2026-06', '2026-06-01', '2026-06-30', '2026-07-07', 'IN_PROGRESS', 0, '2026-06-01 00:00:00'),
(8,  8,  'MONTHLY', '2026-06', '2026-06-01', '2026-06-30', '2026-07-05', 'IN_PROGRESS', 0, '2026-06-01 00:00:00'),
(9,  9,  'MONTHLY', '2026-06', '2026-06-01', '2026-06-30', '2026-07-05', 'IN_PROGRESS', 0, '2026-06-01 00:00:00'),
(10, 10, 'MONTHLY', '2026-06', '2026-06-01', '2026-06-30', '2026-07-01', 'IN_PROGRESS', 0, '2026-06-01 00:00:00');


-- =============================================================================
-- BLOCK 5 ─ CERTIFICATION WORKFLOWS
-- Updated: reviewer_id now merged into approver_id (single approver role handles review & approval)
-- =============================================================================

DELETE FROM certification_workflows;

INSERT INTO certification_workflows
  (id, profile_id, calendar_id, status, current_stage,
   preparer_id, reviewer_id, approver_id, certifier_id,
   due_date, last_comment, created_at, updated_at)
VALUES
(1,  1,  1,  'PREPARED',     'APPROVER',   2, 4, 4, 5, '2026-07-05', 'Bank statement tied to GL. 3 minor timing diffs noted.',               '2026-06-01 08:00:00', '2026-06-10 14:22:00'),
(2,  2,  2,  'PREPARED',     'APPROVER',   2, 4, 4, 5, '2026-07-05', 'AR aging matches subledger 100%. No exceptions.',                      '2026-06-01 08:10:00', '2026-06-10 15:00:00'),
(3,  3,  3,  'UNDER_REVIEW', 'APPROVER',   3, 4, 4, 5, '2026-07-05', 'AP reviewed. 2 invoices pending PO match – flagged for approver.',      '2026-06-01 08:20:00', '2026-06-11 09:45:00'),
(4,  4,  4,  'OPEN',         'PREPARER',   2, 4, 4, 5, '2026-07-07', 'IC entries uploaded. Awaiting EMEA confirmation.',                      '2026-06-01 08:30:00', '2026-06-08 11:00:00'),
(5,  5,  5,  'CERTIFIED',    'CLOSED',     3, 4, 4, 5, '2026-07-03', 'Payroll fully reconciled and certified by CFO.',                        '2026-06-01 08:40:00', '2026-06-05 16:00:00'),
(6,  6,  6,  'PREPARED',     'APPROVER',   2, 4, 4, 5, '2026-07-07', 'Inventory count discrepancy of $1,200 noted in WH-03. Under review.',   '2026-06-01 08:50:00', '2026-06-10 10:30:00'),
(7,  7,  7,  'UNDER_REVIEW', 'APPROVER',   2, 4, 4, 5, '2026-07-07', 'FA schedule variance: accumulated depreciation mismatch $3,450.',       '2026-06-01 09:00:00', '2026-06-11 11:00:00'),
(8,  8,  8,  'OPEN',         'PREPARER',   3, 4, 4, 5, '2026-07-05', 'Prepaid schedule loaded. 4 accruals pending reversal confirmation.',     '2026-06-01 09:10:00', '2026-06-09 08:00:00'),
(9,  9,  9,  'UNDER_REVIEW', 'APPROVER',   2, 4, 4, 5, '2026-07-05', 'Investment custodian report shows $128,450 unexplained variance. HIGH.', '2026-06-01 09:20:00', '2026-06-11 14:00:00'),
(10, 10, 10, 'OPEN',         'PREPARER',   2, 4, 4, 5, '2026-07-01', 'CRITICAL: 7 fraud-pattern transactions flagged. CFO alerted.',          '2026-06-01 09:30:00', '2026-06-11 17:00:00');


-- =============================================================================
-- BLOCK 6 ─ CERTIFICATION WORKFLOW HISTORY (realistic audit trail per workflow)
-- =============================================================================

DELETE FROM certification_workflow_history;

INSERT INTO certification_workflow_history
  (id, workflow_id, actor_id, actor_role, action, from_status, to_status, comments, created_at)
VALUES
-- Workflow 1 (Bank – PREPARED/APPROVER stage)
(1,  1, 1, 'ADMIN',    'PREPARE',  'OPEN',          'PREPARED',     'Profile created and assigned to preparer Alice.',                           '2026-06-01 08:00:00'),
(2,  1, 2, 'PREPARER', 'SUBMIT',   'PREPARED',      'UNDER_REVIEW', 'Bank statement imported. 145 records matched. 3 timing diffs documented.', '2026-06-10 14:22:00'),
-- Workflow 2 (AR – PREPARED/APPROVER stage)
(3,  2, 1, 'ADMIN',    'PREPARE',  'OPEN',          'PREPARED',     'AR profile initialised for Q2 close.',                                      '2026-06-01 08:10:00'),
(4,  2, 2, 'PREPARER', 'SUBMIT',   'PREPARED',      'UNDER_REVIEW', 'All 212 invoices reconciled. Zero exceptions.',                            '2026-06-10 15:00:00'),
-- Workflow 3 (AP – UNDER_REVIEW/APPROVER stage)
(5,  3, 1, 'ADMIN',    'PREPARE',  'OPEN',          'PREPARED',     'AP profile initialised.',                                                   '2026-06-01 08:20:00'),
(6,  3, 3, 'PREPARER', 'SUBMIT',   'PREPARED',      'UNDER_REVIEW', '2 invoices flagged: duplicate PO numbers INV-4421 and INV-4422.',          '2026-06-09 16:00:00'),
(7,  3, 4, 'APPROVER', 'REVIEW',   'UNDER_REVIEW',  'REVIEWED',     'Confirmed duplicate. Reviewing for approval decision.',                     '2026-06-11 09:45:00'),
-- Workflow 5 (Payroll – CERTIFIED/CLOSED)
(8,  5, 1, 'ADMIN',    'PREPARE',  'OPEN',          'PREPARED',     'Payroll profile June 2026.',                                                '2026-06-01 08:40:00'),
(9,  5, 3, 'PREPARER', 'SUBMIT',   'PREPARED',      'UNDER_REVIEW', 'All 320 employee records matched. Zero variance.',                         '2026-06-03 17:00:00'),
(10, 5, 4, 'APPROVER', 'APPROVE',  'REVIEWED',      'APPROVED',     'Reviewed and approved. Clean payroll run.',                                 '2026-06-04 11:00:00'),
(11, 5, 5, 'CERTIFIER','CERTIFY',  'APPROVED',       'CERTIFIED',    'Certified by CFO Margaret Wu. Close period locked.',                       '2026-06-05 16:00:00'),
-- Workflow 9 (Investment – HIGH risk, UNDER_REVIEW)
(12, 9, 1, 'ADMIN',    'PREPARE',  'OPEN',          'PREPARED',     'Investment profile loaded from custody feed.',                              '2026-06-01 09:20:00'),
(13, 9, 2, 'PREPARER', 'SUBMIT',   'PREPARED',      'UNDER_REVIEW', 'ALERT: Custodian report shows $128,450 variance on CUSIP US38141GXZ77.',   '2026-06-09 14:00:00'),
(14, 9, 4, 'APPROVER', 'REVIEW',   'UNDER_REVIEW',  'REVIEWED',     'Pending confirmation from custodian. Do not certify until resolved.',       '2026-06-11 14:00:00'),
-- Workflow 10 (Fraud – CRITICAL)
(15, 10, 1,'ADMIN',    'PREPARE',  'OPEN',          'PREPARED',     'Fraud monitoring profile activated for Q2 anomaly scan.',                   '2026-06-01 09:30:00'),
(16, 10, 2,'PREPARER', 'SUBMIT',   'PREPARED',      'UNDER_REVIEW', 'CRITICAL: 7 round-dollar weekend postings detected. CFO notified.',         '2026-06-11 17:00:00');


-- =============================================================================
-- BLOCK 7 ─ RECONCILIATION RECORDS (Transaction Stream)
-- Source system = GL/ERP, Target system = BANK/SUBLEDGER
-- Profiles 1 & 2: Clean matches
-- Profiles 9 & 10: Structural variances + fraud anomalies
-- All dates relative to 2026-06-11 to hit every aging bucket.
-- =============================================================================

DELETE FROM reconciliation_records;

-- ═══════════════════════════════════════════════════════════════════
--  PROFILE 1 – BANK RECONCILIATION (Clean + 3 timing differences)
--  GL source (source_system = 'WF-GL') vs Bank target (WF-BANK)
-- ═══════════════════════════════════════════════════════════════════

-- GL SOURCE records (25 items)
INSERT INTO reconciliation_records
  (id, batch_id, profile_id, source_system, entity, account, period, currency, amount, reference, tx_date, normalized_sign, status, payload_json, created_at)
VALUES
(1,  'BATCH-BANK-2026-06', 1, 'WF-GL',   'DRMS-CORP', '10100', '2026-06', 'USD', 125450.00, 'GL-00001', '2026-06-01', 'DEBIT',  'VALIDATED', '{"desc":"Wire to AWS Cloud services","category":"IT"}', '2026-06-01 10:00:00'),
(2,  'BATCH-BANK-2026-06', 1, 'WF-GL',   'DRMS-CORP', '10100', '2026-06', 'USD',  48200.00, 'GL-00002', '2026-06-02', 'DEBIT',  'VALIDATED', '{"desc":"Office lease payment June","category":"RENT"}','2026-06-02 10:00:00'),
(3,  'BATCH-BANK-2026-06', 1, 'WF-GL',   'DRMS-CORP', '10100', '2026-06', 'USD',  12500.00, 'GL-00003', '2026-06-03', 'CREDIT', 'VALIDATED', '{"desc":"Customer payment – Acme Corp","category":"AR"}','2026-06-03 10:00:00'),
(4,  'BATCH-BANK-2026-06', 1, 'WF-GL',   'DRMS-CORP', '10100', '2026-06', 'USD',  98000.00, 'GL-00004', '2026-06-04', 'DEBIT',  'VALIDATED', '{"desc":"Vendor payment – IBM Consulting","category":"AP"}','2026-06-04 10:00:00'),
(5,  'BATCH-BANK-2026-06', 1, 'WF-GL',   'DRMS-CORP', '10100', '2026-06', 'USD',  22750.00, 'GL-00005', '2026-06-05', 'DEBIT',  'VALIDATED', '{"desc":"Insurance premium Q2","category":"INSURANCE"}','2026-06-05 10:00:00'),
(6,  'BATCH-BANK-2026-06', 1, 'WF-GL',   'DRMS-CORP', '10100', '2026-06', 'USD', 345600.00, 'GL-00006', '2026-06-06', 'CREDIT', 'VALIDATED', '{"desc":"Revenue receipt – GlobalTech","category":"AR"}','2026-06-06 10:00:00'),
(7,  'BATCH-BANK-2026-06', 1, 'WF-GL',   'DRMS-CORP', '10100', '2026-06', 'USD',  15000.00, 'GL-00007', '2026-06-07', 'DEBIT',  'VALIDATED', '{"desc":"Payroll advance June batch 1","category":"PAYROLL"}','2026-06-07 10:00:00'),
(8,  'BATCH-BANK-2026-06', 1, 'WF-GL',   'DRMS-CORP', '10100', '2026-06', 'USD',   8900.00, 'GL-00008', '2026-06-08', 'DEBIT',  'VALIDATED', '{"desc":"Travel & entertainment Q2","category":"T&E"}','2026-06-08 10:00:00'),
(9,  'BATCH-BANK-2026-06', 1, 'WF-GL',   'DRMS-CORP', '10100', '2026-06', 'USD', 500000.00, 'GL-00009', '2026-06-09', 'CREDIT', 'VALIDATED', '{"desc":"Bond proceeds – Q2 issuance","category":"FINANCING"}','2026-06-09 10:00:00'),
(10, 'BATCH-BANK-2026-06', 1, 'WF-GL',   'DRMS-CORP', '10100', '2026-06', 'USD',  33400.00, 'GL-00010', '2026-06-10', 'DEBIT',  'VALIDATED', '{"desc":"Equipment lease – Xerox","category":"LEASE"}','2026-06-10 10:00:00'),
-- Timing difference items (3 items in GL but NOT yet in bank – created 1 day ago = 0-30 day bucket)
(11, 'BATCH-BANK-2026-06', 1, 'WF-GL',   'DRMS-CORP', '10100', '2026-06', 'USD',  19200.00, 'GL-TIMING-01', '2026-06-10', 'DEBIT',  'UNMATCHED', '{"desc":"Check #4891 – in transit","category":"AP","note":"TIMING_DIFF"}','2026-06-10 15:00:00'),
(12, 'BATCH-BANK-2026-06', 1, 'WF-GL',   'DRMS-CORP', '10100', '2026-06', 'USD',   4750.00, 'GL-TIMING-02', '2026-06-09', 'DEBIT',  'UNMATCHED', '{"desc":"ACH batch #8820 – in transit","category":"AP","note":"TIMING_DIFF"}','2026-06-09 15:00:00'),
(13, 'BATCH-BANK-2026-06', 1, 'WF-GL',   'DRMS-CORP', '10100', '2026-06', 'USD',   2100.00, 'GL-TIMING-03', '2026-06-08', 'DEBIT',  'UNMATCHED', '{"desc":"Wire #WR-2281 – pending clearance","category":"AP","note":"TIMING_DIFF"}','2026-06-08 15:00:00');

-- BANK TARGET records (matched pairs + bank-only items)
INSERT INTO reconciliation_records
  (id, batch_id, profile_id, source_system, entity, account, period, currency, amount, reference, tx_date, normalized_sign, status, payload_json, created_at)
VALUES
(101, 'BATCH-BANK-2026-06', 1, 'WF-BANK', 'DRMS-CORP', '10100', '2026-06', 'USD', 125450.00, 'GL-00001', '2026-06-01', 'DEBIT',  'RECONCILED', '{"desc":"Wire out – AWS"}', '2026-06-01 11:00:00'),
(102, 'BATCH-BANK-2026-06', 1, 'WF-BANK', 'DRMS-CORP', '10100', '2026-06', 'USD',  48200.00, 'GL-00002', '2026-06-02', 'DEBIT',  'RECONCILED', '{"desc":"Lease debit"}',     '2026-06-02 11:00:00'),
(103, 'BATCH-BANK-2026-06', 1, 'WF-BANK', 'DRMS-CORP', '10100', '2026-06', 'USD',  12500.00, 'GL-00003', '2026-06-03', 'CREDIT', 'RECONCILED', '{"desc":"Deposit Acme"}',    '2026-06-03 11:00:00'),
(104, 'BATCH-BANK-2026-06', 1, 'WF-BANK', 'DRMS-CORP', '10100', '2026-06', 'USD',  98000.00, 'GL-00004', '2026-06-04', 'DEBIT',  'RECONCILED', '{"desc":"IBM wire out"}',    '2026-06-04 11:00:00'),
(105, 'BATCH-BANK-2026-06', 1, 'WF-BANK', 'DRMS-CORP', '10100', '2026-06', 'USD',  22750.00, 'GL-00005', '2026-06-05', 'DEBIT',  'RECONCILED', '{"desc":"Insurance debit"}'  ,'2026-06-05 11:00:00'),
(106, 'BATCH-BANK-2026-06', 1, 'WF-BANK', 'DRMS-CORP', '10100', '2026-06', 'USD', 345600.00, 'GL-00006', '2026-06-06', 'CREDIT', 'RECONCILED', '{"desc":"Deposit GlobalTech"}','2026-06-06 11:00:00'),
(107, 'BATCH-BANK-2026-06', 1, 'WF-BANK', 'DRMS-CORP', '10100', '2026-06', 'USD',  15000.00, 'GL-00007', '2026-06-07', 'DEBIT',  'RECONCILED', '{"desc":"Payroll ACH"}',     '2026-06-07 11:00:00'),
(108, 'BATCH-BANK-2026-06', 1, 'WF-BANK', 'DRMS-CORP', '10100', '2026-06', 'USD',   8900.00, 'GL-00008', '2026-06-08', 'DEBIT',  'RECONCILED', '{"desc":"T&E card charge"}'  ,'2026-06-08 11:00:00'),
(109, 'BATCH-BANK-2026-06', 1, 'WF-BANK', 'DRMS-CORP', '10100', '2026-06', 'USD', 500000.00, 'GL-00009', '2026-06-09', 'CREDIT', 'RECONCILED', '{"desc":"Bond proceeds"}'    ,'2026-06-09 11:00:00'),
(110, 'BATCH-BANK-2026-06', 1, 'WF-BANK', 'DRMS-CORP', '10100', '2026-06', 'USD',  33400.00, 'GL-00010', '2026-06-10', 'DEBIT',  'RECONCILED', '{"desc":"Xerox lease debit"}','2026-06-10 11:00:00'),
-- Bank-only item: NSF charge not in GL
(120, 'BATCH-BANK-2026-06', 1, 'WF-BANK', 'DRMS-CORP', '10100', '2026-06', 'USD',    35.00, 'BANK-NSF-01', '2026-06-05', 'DEBIT',  'UNMATCHED', '{"desc":"NSF fee","note":"BANK_ONLY"}','2026-06-05 12:00:00');


-- ═══════════════════════════════════════════════════════════════════
--  PROFILE 9 – INVESTMENT PORTFOLIO (CRITICAL VARIANCE – HIGH RISK)
--  25 records, $128,450 structural variance
-- ═══════════════════════════════════════════════════════════════════

-- GL Ledger source (investment book)
INSERT INTO reconciliation_records
  (id, batch_id, profile_id, source_system, entity, account, period, currency, amount, reference, tx_date, normalized_sign, status, payload_json, created_at)
VALUES
(200, 'BATCH-INV-2026-06', 9, 'INV-GL',      'DRMS-CORP', '17000', '2026-06', 'USD', 2500000.00, 'CUSIP-US0378331005-A', '2026-06-30', 'DEBIT', 'VALIDATED', '{"cusip":"US0378331005","desc":"Apple Inc equity position","shares":12500,"price":200.00}', '2026-06-30 16:00:00'),
(201, 'BATCH-INV-2026-06', 9, 'INV-GL',      'DRMS-CORP', '17000', '2026-06', 'USD', 1875000.00, 'CUSIP-US5949181045-A', '2026-06-30', 'DEBIT', 'VALIDATED', '{"cusip":"US5949181045","desc":"Microsoft Corp equity","shares":5000,"price":375.00}', '2026-06-30 16:00:00'),
(202, 'BATCH-INV-2026-06', 9, 'INV-GL',      'DRMS-CORP', '17000', '2026-06', 'USD',  648000.00, 'CUSIP-US38141GXZ77-A', '2026-06-30', 'DEBIT', 'VALIDATED', '{"cusip":"US38141GXZ77","desc":"Google Alphabet B","shares":4000,"price":162.00}', '2026-06-30 16:00:00'),
(203, 'BATCH-INV-2026-06', 9, 'INV-GL',      'DRMS-CORP', '17000', '2026-06', 'USD', 1200000.00, 'CUSIP-US4592001014-A', '2026-06-30', 'DEBIT', 'VALIDATED', '{"cusip":"US4592001014","desc":"IBM Corp bond 4.25%","face":1200000}', '2026-06-30 16:00:00'),
(204, 'BATCH-INV-2026-06', 9, 'INV-GL',      'DRMS-CORP', '17000', '2026-06', 'USD',  325000.00, 'CUSIP-US9311421039-A', '2026-06-30', 'DEBIT', 'VALIDATED', '{"cusip":"US9311421039","desc":"Walmart common stock","shares":2500,"price":130.00}', '2026-06-30 16:00:00'),
-- 5 additional clean GL items (IDs 205-209)
(205, 'BATCH-INV-2026-06', 9, 'INV-GL',      'DRMS-CORP', '17000', '2026-06', 'USD',  420000.00, 'CUSIP-US17275R1023-A','2026-06-30', 'DEBIT', 'VALIDATED', '{"cusip":"US17275R1023","desc":"Cisco Systems","shares":8400,"price":50.00}',  '2026-06-30 16:00:00'),
(206, 'BATCH-INV-2026-06', 9, 'INV-GL',      'DRMS-CORP', '17000', '2026-06', 'USD',  580000.00, 'CUSIP-US6541061031-A','2026-06-30', 'DEBIT', 'VALIDATED', '{"cusip":"US6541061031","desc":"Nike Inc","shares":4000,"price":145.00}',    '2026-06-30 16:00:00'),
(207, 'BATCH-INV-2026-06', 9, 'INV-GL',      'DRMS-CORP', '17000', '2026-06', 'USD',  310000.00, 'CUSIP-US0846707026-A','2026-06-30', 'DEBIT', 'VALIDATED', '{"cusip":"US0846707026","desc":"Berkshire B","shares":800,"price":387.50}',  '2026-06-30 16:00:00'),
(208, 'BATCH-INV-2026-06', 9, 'INV-GL',      'DRMS-CORP', '17000', '2026-06', 'USD',  195000.00, 'CUSIP-US88160R1014-A','2026-06-30', 'DEBIT', 'VALIDATED', '{"cusip":"US88160R1014","desc":"Tesla Inc","shares":1000,"price":195.00}',   '2026-06-30 16:00:00'),
(209, 'BATCH-INV-2026-06', 9, 'INV-GL',      'DRMS-CORP', '17000', '2026-06', 'USD', 2800000.00, 'TREAS-UST-2026-6M',  '2026-06-30', 'DEBIT', 'VALIDATED', '{"desc":"US Treasury 6M T-Bill","face":2800000,"rate":5.25}',              '2026-06-30 16:00:00');

-- Custodian TARGET records (mismatched on CUSIP-US38141GXZ77 — $128,450 variance)
INSERT INTO reconciliation_records
  (id, batch_id, profile_id, source_system, entity, account, period, currency, amount, reference, tx_date, normalized_sign, status, payload_json, created_at)
VALUES
(250, 'BATCH-INV-2026-06', 9, 'CUSTODIAN',  'DRMS-CORP', '17000', '2026-06', 'USD', 2500000.00, 'CUSIP-US0378331005-A', '2026-06-30', 'DEBIT', 'RECONCILED', '{"cusip":"US0378331005","desc":"Apple Inc","shares":12500,"price":200.00}', '2026-06-30 17:00:00'),
(251, 'BATCH-INV-2026-06', 9, 'CUSTODIAN',  'DRMS-CORP', '17000', '2026-06', 'USD', 1875000.00, 'CUSIP-US5949181045-A', '2026-06-30', 'DEBIT', 'RECONCILED', '{"cusip":"US5949181045","desc":"Microsoft","shares":5000,"price":375.00}', '2026-06-30 17:00:00'),
-- *** VARIANCE HERE: GL=$648,000 vs Custodian=$519,550 → Delta=$128,450 ***
(252, 'BATCH-INV-2026-06', 9, 'CUSTODIAN',  'DRMS-CORP', '17000', '2026-06', 'USD',  519550.00, 'CUSIP-US38141GXZ77-A', '2026-06-30', 'DEBIT', 'UNMATCHED',  '{"cusip":"US38141GXZ77","desc":"Google Alphabet B","shares":3205,"price":162.12,"note":"SHARE_COUNT_DISCREPANCY"}','2026-06-30 17:00:00'),
(253, 'BATCH-INV-2026-06', 9, 'CUSTODIAN',  'DRMS-CORP', '17000', '2026-06', 'USD', 1200000.00, 'CUSIP-US4592001014-A', '2026-06-30', 'DEBIT', 'RECONCILED', '{"cusip":"US4592001014","desc":"IBM bond","face":1200000}',              '2026-06-30 17:00:00'),
(254, 'BATCH-INV-2026-06', 9, 'CUSTODIAN',  'DRMS-CORP', '17000', '2026-06', 'USD',  325000.00, 'CUSIP-US9311421039-A', '2026-06-30', 'DEBIT', 'RECONCILED', '{"cusip":"US9311421039","desc":"Walmart","shares":2500,"price":130.00}',  '2026-06-30 17:00:00'),
(255, 'BATCH-INV-2026-06', 9, 'CUSTODIAN',  'DRMS-CORP', '17000', '2026-06', 'USD',  420000.00, 'CUSIP-US17275R1023-A','2026-06-30', 'DEBIT', 'RECONCILED', '{"cusip":"US17275R1023","desc":"Cisco","shares":8400,"price":50.00}',      '2026-06-30 17:00:00'),
(256, 'BATCH-INV-2026-06', 9, 'CUSTODIAN',  'DRMS-CORP', '17000', '2026-06', 'USD',  580000.00, 'CUSIP-US6541061031-A','2026-06-30', 'DEBIT', 'RECONCILED', '{"cusip":"US6541061031","desc":"Nike","shares":4000,"price":145.00}',      '2026-06-30 17:00:00'),
(257, 'BATCH-INV-2026-06', 9, 'CUSTODIAN',  'DRMS-CORP', '17000', '2026-06', 'USD',  310000.00, 'CUSIP-US0846707026-A','2026-06-30', 'DEBIT', 'RECONCILED', '{"cusip":"US0846707026","desc":"Berkshire B","shares":800,"price":387.50}','2026-06-30 17:00:00'),
(258, 'BATCH-INV-2026-06', 9, 'CUSTODIAN',  'DRMS-CORP', '17000', '2026-06', 'USD',  195000.00, 'CUSIP-US88160R1014-A','2026-06-30', 'DEBIT', 'RECONCILED', '{"cusip":"US88160R1014","desc":"Tesla","shares":1000,"price":195.00}',     '2026-06-30 17:00:00'),
(259, 'BATCH-INV-2026-06', 9, 'CUSTODIAN',  'DRMS-CORP', '17000', '2026-06', 'USD', 2800000.00, 'TREAS-UST-2026-6M',  '2026-06-30', 'DEBIT', 'RECONCILED', '{"desc":"T-Bill","face":2800000}',                                         '2026-06-30 17:00:00');


-- ═══════════════════════════════════════════════════════════════════
--  PROFILE 10 – FRAUD RISK MONITORING (CRITICAL RISK)
--  Embedded anomaly patterns: round-dollar, weekend postings, duplicates
--  Aging: 120-day, 75-day, 45-day, 15-day buckets
-- ═══════════════════════════════════════════════════════════════════

-- Fraud / anomaly source records (GL side)
INSERT INTO reconciliation_records
  (id, batch_id, profile_id, source_system, entity, account, period, currency, amount, reference, tx_date, normalized_sign, status, payload_json, created_at)
VALUES
-- AGE: 120 days ago = 2026-02-11 (90+ day bucket)
(300, 'BATCH-FRAUD-Q2', 10, 'ERP-GL', 'DRMS-CORP', '99001', '2026-02', 'USD', 50000.00, 'FRD-001', '2026-02-11', 'DEBIT', 'UNMATCHED',
 '{"desc":"Round-dollar wire unauth vendor","vendor":"SHELL-CORP-A","day_of_week":"Wednesday","risk_flags":["ROUND_DOLLAR","UNMATCHED_120D"]}', '2026-02-11 23:58:00'),
(301, 'BATCH-FRAUD-Q2', 10, 'ERP-GL', 'DRMS-CORP', '99001', '2026-02', 'USD', 25000.00, 'FRD-002', '2026-02-15', 'DEBIT', 'UNMATCHED',
 '{"desc":"Weekend wire – Saturday","vendor":"SHELL-CORP-A","day_of_week":"Saturday","risk_flags":["WEEKEND_POSTING","ROUND_DOLLAR","UNMATCHED_120D"]}', '2026-02-15 02:14:00'),
-- AGE: 75 days ago = 2026-03-28 (61-90 day bucket)
(302, 'BATCH-FRAUD-Q2', 10, 'ERP-GL', 'DRMS-CORP', '99001', '2026-03', 'USD', 100000.00,'FRD-003', '2026-03-28', 'DEBIT', 'UNMATCHED',
 '{"desc":"Round-dollar transfer unapproved BU","vendor":"ENTITY-B","day_of_week":"Saturday","risk_flags":["ROUND_DOLLAR","WEEKEND_POSTING","UNMATCHED_75D"]}', '2026-03-28 01:30:00'),
(303, 'BATCH-FRAUD-Q2', 10, 'ERP-GL', 'DRMS-CORP', '99001', '2026-03', 'USD',  75000.00,'FRD-004', '2026-03-29', 'DEBIT', 'UNMATCHED',
 '{"desc":"Duplicate PO# 90041 – second payment","po_number":"90041","risk_flags":["DUPLICATE_INVOICE","UNMATCHED_74D"]}', '2026-03-29 14:22:00'),
-- AGE: 45 days ago = 2026-04-27 (31-60 day bucket)
(304, 'BATCH-FRAUD-Q2', 10, 'ERP-GL', 'DRMS-CORP', '99001', '2026-04', 'USD',  33000.00,'FRD-005', '2026-04-27', 'DEBIT', 'UNMATCHED',
 '{"desc":"Duplicate PO# 90041 – third occurrence","po_number":"90041","risk_flags":["DUPLICATE_INVOICE","UNMATCHED_45D"]}', '2026-04-27 09:00:00'),
(305, 'BATCH-FRAUD-Q2', 10, 'ERP-GL', 'DRMS-CORP', '99001', '2026-04', 'USD',  15000.00,'FRD-006', '2026-04-26', 'DEBIT', 'UNMATCHED',
 '{"desc":"Sunday posting after hours","vendor":"UNKNOWN-7718","day_of_week":"Sunday","risk_flags":["WEEKEND_POSTING","AFTER_HOURS","UNMATCHED_46D"]}', '2026-04-26 23:55:00'),
-- AGE: 15 days ago = 2026-05-27 (0-30 day bucket)
(306, 'BATCH-FRAUD-Q2', 10, 'ERP-GL', 'DRMS-CORP', '99001', '2026-05', 'USD', 200000.00,'FRD-007', '2026-05-27', 'DEBIT', 'UNMATCHED',
 '{"desc":"Mega round-dollar wknd – unresolved","vendor":"SHELL-CORP-B","day_of_week":"Saturday","risk_flags":["ROUND_DOLLAR","WEEKEND_POSTING","LARGE_AMOUNT","UNMATCHED_15D"]}','2026-05-27 03:22:00'),
-- Clean comparison items for the same profile (to show matched rate)
(307, 'BATCH-FRAUD-Q2', 10, 'ERP-GL', 'DRMS-CORP', '99001', '2026-06', 'USD',  12450.50,'FRD-008', '2026-06-01', 'DEBIT', 'RECONCILED',
 '{"desc":"Normal vendor payment – Staples","vendor":"STAPLES-001"}', '2026-06-01 10:00:00'),
(308, 'BATCH-FRAUD-Q2', 10, 'ERP-GL', 'DRMS-CORP', '99001', '2026-06', 'USD',   8200.25,'FRD-009', '2026-06-03', 'DEBIT', 'RECONCILED',
 '{"desc":"Normal utility payment","vendor":"COMCAST-BIZ"}', '2026-06-03 11:00:00');

-- Fraud TARGET records (bank side — mismatched against the anomalies above)
INSERT INTO reconciliation_records
  (id, batch_id, profile_id, source_system, entity, account, period, currency, amount, reference, tx_date, normalized_sign, status, payload_json, created_at)
VALUES
(350, 'BATCH-FRAUD-Q2', 10, 'BANK-STMT', 'DRMS-CORP', '99001', '2026-06', 'USD',  12450.50, 'FRD-008', '2026-06-01', 'DEBIT', 'RECONCILED', '{"desc":"Staples – matched"}', '2026-06-01 12:00:00'),
(351, 'BATCH-FRAUD-Q2', 10, 'BANK-STMT', 'DRMS-CORP', '99001', '2026-06', 'USD',   8200.25, 'FRD-009', '2026-06-03', 'DEBIT', 'RECONCILED', '{"desc":"Comcast – matched"}',  '2026-06-03 12:00:00');
-- Note: FRD-001 through FRD-007 have NO bank target — intentionally unmatched for exception queue.


-- ═══════════════════════════════════════════════════════════════════
--  PROFILE 4 – INTERCOMPANY (25 items, clean + minor timing)
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO reconciliation_records
  (id, batch_id, profile_id, source_system, entity, account, period, currency, amount, reference, tx_date, normalized_sign, status, payload_json, created_at)
VALUES
(400, 'BATCH-IC-2026-06', 4, 'APAC-GL',  'DRMS-APAC', '20100', '2026-06', 'USD',  500000.00, 'IC-APAC-001', '2026-06-01', 'DEBIT',  'RECONCILED', '{"ic_pair":"APAC-EMEA","desc":"Management fee Q2","type":"MGMT_FEE"}', '2026-06-01 09:00:00'),
(401, 'BATCH-IC-2026-06', 4, 'APAC-GL',  'DRMS-APAC', '20100', '2026-06', 'USD',  125000.00, 'IC-APAC-002', '2026-06-05', 'DEBIT',  'RECONCILED', '{"ic_pair":"APAC-EMEA","desc":"Shared service charge","type":"SERVICES"}', '2026-06-05 09:00:00'),
(402, 'BATCH-IC-2026-06', 4, 'APAC-GL',  'DRMS-APAC', '20100', '2026-06', 'USD', 2200000.00, 'IC-APAC-003', '2026-06-15', 'DEBIT',  'RECONCILED', '{"ic_pair":"APAC-EMEA","desc":"Loan repayment tranche 3","type":"LOAN"}', '2026-06-15 09:00:00'),
(403, 'BATCH-IC-2026-06', 4, 'APAC-GL',  'DRMS-APAC', '20100', '2026-06', 'USD',   88000.00, 'IC-APAC-004', '2026-06-20', 'CREDIT', 'RECONCILED', '{"ic_pair":"APAC-EMEA","desc":"Dividend received","type":"DIVIDEND"}', '2026-06-20 09:00:00'),
(404, 'BATCH-IC-2026-06', 4, 'APAC-GL',  'DRMS-APAC', '20100', '2026-06', 'USD',   45500.00, 'IC-APAC-PEND','2026-06-30', 'DEBIT',  'UNMATCHED',  '{"ic_pair":"APAC-EMEA","desc":"Month-end accrual – awaiting EMEA confirm","type":"ACCRUAL","note":"TIMING_DIFF"}', '2026-06-30 09:00:00'),
-- EMEA counterparts (mirror records)
(450, 'BATCH-IC-2026-06', 4, 'EMEA-GL',  'DRMS-EMEA', '20100', '2026-06', 'USD',  500000.00, 'IC-APAC-001', '2026-06-01', 'CREDIT', 'RECONCILED', '{"ic_pair":"EMEA-APAC","desc":"Mgmt fee received"}', '2026-06-01 10:00:00'),
(451, 'BATCH-IC-2026-06', 4, 'EMEA-GL',  'DRMS-EMEA', '20100', '2026-06', 'USD',  125000.00, 'IC-APAC-002', '2026-06-05', 'CREDIT', 'RECONCILED', '{"ic_pair":"EMEA-APAC","desc":"Shared service received"}', '2026-06-05 10:00:00'),
(452, 'BATCH-IC-2026-06', 4, 'EMEA-GL',  'DRMS-EMEA', '20100', '2026-06', 'USD', 2200000.00, 'IC-APAC-003', '2026-06-15', 'CREDIT', 'RECONCILED', '{"ic_pair":"EMEA-APAC","desc":"Loan repayment received"}', '2026-06-15 10:00:00'),
(453, 'BATCH-IC-2026-06', 4, 'EMEA-GL',  'DRMS-EMEA', '20100', '2026-06', 'USD',   88000.00, 'IC-APAC-004', '2026-06-20', 'DEBIT',  'RECONCILED', '{"ic_pair":"EMEA-APAC","desc":"Dividend paid"}', '2026-06-20 10:00:00');


-- =============================================================================
-- BLOCK 8 ─ MATCH GROUPS (Linked to profiles and records above)
-- =============================================================================

DELETE FROM match_groups;

-- Profile 1 (Bank) – 10 full matches + 3 timing unmatched
INSERT INTO match_groups (id, profile_id, strategy, classification, confidence, variance_amount, reconciled, finalized, created_at) VALUES
(1,  1, 'exact',       'FULL_MATCH',   0.9990, 0.00,  1, 1, '2026-06-11 10:00:00'),
(2,  1, 'exact',       'FULL_MATCH',   0.9990, 0.00,  1, 1, '2026-06-11 10:00:00'),
(3,  1, 'exact',       'FULL_MATCH',   0.9990, 0.00,  1, 1, '2026-06-11 10:00:00'),
(4,  1, 'exact',       'FULL_MATCH',   0.9990, 0.00,  1, 1, '2026-06-11 10:00:00'),
(5,  1, 'exact',       'FULL_MATCH',   0.9990, 0.00,  1, 1, '2026-06-11 10:00:00'),
(6,  1, 'exact',       'FULL_MATCH',   0.9990, 0.00,  1, 1, '2026-06-11 10:00:00'),
(7,  1, 'exact',       'FULL_MATCH',   0.9990, 0.00,  1, 1, '2026-06-11 10:00:00'),
(8,  1, 'exact',       'FULL_MATCH',   0.9990, 0.00,  1, 1, '2026-06-11 10:00:00'),
(9,  1, 'exact',       'FULL_MATCH',   0.9990, 0.00,  1, 1, '2026-06-11 10:00:00'),
(10, 1, 'exact',       'FULL_MATCH',   0.9990, 0.00,  1, 1, '2026-06-11 10:00:00'),
-- 3 timing diffs (UNMATCHED)
(11, 1, 'unmatched',   'UNMATCHED',    0.0000, 19200.00, 0, 0, '2026-06-11 10:00:00'),
(12, 1, 'unmatched',   'UNMATCHED',    0.0000,  4750.00, 0, 0, '2026-06-11 10:00:00'),
(13, 1, 'unmatched',   'UNMATCHED',    0.0000,  2100.00, 0, 0, '2026-06-11 10:00:00'),
-- Bank-only NSF
(14, 1, 'unmatched',   'UNMATCHED',    0.0000,    35.00, 0, 0, '2026-06-11 10:00:00'),
-- Profile 9 (Investment) – 9 full matches + 1 variance
(20, 9, 'exact',       'FULL_MATCH',   0.9990,      0.00, 1, 1, '2026-06-11 10:30:00'),
(21, 9, 'exact',       'FULL_MATCH',   0.9990,      0.00, 1, 1, '2026-06-11 10:30:00'),
(22, 9, 'tolerance',   'VARIANCE_FLAGGED', 0.4820, 128450.00, 0, 0, '2026-06-11 10:30:00'),
(23, 9, 'exact',       'FULL_MATCH',   0.9990,      0.00, 1, 1, '2026-06-11 10:30:00'),
(24, 9, 'exact',       'FULL_MATCH',   0.9990,      0.00, 1, 1, '2026-06-11 10:30:00'),
(25, 9, 'exact',       'FULL_MATCH',   0.9990,      0.00, 1, 1, '2026-06-11 10:30:00'),
(26, 9, 'exact',       'FULL_MATCH',   0.9990,      0.00, 1, 1, '2026-06-11 10:30:00'),
(27, 9, 'exact',       'FULL_MATCH',   0.9990,      0.00, 1, 1, '2026-06-11 10:30:00'),
(28, 9, 'exact',       'FULL_MATCH',   0.9990,      0.00, 1, 1, '2026-06-11 10:30:00'),
(29, 9, 'exact',       'FULL_MATCH',   0.9990,      0.00, 1, 1, '2026-06-11 10:30:00'),
-- Profile 10 (Fraud) – 2 matched + 7 fraud unmatched
(30, 10,'exact',       'FULL_MATCH',   0.9990,      0.00, 1, 1, '2026-06-11 11:00:00'),
(31, 10,'exact',       'FULL_MATCH',   0.9990,      0.00, 1, 1, '2026-06-11 11:00:00'),
(32, 10,'unmatched',   'UNMATCHED',    0.0000,  50000.00, 0, 0, '2026-06-11 11:00:00'),
(33, 10,'unmatched',   'UNMATCHED',    0.0000,  25000.00, 0, 0, '2026-06-11 11:00:00'),
(34, 10,'unmatched',   'UNMATCHED',    0.0000, 100000.00, 0, 0, '2026-06-11 11:00:00'),
(35, 10,'unmatched',   'UNMATCHED',    0.0000,  75000.00, 0, 0, '2026-06-11 11:00:00'),
(36, 10,'unmatched',   'UNMATCHED',    0.0000,  33000.00, 0, 0, '2026-06-11 11:00:00'),
(37, 10,'unmatched',   'UNMATCHED',    0.0000,  15000.00, 0, 0, '2026-06-11 11:00:00'),
(38, 10,'unmatched',   'UNMATCHED',    0.0000, 200000.00, 0, 0, '2026-06-11 11:00:00'),
-- Profile 4 (IC) – 4 matched + 1 timing
(40, 4, 'exact',       'FULL_MATCH',   0.9990,      0.00, 1, 1, '2026-06-11 11:30:00'),
(41, 4, 'exact',       'FULL_MATCH',   0.9990,      0.00, 1, 1, '2026-06-11 11:30:00'),
(42, 4, 'exact',       'FULL_MATCH',   0.9990,      0.00, 1, 1, '2026-06-11 11:30:00'),
(43, 4, 'exact',       'FULL_MATCH',   0.9990,      0.00, 1, 1, '2026-06-11 11:30:00'),
(44, 4, 'unmatched',   'UNMATCHED',    0.0000,  45500.00, 0, 0, '2026-06-11 11:30:00');


-- =============================================================================
-- BLOCK 9 ─ MATCH GROUP ITEMS (Maps records → groups)
-- =============================================================================

DELETE FROM match_group_items;

-- Bank profile 1 (MGs 1-14 → records 1-13, 101-120)
INSERT INTO match_group_items (match_group_id, reconciliation_record_id) VALUES
(1,1),(1,101),(2,2),(2,102),(3,3),(3,103),(4,4),(4,104),(5,5),(5,105),
(6,6),(6,106),(7,7),(7,107),(8,8),(8,108),(9,9),(9,109),(10,10),(10,110),
(11,11),(12,12),(13,13),(14,120);
-- Investment profile 9 (MGs 20-29 → records 200-209, 250-259)
INSERT INTO match_group_items (match_group_id, reconciliation_record_id) VALUES
(20,200),(20,250),(21,201),(21,251),(22,202),(22,252),(23,203),(23,253),
(24,204),(24,254),(25,205),(25,255),(26,206),(26,256),(27,207),(27,257),
(28,208),(28,258),(29,209),(29,259);
-- Fraud profile 10 (MGs 30-38 → records 307,308,350,351,300-306)
INSERT INTO match_group_items (match_group_id, reconciliation_record_id) VALUES
(30,307),(30,350),(31,308),(31,351),
(32,300),(33,301),(34,302),(35,303),(36,304),(37,305),(38,306);
-- IC profile 4 (MGs 40-44 → records 400-404, 450-453)
INSERT INTO match_group_items (match_group_id, reconciliation_record_id) VALUES
(40,400),(40,450),(41,401),(41,451),(42,402),(42,452),(43,403),(43,453),(44,404);


-- =============================================================================
-- BLOCK 10 ─ EXCEPTION QUEUE RECORDS
-- Covers every aging bucket, classification, and status
-- =============================================================================

DELETE FROM exception_queue_records;

INSERT INTO exception_queue_records
  (id, match_group_id, queue_type, assigned_to, status, comments, classification, resolution_notes, escalated_at, resolved_at, created_at, updated_at)
VALUES
-- Bank profile 1 timing differences (0-30 day bucket)
(1,  11, 'exception', 2, 'OPEN',     'Check #4891 in transit – should clear by 2026-07-05. Timing difference only.', 'TIMING_DIFFERENCE', NULL, NULL, NULL, '2026-06-10 15:00:00', '2026-06-11 09:00:00'),
(2,  12, 'exception', 2, 'OPEN',     'ACH batch #8820 – bank processing lag. No action required.', 'TIMING_DIFFERENCE', NULL, NULL, NULL, '2026-06-09 15:00:00', '2026-06-10 10:00:00'),
(3,  13, 'exception', 2, 'OPEN',     'Wire WR-2281 pending clearance at correspondent bank.', 'TIMING_DIFFERENCE', NULL, NULL, NULL, '2026-06-08 15:00:00', '2026-06-10 10:00:00'),
-- Bank-only NSF fee
(4,  14, 'exception', 2, 'OPEN',     'NSF charge $35 – not in GL. Need GL journal entry.', 'DATA_ISSUE', NULL, NULL, NULL, '2026-06-11 10:00:00', '2026-06-11 10:00:00'),
-- Investment profile 9 – CRITICAL VARIANCE (overdue – triggers KPI flag)
(5,  22, 'exception', 2, 'OPEN',     'CRITICAL: Google Alphabet share count discrepancy. GL=4000 shares, Custodian=3205 shares. Variance=$128,450. Pending custodian confirmation.', 'VARIANCE_FLAGGED', NULL, NULL, NULL, '2026-06-11 10:30:00', '2026-06-11 14:00:00'),
-- Fraud profile 10 – all 7 fraud items (across all aging buckets)
(6,  32, 'exception', 2, 'OPEN',     'FRAUD RISK: Round-dollar $50,000 wire to unrecognized vendor SHELL-CORP-A. Posted 120 days ago. No bank counterpart.', 'POLICY_RISK', NULL, NULL, NULL, '2026-02-11 23:58:00', '2026-06-11 11:00:00'),
(7,  33, 'exception', 2, 'ESCALATED','FRAUD RISK: Weekend Saturday wire $25,000 after hours to SHELL-CORP-A. 120 days unresolved. CFO alerted.', 'POLICY_RISK', NULL, '2026-06-11 16:00:00', NULL, '2026-02-15 02:14:00', '2026-06-11 11:00:00'),
(8,  34, 'exception', 2, 'OPEN',     'FRAUD RISK: $100,000 Saturday round-dollar wire 75 days unresolved.', 'POLICY_RISK', NULL, NULL, NULL, '2026-03-28 01:30:00', '2026-06-11 11:00:00'),
(9,  35, 'exception', 2, 'OPEN',     'DUPLICATE: PO #90041 paid 3 times. This is 2nd occurrence. $75,000.', 'PROCESS_ISSUE', NULL, NULL, NULL, '2026-03-29 14:22:00', '2026-06-11 11:00:00'),
(10, 36, 'exception', 2, 'OPEN',     'DUPLICATE: PO #90041 3rd occurrence $33,000. Vendor not responding.', 'PROCESS_ISSUE', NULL, NULL, NULL, '2026-04-27 09:00:00', '2026-06-11 11:00:00'),
(11, 37, 'exception', 2, 'OPEN',     'FRAUD RISK: Sunday after-hours posting $15,000 to unknown vendor 7718.', 'POLICY_RISK', NULL, NULL, NULL, '2026-04-26 23:55:00', '2026-06-11 11:00:00'),
(12, 38, 'exception', 2, 'ESCALATED','CRITICAL: $200,000 Saturday wire to SHELL-CORP-B. 15 days unresolved. Largest single anomaly. Board notified.', 'POLICY_RISK', NULL, '2026-06-11 17:00:00', NULL, '2026-05-27 03:22:00', '2026-06-11 17:00:00'),
-- IC profile 4 – timing unmatched
(13, 44, 'exception', 2, 'OPEN',     'IC month-end accrual IC-APAC-PEND not confirmed by EMEA. $45,500. Expected confirmation by 2026-07-10.', 'TIMING_DIFFERENCE', NULL, NULL, NULL, '2026-06-30 09:00:00', '2026-06-30 09:00:00');


-- =============================================================================
-- BLOCK 11 ─ EXCEPTION COMMENTS (Realistic discussion thread)
-- =============================================================================

DELETE FROM exception_comments;

INSERT INTO exception_comments (id, exception_id, user_id, comment, created_at) VALUES
-- Thread on exception #5 (Investment variance)
(1, 5, 2, 'Reached out to State Street custodian. Ticket #SS-2026-88441 opened. ETA: 3 business days.', '2026-06-11 14:05:00'),
(2, 5, 4, 'Confirmed. Do NOT certify profile 9 until custodian responds. Risk score = HIGH. Reviewer holding.', '2026-06-11 14:20:00'),
(3, 5, 5, 'Approver note: If variance exceeds $150k, board notification required per policy §12.4b.', '2026-06-11 15:00:00'),
-- Thread on exception #7 (Fraud – escalated weekend wire)
(4, 7, 2, 'Fraud team case #FR-20260215 opened. Legal hold placed on vendor account SHELL-CORP-A.', '2026-06-11 16:05:00'),
(5, 7, 4, 'Reviewed wire transfer documentation. Authorization appears forged. Escalating to CFO.', '2026-06-11 16:30:00'),
(6, 7, 8, 'CFO sign-off: External forensic review engaged. Regulatory filing in progress.', '2026-06-11 17:00:00'),
-- Thread on exception #12 (Fraud – $200k)
(7, 12, 2, 'Wire trace submitted to Wells Fargo. Reference WF-TRC-2026-05443.', '2026-06-11 17:05:00'),
(8, 12, 8, 'Regulators contacted. This item triggers our SAR filing threshold.', '2026-06-11 17:30:00'),
-- Thread on exception #1 (Bank timing)
(9, 1,  2, 'Check #4891 confirmed in-transit by bank. Will appear in July statement.', '2026-06-11 09:05:00'),
(10,1,  4, 'Noted. Approve as timing difference. No further action until July close.', '2026-06-11 09:30:00');


-- =============================================================================
-- BLOCK 12 ─ RECONCILIATION ATTACHMENTS (Evidence Manager)
-- =============================================================================

DELETE FROM reconciliation_attachments;

INSERT INTO reconciliation_attachments
  (id, reconciliation_record_id, uploaded_by, upload_time, document_type, document_name, document_path, document_status, version, replaced_by_id)
VALUES
-- Evidence for Bank GL timing records (records 11,12,13)
(1,  11, 2, '2026-06-10 15:30:00', 'BANK_STATEMENT',    'wf_bank_statement_june_2026.pdf',      '/evidence/profile1/wf_bank_statement_june_2026.pdf',       'ACTIVE', 1, NULL),
(2,  11, 2, '2026-06-10 15:35:00', 'SUPPORTING_CALC',   'timing_diff_schedule_jun2026.xlsx',    '/evidence/profile1/timing_diff_schedule_jun2026.xlsx',     'ACTIVE', 1, NULL),
(3,  12, 2, '2026-06-10 15:40:00', 'BANK_STATEMENT',    'wf_bank_statement_june_2026.pdf',      '/evidence/profile1/wf_bank_statement_june_2026.pdf',       'ACTIVE', 1, NULL),
-- Evidence for Investment variance (record 202)
(4,  202, 2, '2026-06-11 14:10:00','CUSTODIAN_REPORT',  'statestreet_custody_q2_2026.pdf',      '/evidence/profile9/statestreet_custody_q2_2026.pdf',       'ACTIVE', 1, NULL),
(5,  202, 2, '2026-06-11 14:15:00','CORRESPONDENCE',    'ss_ticket_88441_email_thread.pdf',     '/evidence/profile9/ss_ticket_88441_email_thread.pdf',      'ACTIVE', 1, NULL),
(6,  202, 2, '2026-06-11 14:20:00','SUPPORTING_CALC',   'cusip_us38141_share_reconciliation.xlsx','/evidence/profile9/cusip_us38141_share_reconciliation.xlsx','ACTIVE', 1, NULL),
-- Evidence for Fraud items (records 300-306)
(7,  300, 2, '2026-06-11 16:10:00','WIRE_CONFIRMATION', 'wire_frd001_50k_confirmation.pdf',     '/evidence/profile10/wire_frd001_50k_confirmation.pdf',     'ACTIVE', 1, NULL),
(8,  301, 2, '2026-06-11 16:15:00','WIRE_CONFIRMATION', 'wire_frd002_25k_weekend.pdf',          '/evidence/profile10/wire_frd002_25k_weekend.pdf',          'ACTIVE', 1, NULL),
(9,  302, 2, '2026-06-11 16:20:00','FRAUD_INVESTIGATION','forensic_report_shellcorpA_draft.pdf','/evidence/profile10/forensic_report_shellcorpA_draft.pdf', 'ACTIVE', 1, NULL),
(10, 306, 2, '2026-06-11 17:10:00','FRAUD_INVESTIGATION','board_notification_200k_wire.pdf',    '/evidence/profile10/board_notification_200k_wire.pdf',     'ACTIVE', 1, NULL),
-- Payroll evidence (profile 5 – certified, linked to a payroll reconciliation record)
(11, 209, 3, '2026-06-03 16:00:00','PAYROLL_REGISTER', 'payroll_register_june_2026_final.xlsx','/evidence/profile5/payroll_register_june_2026_final.xlsx', 'ACTIVE', 1, NULL),
(12, 209, 3, '2026-06-03 16:05:00','GL_EXTRACT',       'gl_extract_payroll_gl_june2026.csv',   '/evidence/profile5/gl_extract_payroll_gl_june2026.csv',    'ACTIVE', 1, NULL);


-- =============================================================================
-- BLOCK 13 ─ EVIDENCE VERSION HISTORY
-- =============================================================================

DELETE FROM evidence_version_history;

INSERT INTO evidence_version_history (id, attachment_id, previous_version, new_version, changed_by, change_note, changed_at) VALUES
(1, 4, 1, 2, 2, 'Updated with final custodian report after initial draft was incomplete.', '2026-06-11 15:00:00'),
(2, 9, 1, 2, 4, 'Replaced draft forensic report with signed version from external auditor.', '2026-06-11 16:45:00');


-- =============================================================================
-- BLOCK 14 ─ AUDIT LOGS (Full operational sequence with hash chaining)
-- Covers: admin create → system execute → preparer flag → attach evidence → submit → reviewer comment
-- =============================================================================

DELETE FROM audit_logs;

INSERT INTO audit_logs
  (id, user_id, action_type, entity_type, entity_id, metadata_json, ip_address, previous_hash, entry_hash, timestamp)
VALUES
(1,  1, 'PROFILE_CREATED',          'profile', 1,  '{"profile_name":"WF-Operating-Account-2026-06","risk":"LOW"}',                             '10.0.1.1', NULL,                               'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', '2026-06-01 08:00:00'),
(2,  1, 'PROFILE_CREATED',          'profile', 9,  '{"profile_name":"Investment-Portfolio-2026-06","risk":"HIGH"}',                            '10.0.1.1', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3', '2026-06-01 09:20:00'),
(3,  1, 'PROFILE_CREATED',          'profile', 10, '{"profile_name":"Fraud-Risk-High-Alert-2026-06","risk":"CRITICAL"}',                       '10.0.1.1', 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3', 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', '2026-06-01 09:30:00'),
(4,  NULL,'ADVANCED_MATCHING_COMPLETED','profile',1,'{"strategy":"advanced_4phase","match_groups":14,"exceptions":4,"auto_match_rate":71.4}',  '10.0.0.1', 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', 'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5', '2026-06-11 10:00:00'),
(5,  NULL,'ADVANCED_MATCHING_COMPLETED','profile',9,'{"strategy":"advanced_4phase","match_groups":10,"exceptions":1,"auto_match_rate":90.0}',  '10.0.0.1', 'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5', 'e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6', '2026-06-11 10:30:00'),
(6,  NULL,'ADVANCED_MATCHING_COMPLETED','profile',10,'{"strategy":"advanced_4phase","match_groups":9,"exceptions":7,"auto_match_rate":22.2}', '10.0.0.1', 'e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6', 'f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1', '2026-06-11 11:00:00'),
(7,  2, 'EXCEPTION_FLAGGED',         'exception',5, '{"exception_id":5,"profile_id":9,"variance":128450,"classification":"VARIANCE_FLAGGED"}',  '10.0.2.1', 'f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1', 'a1c3e5g7i9k1m3o5q7s9u1w3y5a1c3e5g7i9k1m3o5q7s9u1w3y5a1c3e5g7i9k1', '2026-06-11 14:00:00'),
(8,  2, 'EVIDENCE_UPLOADED',         'exception',5, '{"attachment_id":4,"file":"statestreet_custody_q2_2026.pdf","doc_type":"CUSTODIAN_REPORT"}','10.0.2.1', 'a1c3e5g7i9k1m3o5q7s9u1w3y5a1c3e5g7i9k1m3o5q7s9u1w3y5a1c3e5g7i9k1', 'b2d4f6h8j0l2n4p6r8t0v2x4z6b2d4f6h8j0l2n4p6r8t0v2x4z6b2d4f6h8j0l2', '2026-06-11 14:10:00'),
(9,  2, 'EVIDENCE_UPLOADED',         'exception',5, '{"attachment_id":5,"file":"ss_ticket_88441_email_thread.pdf","doc_type":"CORRESPONDENCE"}','10.0.2.1', 'b2d4f6h8j0l2n4p6r8t0v2x4z6b2d4f6h8j0l2n4p6r8t0v2x4z6b2d4f6h8j0l2', 'c3e5g7i9k1m3o5q7s9u1w3y5c3e5g7i9k1m3o5q7s9u1w3y5c3e5g7i9k1m3o5q7', '2026-06-11 14:15:00'),
(10, 2, 'WORKFLOW_SUBMITTED',         'workflow', 9, '{"from_status":"PREPARED","to_status":"UNDER_REVIEW","note":"ALERT: $128,450 variance on Google Alphabet"}','10.0.2.1','c3e5g7i9k1m3o5q7s9u1w3y5c3e5g7i9k1m3o5q7s9u1w3y5c3e5g7i9k1m3o5q7','d4f6h8j0l2n4p6r8t0v2x4z6d4f6h8j0l2n4p6r8t0v2x4z6d4f6h8j0l2n4p6r8','2026-06-11 14:00:00'),
(11, 4, 'WORKFLOW_REVIEWED',          'workflow', 9, '{"action":"REVIEW","comment":"Hold certification. Custodian ticket open."}',              '10.0.3.1', 'd4f6h8j0l2n4p6r8t0v2x4z6d4f6h8j0l2n4p6r8t0v2x4z6d4f6h8j0l2n4p6r8', 'e5g7i9k1m3o5q7s9u1w3y5e5g7i9k1m3o5q7s9u1w3y5e5g7i9k1m3o5q7s9u1w3', '2026-06-11 14:20:00'),
(12, 2, 'FRAUD_ALERT_RAISED',         'exception',7, '{"fraud_case":"FR-20260215","vendor":"SHELL-CORP-A","amount":25000,"days_outstanding":120}','10.0.2.1','e5g7i9k1m3o5q7s9u1w3y5e5g7i9k1m3o5q7s9u1w3y5e5g7i9k1m3o5q7s9u1w3','f6h8j0l2n4p6r8t0v2x4z6f6h8j0l2n4p6r8t0v2x4z6f6h8j0l2n4p6r8t0v2x4','2026-06-11 16:05:00'),
(13, 4, 'EXCEPTION_ESCALATED',        'exception',7, '{"action":"ESCALATE","to_user_id":8,"reason":"Suspected fraud – forged authorization"}',  '10.0.3.1', 'f6h8j0l2n4p6r8t0v2x4z6f6h8j0l2n4p6r8t0v2x4z6f6h8j0l2n4p6r8t0v2x4', 'a2b4c6d8e0f2a2b4c6d8e0f2a2b4c6d8e0f2a2b4c6d8e0f2a2b4c6d8e0f2a2b4', '2026-06-11 16:30:00'),
(14, 8, 'CFO_NOTIFICATION',           'exception',7, '{"role":"CFO","action":"NOTED","comment":"External forensic engaged. SAR filing in progress."}','10.0.5.1','a2b4c6d8e0f2a2b4c6d8e0f2a2b4c6d8e0f2a2b4c6d8e0f2a2b4c6d8e0f2a2b4','b3c5d7e9f1b3c5d7e9f1b3c5d7e9f1b3c5d7e9f1b3c5d7e9f1b3c5d7e9f1b3c5','2026-06-11 17:00:00'),
(15, 3, 'PROFILE_CERTIFIED',          'workflow', 5, '{"profile_id":5,"profile_name":"Payroll-Register-2026-06","certified_by":"CFO Margaret Wu"}','10.0.4.1','b3c5d7e9f1b3c5d7e9f1b3c5d7e9f1b3c5d7e9f1b3c5d7e9f1b3c5d7e9f1b3c5','c4d6e8f0c4d6e8f0c4d6e8f0c4d6e8f0c4d6e8f0c4d6e8f0c4d6e8f0c4d6e8f0','2026-06-05 16:00:00'),
(16, 1, 'RISK_SCORE_CALCULATED',      'profile', 10,'{"risk_score":91.7,"classification":"CRITICAL","factors":{"unmatched_rate":77.8,"open_exceptions":7}}','10.0.0.1','c4d6e8f0c4d6e8f0c4d6e8f0c4d6e8f0c4d6e8f0c4d6e8f0c4d6e8f0c4d6e8f0','d5e7f9d5e7f9d5e7f9d5e7f9d5e7f9d5e7f9d5e7f9d5e7f9d5e7f9d5e7f9d5e7','2026-06-11 11:05:00');


-- =============================================================================
-- BLOCK 15 ─ JOURNAL ADJUSTMENTS (Preparer-created entries for exceptions)
-- =============================================================================

DELETE FROM journal_adjustments;

INSERT INTO journal_adjustments
  (id, profile_id, period_key, account, currency, amount, functional_currency, reporting_currency, converted_amount, reason, status, created_by, approved_by, erp_posting_reference, created_at, updated_at)
VALUES
-- Bank NSF fee – needs GL journal entry
(1, 1, '2026-06', '62400-BK-FEES', 'USD', 35.00, 'USD', 'USD', 35.00, 'NSF bank charge not in GL. Post to bank charges expense.', 'SUBMITTED', 2, NULL, NULL, '2026-06-11 10:30:00', '2026-06-11 10:30:00'),
-- Investment variance – pending approver
(2, 9, '2026-06', '17000-INV-EQ', 'USD', -128450.00, 'USD', 'USD', -128450.00, 'Google Alphabet share count variance pending custodian resolution. Provisional write-down.', 'DRAFT', 2, NULL, NULL, '2026-06-11 14:30:00', '2026-06-11 14:30:00'),
-- Fraud write-off (submitted for CFO approval)
(3, 10,'2026-05', '69900-FRAUD-LOSS','USD', 200000.00, 'USD', 'USD', 200000.00, 'Provisional loss reserve for $200K weekend wire pending investigation. SAR filed.', 'SUBMITTED', 2, NULL, NULL, '2026-06-11 17:15:00', '2026-06-11 17:15:00'),
-- IC accrual reversal (approved – posted to ERP)
(4, 4, '2026-06', '20100-IC-PAYABLE','USD', 45500.00, 'USD', 'USD', 45500.00, 'IC month-end accrual for APAC-EMEA pending confirmation. Reversal to post in July.', 'APPROVED', 2, 5, 'ERP-JNL-2026-06-0441', '2026-06-30 09:30:00', '2026-06-30 09:30:00');


-- =============================================================================
-- BLOCK 16 ─ RECONCILIATION RULE DEFINITIONS
-- =============================================================================

DELETE FROM reconciliation_rule_definitions;

INSERT INTO reconciliation_rule_definitions
  (id, name, template_type, profile_id, is_reusable, conditions_json, filters_json, thresholds_json, created_by, created_at)
VALUES
(1, 'Bank Exact Reference Match',    'BANK',         NULL, 1, '{"match_fields":["reference","amount"],"operator":"AND"}', '{"exclude_internal":true}', '{"tolerance":0.01}', 1, '2026-04-01 08:00:00'),
(2, 'Bank Tolerance $50',            'BANK',         NULL, 1, '{"match_fields":["reference"],"operator":"AND"}', '{}', '{"amount_tolerance":50.00,"type":"absolute"}', 1, '2026-04-01 08:00:00'),
(3, 'AR Invoice Exact',              'AR',           NULL, 1, '{"match_fields":["invoice_number","amount"],"operator":"AND"}', '{}', '{"tolerance":0.01}', 1, '2026-04-01 08:00:00'),
(4, 'AP Fuzzy Vendor Name',          'AP',           NULL, 1, '{"match_fields":["vendor_name","invoice_number"],"operator":"AND"}', '{}', '{"fuzzy_threshold":0.85}', 1, '2026-04-01 08:00:00'),
(5, 'IC Entity Pair Exact',          'INTERCOMPANY', 4,   0, '{"match_fields":["ic_ref","entity_pair","amount"],"operator":"AND"}', '{"entities":["DRMS-APAC","DRMS-EMEA"]}', '{"tolerance":0.01}', 1, '2026-04-01 08:00:00'),
(6, 'Fraud Zero-Tolerance',          'FRAUD',        10,  0, '{"match_fields":["reference","amount","entity"],"operator":"AND"}', '{"flag_round_dollar":true,"flag_weekend":true}', '{"tolerance":0.00}', 1, '2026-04-01 08:30:00'),
(7, 'Investment CUSIP Exact',        'INVESTMENT',   9,   0, '{"match_fields":["cusip","amount"],"operator":"AND"}', '{}', '{"tolerance":1000.00}', 1, '2026-04-01 08:20:00'),
(8, 'Payroll Employee ID Exact',     'PAYROLL',      5,   0, '{"match_fields":["employee_id","period","amount"],"operator":"AND"}', '{}', '{"tolerance":0.01}', 1, '2026-04-01 07:40:00');


-- =============================================================================
-- BLOCK 17 ─ RISK SCORING ENGINE RESULTS (Pre-persisted for dashboard widgets)
-- Scores match the engine weights in risk_scoring_engine.py
-- =============================================================================
-- These are stored directly on reconciliation_profiles (already set in Block 3)
-- The following updates ensure the scored_at timestamp triggers the "fresh" fast-path:

UPDATE reconciliation_profiles SET risk_score=12.5,  risk_classification='LOW',      risk_scored_at='2026-06-11 17:00:00' WHERE id=1;
UPDATE reconciliation_profiles SET risk_score=8.0,   risk_classification='LOW',      risk_scored_at='2026-06-11 17:00:00' WHERE id=2;
UPDATE reconciliation_profiles SET risk_score=6.5,   risk_classification='LOW',      risk_scored_at='2026-06-11 17:00:00' WHERE id=3;
UPDATE reconciliation_profiles SET risk_score=34.2,  risk_classification='MEDIUM',   risk_scored_at='2026-06-11 17:00:00' WHERE id=4;
UPDATE reconciliation_profiles SET risk_score=5.0,   risk_classification='LOW',      risk_scored_at='2026-06-11 17:00:00' WHERE id=5;
UPDATE reconciliation_profiles SET risk_score=28.0,  risk_classification='MEDIUM',   risk_scored_at='2026-06-11 17:00:00' WHERE id=6;
UPDATE reconciliation_profiles SET risk_score=47.8,  risk_classification='MEDIUM',   risk_scored_at='2026-06-11 17:00:00' WHERE id=7;
UPDATE reconciliation_profiles SET risk_score=42.1,  risk_classification='MEDIUM',   risk_scored_at='2026-06-11 17:00:00' WHERE id=8;
UPDATE reconciliation_profiles SET risk_score=78.4,  risk_classification='HIGH',     risk_scored_at='2026-06-11 17:00:00' WHERE id=9;
UPDATE reconciliation_profiles SET risk_score=91.7,  risk_classification='CRITICAL', risk_scored_at='2026-06-11 17:00:00' WHERE id=10;


-- =============================================================================
-- BLOCK 18 ─ UI NOTIFICATIONS (Populates Notification Center for every role)
-- =============================================================================

DELETE FROM ui_notifications;

INSERT INTO ui_notifications
  (id, user_id, notification_type, title, message, icon_type, is_read, action_url, action_label, metadata_json, created_at)
VALUES
-- CFO (user 8) notifications
(1,  8, 'alert',    'CRITICAL Risk: Fraud Profile',      'Profile "Fraud-Risk-High-Alert" has reached CRITICAL risk score 91.7. 7 unresolved exceptions including $200K weekend wire.',  'error',   0, '/risk-dashboard', 'View Risk Dashboard', '{"profile_id":10,"risk_score":91.7}', '2026-06-11 17:00:00'),
(2,  8, 'alert',    'HIGH Risk: Investment Portfolio',    'Investment Portfolio has $128,450 unexplained variance on CUSIP US38141GXZ77. Custodian ticket open.',                          'warning', 0, '/preparer/9',     'Open Profile',        '{"profile_id":9,"variance":128450}',  '2026-06-11 14:00:00'),
(3,  8, 'workflow', 'Payroll Reconciliation Certified',   'June 2026 payroll fully reconciled and certified. All 320 employee records matched.',                                           'success', 1, '/preparer/5',     'View Certified',      '{"profile_id":5}',                    '2026-06-05 16:00:00'),
-- Preparer Alice (user 2) notifications
(4,  2, 'exception','New Exception Assigned: Bank Recon', '3 timing differences flagged in WF-Operating-Account-2026-06. Total outstanding: $26,050.',                                    'warning', 0, '/preparer/1',     'Review Exceptions',   '{"profile_id":1,"count":3}',          '2026-06-11 10:00:00'),
(5,  2, 'exception','ESCALATION: Fraud Exception #7',     'Exception FRD-002 weekend wire $25,000 escalated to CFO. Your action is required for documentation.',                          'error',   0, '/exception/7',    'View Exception',      '{"exception_id":7}',                  '2026-06-11 16:30:00'),
(6,  2, 'workflow', 'Workflow Submitted: Investment',     'Your submission for Investment-Portfolio-2026-06 is now UNDER_REVIEW by Diana Ross.',                                           'info',    1, '/preparer/9',     'Track Progress',      '{"profile_id":9}',                    '2026-06-11 14:00:00'),
-- Approver James (user 4) notifications
(9,  4, 'workflow', 'Review Required: AP Profile',       'AP-Vendor-Invoices-2026-06 submitted by Bob Kumar. Review for duplicate invoices INV-4421/4422 needed.',                    'warning', 0, '/work-queue',     'Open Work Queue',    '{"profile_id":3,"workflow_id":3}',    '2026-06-11 09:45:00'),
(10, 4, 'workflow', 'Approval Required: Investment',     'Investment-Portfolio-2026-06 submitted by Alice Chen. $128,450 variance flagged. Your approval needed.',                     'warning', 0, '/work-queue',     'Open Work Queue',    '{"profile_id":9,"workflow_id":9}',    '2026-06-11 14:00:00'),
(11, 4, 'alert',    'Journal Entry Requires Approval',   'Preparer submitted journal entry JNL-DRAFT-2 for $128,450 investment write-down. Pending your approval.',                       'info',    0, '/journals',       'Review Journal',      '{"adjustment_id":2}',                 '2026-06-11 14:35:00'),
-- Certifier Margaret (user 5) notifications
(12, 5, 'alert',    'Close Period: Payroll Approved',    'June 2026 Payroll reconciliation reviewed and approved. Ready for certification.',                                              'success', 0, '/close-certification', 'Certify',          '{"profile_id":5}',                    '2026-06-04 11:00:00');


-- =============================================================================
-- BLOCK 19 ─ CLOSE TASKS (Financial Close Checklist)
-- =============================================================================

DELETE FROM close_tasks;

INSERT INTO close_tasks
  (id, calendar_id, profile_id, task_name, task_type, description, assigned_to, due_date, status, completion_pct, depends_on_task_id, sort_order, notes, created_at)
VALUES
(1,  1, 1,  'Upload June bank statement',                  'BANK_RECON',   'Import WF statement to DRMS', 2, '2026-07-02', 'COMPLETE',     100.0, NULL, 1, NULL, '2026-06-01 08:00:00'),
(2,  1, 1,  'Run automated matching engine – Bank',        'BANK_RECON',   'Execute 4-phase match',       2, '2026-07-02', 'COMPLETE',     100.0, 1,    2, NULL, '2026-06-01 08:00:00'),
(3,  1, 1,  'Resolve 3 timing differences',                'BANK_RECON',   'Check/ACH in-transit items',  2, '2026-07-05', 'IN_PROGRESS',   60.0, 2,    3, NULL, '2026-06-01 08:00:00'),
(4,  1, 1,  'Post NSF journal entry',                      'BANK_RECON',   'GL entry for $35 NSF fee',    2, '2026-07-05', 'IN_PROGRESS',    0.0, 3,    4, NULL, '2026-06-01 08:00:00'),
(5,  2, 2,  'Upload AR aging report',                      'AR_RECON',     'Subledger AR extract',        2, '2026-07-02', 'COMPLETE',     100.0, NULL, 1, NULL, '2026-06-01 08:10:00'),
(6,  2, 2,  'Match AR subledger to GL',                    'AR_RECON',     'Automated matching',          2, '2026-07-03', 'COMPLETE',     100.0, 5,    2, NULL, '2026-06-01 08:10:00'),
(7,  3, 3,  'Upload vendor invoices',                      'AP_RECON',     'AP subledger import',         3, '2026-07-02', 'COMPLETE',     100.0, NULL, 1, NULL, '2026-06-01 08:20:00'),
(8,  3, 3,  'Investigate duplicate POs INV-4421/4422',     'AP_RECON',     'Duplicate invoice review',   3, '2026-07-05', 'IN_PROGRESS',   40.0, 7,    2, 'Escalated to approver', '2026-06-01 08:20:00'),
(9,  5, 5,  'Upload payroll register',                     'PAYROLL',      'HR payroll extract',          3, '2026-07-01', 'COMPLETE',     100.0, NULL, 1, NULL, '2026-06-01 08:40:00'),
(10, 5, 5,  'Match payroll disbursements',                 'PAYROLL',      'GL vs register match',        3, '2026-07-02', 'COMPLETE',     100.0, 9,    2, NULL, '2026-06-01 08:40:00'),
(11, 5, 5,  'Certify payroll reconciliation',              'PAYROLL',      'CFO final sign-off',          8, '2026-07-03', 'COMPLETE',     100.0, 10,   3, 'Certified by CFO', '2026-06-01 08:40:00'),
(12, 9, 9,  'Receive custodian statement',                 'INVESTMENT',   'State Street Q2 report',      2, '2026-07-01', 'COMPLETE',     100.0, NULL, 1, NULL, '2026-06-01 09:20:00'),
(13, 9, 9,  'Match CUSIP positions to GL',                 'INVESTMENT',   'Automated CUSIP matching',   2, '2026-07-02', 'COMPLETE',     100.0, 12,   2, NULL, '2026-06-01 09:20:00'),
(14, 9, 9,  'Resolve CUSIP US38141GXZ77 variance',         'INVESTMENT',   'Investigate $128,450 delta', 2, '2026-07-05', 'IN_PROGRESS',   20.0, 13,   3, 'Custodian ticket SS-2026-88441 open', '2026-06-01 09:20:00'),
(15, 10,10, 'Run fraud anomaly scan',                      'CUSTOM',       'Automated fraud pattern scan',2, '2026-07-01', 'COMPLETE',     100.0, NULL, 1, NULL, '2026-06-01 09:30:00'),
(16, 10,10, 'Investigate 7 flagged transactions',          'CUSTOM',       'Manual fraud review',         2, '2026-07-01', 'IN_PROGRESS',   30.0, 15,   2, 'Legal hold placed on SHELL-CORP-A', '2026-06-01 09:30:00'),
(17, 10,10, 'File SAR for $200K weekend wire',             'CUSTOM',       'Regulatory filing',           4, '2026-07-01', 'NOT_STARTED',    0.0, 16,   3, 'BLOCKED pending CFO approval', '2026-06-01 09:30:00');


-- =============================================================================
-- BLOCK 20 ─ REMINDER LOGS (Escalation and due-date reminders)
-- =============================================================================

DELETE FROM reminder_logs;

INSERT INTO reminder_logs (id, workflow_id, reminder_type, severity, message, sent_to_role, sent_at) VALUES
(1, 9,  'OVERDUE',    'HIGH',   'Investment-Portfolio-2026-06 is OVERDUE. Variance $128,450 unresolved. Due: 2026-07-05. Immediate action required.', 'APPROVER', '2026-06-11 09:00:00'),
(2, 10, 'ESCALATION', 'HIGH',   'Fraud-Risk-High-Alert-2026-06: 7 exceptions remain OPEN. CRITICAL risk score 91.7. Board notification triggered.', 'CERTIFIER', '2026-06-11 17:00:00'),
(3, 7,  'DUE_SOON',   'MEDIUM', 'Fixed-Assets-Register-2026-06 due in 4 days. FA schedule variance $3,450 under review. Submit before 2026-07-07.', 'REVIEWER',  '2026-06-11 08:00:00'),
(4, 8,  'DUE_SOON',   'LOW',    'Prepaid-Accruals-2026-06 due in 5 days. 4 accruals pending reversal confirmation.',                                 'PREPARER',  '2026-06-11 08:00:00'),
(5, 4,  'DUE_SOON',   'MEDIUM', 'IC-APAC-EMEA-Elimination-2026-06 due in 6 days. EMEA confirmation pending for $45,500 accrual.',                   'PREPARER',  '2026-06-11 08:00:00');


-- =============================================================================
-- BLOCK 21 ─ EXCHANGE RATES (FX rate table)
-- =============================================================================

DELETE FROM exchange_rates;

INSERT INTO exchange_rates (id, from_currency, to_currency, rate, rate_date, source, created_at) VALUES
(1,  'EUR', 'USD', 1.0842, '2026-06-30', 'ECB', '2026-06-30 18:00:00'),
(2,  'GBP', 'USD', 1.2714, '2026-06-30', 'ECB', '2026-06-30 18:00:00'),
(3,  'JPY', 'USD', 0.00638,'2026-06-30', 'ECB', '2026-06-30 18:00:00'),
(4,  'CHF', 'USD', 1.1129, '2026-06-30', 'ECB', '2026-06-30 18:00:00'),
(5,  'CAD', 'USD', 0.7348, '2026-06-30', 'ECB', '2026-06-30 18:00:00'),
(6,  'SGD', 'USD', 0.7412, '2026-06-30', 'ECB', '2026-06-30 18:00:00'),
(7,  'AUD', 'USD', 0.6531, '2026-06-30', 'ECB', '2026-06-30 18:00:00'),
(8,  'EUR', 'USD', 1.0800, '2026-06-01', 'ECB', '2026-06-01 18:00:00'),
(9,  'GBP', 'USD', 1.2680, '2026-06-01', 'ECB', '2026-06-01 18:00:00'),
(10, 'JPY', 'USD', 0.00641,'2026-06-01', 'ECB', '2026-06-01 18:00:00');


-- =============================================================================
-- BLOCK 22 ─ RECONCILIATION OWNERSHIP (Profile access control table)
-- =============================================================================

DELETE FROM reconciliation_ownership;

INSERT INTO reconciliation_ownership (id, profile_id, owner_user_id, owner_role, created_at) VALUES
-- Profile 1 (Bank)
(1,  1, 2, 'PREPARER',  '2026-06-01 08:00:00'),
(2,  1, 4, 'REVIEWER',  '2026-06-01 08:00:00'),
(3,  1, 5, 'APPROVER',  '2026-06-01 08:00:00'),
(4,  1, 8, 'CERTIFIER', '2026-06-01 08:00:00'),
-- Profile 9 (Investment)
(5,  9, 2, 'PREPARER',  '2026-06-01 09:20:00'),
(6,  9, 4, 'REVIEWER',  '2026-06-01 09:20:00'),
(7,  9, 5, 'APPROVER',  '2026-06-01 09:20:00'),
(8,  9, 8, 'CERTIFIER', '2026-06-01 09:20:00'),
-- Profile 10 (Fraud)
(9,  10,2, 'PREPARER',  '2026-06-01 09:30:00'),
(10, 10,4, 'REVIEWER',  '2026-06-01 09:30:00'),
(11, 10,5, 'APPROVER',  '2026-06-01 09:30:00'),
(12, 10,8, 'CERTIFIER', '2026-06-01 09:30:00'),
-- Profile 5 (Payroll – certified)
(13, 5, 3, 'PREPARER',  '2026-06-01 08:40:00'),
(14, 5, 6, 'REVIEWER',  '2026-06-01 08:40:00'),
(15, 5, 5, 'APPROVER',  '2026-06-01 08:40:00'),
(16, 5, 8, 'CERTIFIER', '2026-06-01 08:40:00');


-- =============================================================================
-- BLOCK 23 ─ RECONCILIATION SNAPSHOTS (Point-in-time archive for June close)
-- =============================================================================

DELETE FROM reconciliation_snapshots;

INSERT INTO reconciliation_snapshots (id, profile_id, period_key, snapshot_name, snapshot_json, created_by, created_at) VALUES
(1, 5, '2026-06', 'Payroll June 2026 – Certified Snapshot',
 '{"status":"CERTIFIED","matched_rate":100.0,"total_records":640,"variance":0.00,"certified_by":"cfo.margaret","certified_at":"2026-06-05T16:00:00"}',
 8, '2026-06-05 16:01:00'),
(2, 1, '2026-06', 'Bank Recon June 2026 – Pre-Submission Snapshot',
 '{"status":"IN_PROGRESS","matched_rate":71.4,"total_records":24,"timing_diffs":3,"open_exceptions":4,"snapshot_note":"Taken before preparer submission"}',
 2, '2026-06-10 14:00:00');


-- =============================================================================
-- BLOCK 24 ─ ENTERPRISE SETTINGS (Platform configuration)
-- =============================================================================

DELETE FROM enterprise_settings;

INSERT INTO enterprise_settings (id, category, `key`, value_json, description, updated_by, updated_at) VALUES
(1,  'RISK',       'materiality_ceiling',     '{"value":500000,"currency":"USD"}',       'Global variance materiality ceiling for risk scoring', 1, '2026-04-01 07:00:00'),
(2,  'RISK',       'critical_threshold',      '{"value":75}',                            'Risk score above which profile is CRITICAL',           1, '2026-04-01 07:00:00'),
(3,  'RISK',       'high_threshold',          '{"value":50}',                            'Risk score above which profile is HIGH',                1, '2026-04-01 07:00:00'),
(4,  'WORKFLOW',   'sod_enforcement',         '{"enabled":true}',                        'Enforce Segregation of Duties globally',                1, '2026-04-01 07:00:00'),
(5,  'MATCHING',   'auto_approve_threshold',  '{"value":0.98}',                          'Global auto-approval confidence threshold',             1, '2026-04-01 07:00:00'),
(6,  'COMPLIANCE', 'sox_mode',                '{"enabled":true,"framework":"SOX-302"}',  'Enable SOX 302/404 compliance mode',                   1, '2026-04-01 07:00:00'),
(7,  'COMPLIANCE', 'audit_hash_chaining',     '{"enabled":true}',                        'Enable tamper-evident hash chaining on audit logs',    1, '2026-04-01 07:00:00'),
(8,  'NOTIFICATION','fraud_alert_emails',     '{"recipients":["cfo.margaret@drms.internal","audit.thomas@drms.internal"]}','Fraud alert email recipients', 1, '2026-04-01 07:00:00'),
(9,  'RETENTION',  'audit_log_days',          '{"value":2555}',                          'Retain audit logs for 7 years (SOX requirement)',      1, '2026-04-01 07:00:00'),
(10, 'MATCHING',   'cross_period_days',       '{"value":90}',                            'Cross-period matching lookback in days',                1, '2026-04-01 07:00:00');


-- =============================================================================
-- BLOCK 25 ─ RECONCILIATION RETENTION POLICIES
-- =============================================================================

DELETE FROM reconciliation_retention_policies;

INSERT INTO reconciliation_retention_policies (id, name, retention_days, purge_after_days, preserve_for_compliance, active, created_by, created_at) VALUES
(1, 'SOX Standard – 7 Year',    2555, 3650, 1, 1, 1, '2026-01-01 08:00:00'),
(2, 'High Risk – 10 Year',      3650, 4380, 1, 1, 1, '2026-01-01 08:00:00'),
(3, 'Operational – 3 Year',     1095, 1460, 0, 1, 1, '2026-01-01 08:00:00');


-- =============================================================================
-- BLOCK 26 ─ RECONCILIATION DEPENDENCIES (Profile close-order dependencies)
-- =============================================================================

DELETE FROM reconciliation_dependencies;

INSERT INTO reconciliation_dependencies
  (id, parent_profile_id, child_profile_id, dependency_type, is_blocking, status, created_by, created_at)
VALUES
-- Bank must be certified before Investment can close
(1, 1, 9,  'close_process', 1, 'OPEN', 1, '2026-04-01 08:00:00'),
-- Payroll must be certified before AP can close
(2, 5, 3,  'close_process', 1, 'CLOSED', 1, '2026-04-01 08:00:00'),
-- IC elimination depends on both APAC and EMEA books (self-referential: AR → IC)
(3, 2, 4,  'close_process', 0, 'OPEN', 1, '2026-04-01 08:00:00');


-- =============================================================================
-- BLOCK 27 ─ JOB METRICS (Scheduler monitoring dashboard)
-- =============================================================================

DELETE FROM job_metrics;

INSERT INTO job_metrics (id, job_name, status, duration_ms, message, executed_at) VALUES
(1,  'nightly_risk_score_all',         'SUCCESS', 2340,  'Scored 10 profiles. CRITICAL: 1, HIGH: 1, MEDIUM: 4, LOW: 4.',          '2026-06-11 00:05:00'),
(2,  'advanced_matching_profile_1',    'SUCCESS', 890,   'Profile 1 matched 14 groups. 4 exceptions. Auto-match rate: 71.4%.',    '2026-06-11 10:00:00'),
(3,  'advanced_matching_profile_9',    'SUCCESS', 1240,  'Profile 9 matched 10 groups. 1 CRITICAL exception. Rate: 90.0%.',       '2026-06-11 10:30:00'),
(4,  'advanced_matching_profile_10',   'SUCCESS', 560,   'Profile 10 matched 9 groups. 7 FRAUD exceptions. Rate: 22.2%.',         '2026-06-11 11:00:00'),
(5,  'fraud_anomaly_scan_daily',       'SUCCESS', 3200,  'Scanned 9 transactions. 7 anomalies flagged. Alerts sent to CFO.',      '2026-06-11 06:00:00'),
(6,  'certification_reminder_job',     'SUCCESS', 145,   '5 reminders sent. 2 overdue profiles. 3 due-soon profiles.',            '2026-06-11 08:00:00'),
(7,  'nightly_risk_score_all',         'SUCCESS', 2100,  'Scored 10 profiles. No change from prior run.',                         '2026-06-10 00:05:00'),
(8,  'scheduled_report_executive',     'FAILED',  0,     'SMTP connection timeout. Report not sent to distribution list.',         '2026-06-10 07:00:00'),
(9,  'nightly_risk_score_all',         'SUCCESS', 2290,  'Scored 10 profiles. Profile 10 risk increased from 85.0 to 91.7.',      '2026-06-09 00:05:00'),
(10, 'ic_cross_entity_matching',       'SUCCESS', 4100,  'IC profile 4 matched 4/5 pairs. 1 timing diff pending EMEA.',           '2026-06-11 10:00:00');


-- =============================================================================
-- FINAL: Re-enable FK checks
-- =============================================================================

PRAGMA foreign_keys = ON;   -- SQLite
-- SET FOREIGN_KEY_CHECKS = 1;  -- MySQL (uncomment for MySQL)

-- =============================================================================
-- SUMMARY OF DATA LOADED
-- =============================================================================
-- Block  1: 8   users (all roles populated)
-- Block  2: 10  projects
-- Block  3: 10  reconciliation profiles (6 clean, 2 minor var, 2 critical var)
-- Block  4: 10  financial close calendars
-- Block  5: 10  certification workflows (every stage represented)
-- Block  6: 16  certification workflow history records
-- Block  7: ~80 reconciliation records (Bank, Investment, Fraud, IC)
-- Block  8: 38  match groups (Full / Partial / Unmatched / Variance_Flagged)
-- Block  9: ~50 match group items
-- Block 10: 13  exception queue records (all aging buckets, all classifications)
-- Block 11: 10  exception comments (realistic discussion threads)
-- Block 12: 12  reconciliation attachments (Evidence Manager)
-- Block 13: 2   evidence version history entries
-- Block 14: 16  audit log entries (hash-chained operational sequence)
-- Block 15: 4   journal adjustments (every status)
-- Block 16: 8   reconciliation rule definitions
-- Block 17: 10  risk score updates
-- Block 18: 12  UI notifications (every role has active notifications)
-- Block 19: 17  close tasks
-- Block 20: 5   reminder logs
-- Block 21: 10  exchange rates
-- Block 22: 16  reconciliation ownership records
-- Block 23: 2   reconciliation snapshots
-- Block 24: 10  enterprise settings
-- Block 25: 3   retention policies
-- Block 26: 3   profile dependencies
-- Block 27: 10  job metrics
-- =============================================================================
