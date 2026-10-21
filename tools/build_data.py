#!/usr/bin/env python3
"""
Builds the dashboard data files from the source folder.

    source/store_details.xlsx          -> data/stores.js
    source/<YYYY-MM>/summary.csv       -> data/reports/<YYYY-MM>.js
    source/<YYYY-MM>/observations.csv  -/
                                        -> data/months.js (list of months)

Run from the repo root:   python tools/build_data.py
Needs: pip install pandas openpyxl
"""
import json, re, sys
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / "source", ROOT / "data"


def clean(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    s = str(v).strip()
    return s[:-2] if re.fullmatch(r"-?\d+\.0", s) else s


def num(v):
    try:
        return float(clean(v)) if "." in clean(v) else int(clean(v))
    except ValueError:
        return None


def write_js(path, var, key, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if key is None:
        path.write_text(f"window.{var}={body};\n", encoding="utf-8")
    else:
        path.write_text(f"window.{var}=window.{var}||{{}};window.{var}[{json.dumps(key)}]={body};\n", encoding="utf-8")


def build_stores():
    df = pd.read_excel(SRC / "store_details.xlsx", dtype=str)
    df.columns = [c.strip().lower() for c in df.columns]
    col = lambda *names: next((c for c in df.columns if c in names), None)
    m = {"code": col("store code"), "erp": col("store erp name"), "name": col("store name"),
         "region": col("region"), "city": col("city"), "tier": col("tier"), "state": col("state"),
         "format": col("format"), "type": col("type"), "email": col("email id", "email")}
    stores = []
    for _, r in df.iterrows():
        s = {k: clean(r[v]) if v else "" for k, v in m.items()}
        if s["code"]:
            s["code"] = s["code"].upper()
            s["email"] = s["email"].lower()
            stores.append(s)
    write_js(OUT / "stores.js", "KM_STORES", None, stores)
    return {s["code"] for s in stores}


AUDIT = {"ppt": "ppt", "vc": "vc", "video": "vc", "cctv": "cctv"}


def audit_key(v):
    t = clean(v).lower()
    for k, a in AUDIT.items():
        if t.startswith(k):
            return a
    return "other"


def build_month(folder, known):
    month = folder.name
    summ = pd.read_csv(folder / "summary.csv", dtype=str).fillna("")
    obs = pd.read_csv(folder / "observations.csv", dtype=str).fillna("")
    summ.columns = [c.strip() for c in summ.columns]
    obs.columns = [c.strip() for c in obs.columns]
    reports = {}
    for _, r in summ.iterrows():
        code = clean(r["Store Code"]).upper()
        if not code:
            continue
        if code not in known:
            print(f"  ! {month}: {code} is not in store_details.xlsx", file=sys.stderr)
        reports[code] = {
            "km": num(r.get("Kano Model Score")), "ccl": num(r.get("CCL Score")),
            "deducted": num(r.get("Points Deducted")), "sent": clean(r.get("Report Sent On")),
            "vc": {"link": clean(r.get("VC Details"))},
            "cctv": {"date": clean(r.get("CCTV Date")), "start": clean(r.get("CCTV Start Time")),
                     "end": clean(r.get("CCTV End Time")), "duration": clean(r.get("CCTV Total Duration")),
                     "viewed": clean(r.get("Most Viewed Category"))},
            "rows": [],
        }
    for _, r in obs.iterrows():
        code = clean(r["Store Code"]).upper()
        if code not in reports:
            print(f"  ! {month}: observation for {code} has no summary row, skipped", file=sys.stderr)
            continue
        reports[code]["rows"].append({
            "a": audit_key(r["Audit Type"]), "p": clean(r["Parameter"]), "i": clean(r["Input"]),
            "w": clean(r["Who made the Error"]), "e": clean(r["Error Explanation"]),
            "f": clean(r["How to Correct the error"]), "t": clean(r["Timestamp / Error Category"]),
            "r": clean(r["Final Rating"]), "d": num(r["Points Deducted"]) or 0, "at": clean(r["Attribute"]),
        })
    for code, rep in reports.items():
        total = sum(x["d"] for x in rep["rows"])
        if rep["deducted"] is not None and total != rep["deducted"]:
            print(f"  ! {month}: {code} rows deduct {total}, summary says {rep['deducted']}", file=sys.stderr)
    write_js(OUT / "reports" / f"{month}.js", "KM_REPORTS", month, reports)
    print(f"  {month}: {len(reports)} stores")
    return month


if __name__ == "__main__":
    known = build_stores()
    print(f"Stores: {len(known)}")
    months = sorted((p for p in SRC.iterdir() if p.is_dir() and re.fullmatch(r"\d{4}-\d{2}", p.name)),
                    key=lambda p: p.name)
    built = [build_month(p, known) for p in months]
    write_js(OUT / "months.js", "KM_MONTHS", None, sorted(built, reverse=True))
    print("Done. Commit the data/ folder.")
