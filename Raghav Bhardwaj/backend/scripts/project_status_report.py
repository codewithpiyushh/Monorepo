"""Print a quick local status report for the DRMS repo."""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]

KEY_PATHS = [
    ROOT / "PROJECT_STATUS.md",
    ROOT / "PROJECT_GUIDE.md",
    ROOT / "backend" / "app" / "services" / "variance_service.py",
    ROOT / "backend" / "app" / "routes" / "variance.py",
    ROOT / "frontend" / "src" / "pages" / "VarianceAnalyticsDashboard.jsx",
    ROOT / "frontend" / "src" / "components" / "balance" / "RootCauseNarrativeBlock.jsx",
]


def main() -> int:
    print("DRMS project status report")
    print("=" * 28)
    for path in KEY_PATHS:
        state = "OK" if path.exists() else "MISSING"
        print(f"{state:7} {path.relative_to(ROOT)}")
    print()
    status_doc = ROOT / "PROJECT_STATUS.md"
    if status_doc.exists():
        print(status_doc.read_text(encoding="utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
