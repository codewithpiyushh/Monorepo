# Demo Data Pack

## Files
- datasets/source_dataset_demo.csv
- datasets/target_dataset_demo.csv
- api_payloads/mapping_payload.json
- api_payloads/rule_exact_payload.json
- api_payloads/rule_tolerance_payload.json
- evidences/Invoice_Evidence_INV-1003.pdf
- evidences/Invoice_Evidence_ADJ-3001.pdf

## Suggested Demo Flow
1. Create a new project.
2. Upload `source_dataset_demo.csv` as source and `target_dataset_demo.csv` as target.
3. Save mappings using `mapping_payload.json`.
4. Create rules using `rule_exact_payload.json` and `rule_tolerance_payload.json`.
5. Run execution.
6. In Preparer workspace, submit with proof comment, e.g. `proof: Invoice_Evidence_INV-1003.pdf`.
7. Upload evidence PDFs for record IDs tied to unmatched/partial references.
8. Reviewer approves in Reviewer workspace.

## Expected Outcome
- Exact matches: INV-1001, PAY-2001
- Tolerance/partial behavior around INV-1002 and ADJ-3001
- Unmatched examples: INV-1003 (source-only), INV-9999/MISC-5001 (target-only)
