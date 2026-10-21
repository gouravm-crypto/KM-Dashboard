#!/usr/bin/env python3
"""
Builds the dashboard's backup data from your Google Sheet download.
(The live dashboard reads the published sheet directly; these files are
only used if the live link is not set or cannot be reached.)

    source/store_details.xlsx  -> data/stores.js
    source/kano_sheet.xlsx     -> data/reports/<YYYY-MM>.js, data/months.js
                               -> source/data_check.csv  (rows worth fixing in the sheet)

To refresh: in Google Sheets choose File > Download > Microsoft Excel (.xlsx),
save it as source/kano_sheet.xlsx, then run from the repo root:
    python tools/build_data.py
Needs: pip install pandas openpyxl
"""
import csv, json, math, re, sys
from datetime import datetime, date, time
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / "source", ROOT / "data"
MONTHS_TO_SHOW = 3   # keep in step with monthsToShow in assets/config.js (0 = all)


def ccl_for(km):
    """CCL points from the KM score (CaratLane KM points table)."""
    v = int(km)
    return 15 if v >= 100 else 14 if v >= 95 else 13 if v >= 90 else 12 if v >= 85 else 11 if v >= 80 else 10 if v >= 70 else 5 if v >= 60 else 0

MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def norm(h):
    return re.sub(r"[^a-z0-9]", "", str(h).lower())


def text(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    if isinstance(v, datetime):
        if v.year <= 1900:          # time-only cells come through as 1899/1900 dates
            return v.strftime("%H:%M:%S")
        return v.strftime("%Y-%m-%d")
    if isinstance(v, date):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, time):
        return v.strftime("%H:%M:%S")
    s = str(v).strip()
    return s[:-2] if re.fullmatch(r"-?\d+\.0", s) else s


def number(v):
    try:
        return float(text(v))
    except ValueError:
        return None


def month_of_cycle(v):
    m = re.search(r"([A-Za-z]{3,})\w*\s+(\d{4})", text(v))
    if m and m.group(1)[:3].lower() in MONTHS and int(m.group(2)) > 2000:
        return f"{m.group(2)}-{MONTHS[m.group(1)[:3].lower()]:02d}"
    return None


def month_of_date(v):
    """Audit cycle from the audit date: 26th of the previous month to 25th of this month."""
    y = mo = dd = None
    if isinstance(v, (datetime, date)) and getattr(v, "year", 0) > 2000:
        y, mo, dd = v.year, v.month, v.day
    else:
        s = text(v)
        m = re.match(r"(\d{4})-(\d{1,2})-(\d{1,2})", s)
        if m:
            y, mo, dd = int(m.group(1)), int(m.group(2)), int(m.group(3))
        m = m or re.match(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", s)   # day first (Indian format)
        if m and y is None:
            a, b = int(m.group(1)), int(m.group(2))
            y, mo, dd = int(m.group(3)), (a if b > 12 else b), (b if b > 12 else a)
    if y is None:
        return None
    if dd >= 26:
        mo += 1
        if mo == 13:
            y, mo = y + 1, 1
    return f"{y}-{mo:02d}"


def write_js(path, var, key, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if key is None:
        path.write_text(f"window.{var}={body};\n", encoding="utf-8")
    else:
        path.write_text(f"window.{var}=window.{var}||{{}};window.{var}[{json.dumps(key)}]={body};\n", encoding="utf-8")


def load_store_list():
    df = pd.read_excel(SRC / "store_details.xlsx", dtype=str)
    df.columns = [c.strip().lower() for c in df.columns]
    pick = lambda *n: next((c for c in df.columns if c in n), None)
    m = {"code": pick("store code"), "erp": pick("store erp name"), "name": pick("store name"), "region": pick("region"),
         "city": pick("city"), "tier": pick("tier"), "state": pick("state"), "format": pick("format"),
         "type": pick("type"), "email": pick("email id", "email")}
    stores = {}
    for _, r in df.iterrows():
        s = {k: text(r[v]) if v else "" for k, v in m.items()}
        if s["code"]:
            s["code"], s["email"] = s["code"].upper(), s["email"].lower()
            stores[s["code"]] = s
    return stores


def find_cols(headers):
    h = [norm(x) for x in headers]
    def col(*keys):
        for k in keys:
            for i, x in enumerate(h):
                if x.startswith(k):
                    return i
        return None
    return {
        "type": col("audittype"), "code": col("storecode"), "email": col("emailid", "email"),
        "date": col("dateofaudit"), "cdate": col("dateofcctv"), "cstart": col("cctvstarttime"),
        "cend": col("cctvendtime"), "dur": col("totalduartion", "totalduration"), "viewed": col("mostviewed"),
        "other": col("otherobservations"), "p": col("paramter", "parameter"), "i": col("input"),
        "w": col("whomade"), "e": col("errorexplanation"), "f": col("howtocorrect"),
        "t": col("errortype", "timestamp"), "r": col("errorcatergory", "errorcategory"),
        "d": col("pontsdeducted", "pointsdeducted"), "at": col("attribute"), "cycle": col("auditcycle"),
    }


def main():
    stores = load_store_list()
    sheet = pd.read_excel(SRC / "kano_sheet.xlsx", header=None, dtype=object)
    C = find_cols(sheet.iloc[0].tolist())
    missing = [k for k in ("type", "code", "p", "d") if C[k] is None]
    if missing:
        sys.exit(f"Could not find columns: {missing}. Check the sheet headers.")
    get = lambda row, k: row[C[k]] if C[k] is not None else None

    reports, issues, seen = {}, [], set()
    for idx in range(1, len(sheet)):
        row = sheet.iloc[idx].tolist()
        rown = idx + 1
        t = text(get(row, "type")).lower()
        a = "ppt" if t.startswith("ppt") else "vc" if t.startswith(("vc", "video")) else "cctv" if t.startswith("cctv") else None
        if a is None:
            if t and t != "audit type":
                issues.append((rown, "Unknown audit type", text(get(row, "type"))))
            continue
        code = text(get(row, "code")).upper()
        if not code:
            issues.append((rown, "Blank store code", text(get(row, "p"))[:60]))
            continue
        month = month_of_cycle(get(row, "cycle")) or month_of_date(get(row, "date"))
        if not month:
            issues.append((rown, "No audit date or cycle", code))
            continue
        p, pts_raw = text(get(row, "p")), get(row, "d")
        if re.match(r"#(N/A|REF!|VALUE!|ERROR!|DIV/0!|NAME\?)", p, re.I):
            p = ""
        pts = number(pts_raw)
        if not p and pts is None:
            continue
        if p and pts is None and (text(get(row, "e")) or text(get(row, "f"))):
            issues.append((rown, "Mistake written up but no points entered (counted as 0)", f"{code}: {p[:50]}"))
        if "#REF" in " ".join(text(x) for x in row):
            issues.append((rown, "#REF! error in row", code))
        sig = tuple(text(x) for x in row)
        if sig in seen:
            issues.append((rown, "Exact duplicate of an earlier row (still counted)", f"{code}: {p[:50]}"))
        seen.add(sig)
        if code not in stores:
            stores[code] = {"code": code, "erp": "", "name": code, "region": "", "city": "", "tier": "", "state": "",
                            "format": "", "type": "", "email": text(get(row, "email")).lower()}
        rep = reports.setdefault(month, {}).setdefault(code, {"km": None, "ccl": None, "deducted": 0, "sent": "",
                                                              "vc": {"link": ""}, "cctv": {}, "rows": []})
        rep["rows"].append({"a": a, "p": p, "i": text(get(row, "i")), "w": text(get(row, "w")), "e": text(get(row, "e")),
                            "f": text(get(row, "f")), "t": text(get(row, "t")), "r": text(get(row, "r")),
                            "d": int(pts) if pts is not None and pts == int(pts) else (pts or 0), "at": text(get(row, "at"))})
        if a == "vc" and not rep["vc"]["link"]:
            for k in ("cend", "other"):
                v = text(get(row, k))
                if v.startswith("http"):
                    rep["vc"]["link"] = v
                    break
        if a == "cctv" and not rep["cctv"].get("date"):
            rep["cctv"] = {"date": text(get(row, "cdate")), "start": text(get(row, "cstart")), "end": text(get(row, "cend")),
                           "duration": text(get(row, "dur")), "viewed": text(get(row, "viewed"))}

    keep = sorted(reports, reverse=True)
    keep = keep[:MONTHS_TO_SHOW] if MONTHS_TO_SHOW > 0 else keep
    reports = {m: reports[m] for m in keep}
    for old in (OUT / "reports").glob("*.js"):
        old.unlink()
    for month, by_store in reports.items():
        for code, rep in by_store.items():
            # Scoring (same as the monthly KM email):
            # KM = 100 minus all points lost that month (never below 0); any NCF -> KM 0; CCL from KM table
            lost = sum(x["d"] for x in rep["rows"])
            rep["ncf"] = any("ncf" in x["r"].lower() or x["d"] >= 100 for x in rep["rows"])
            capped = min(100, lost)
            rep["deducted"] = int(capped) if capped == int(capped) else round(capped, 2)
            rep["km"] = 0 if rep["ncf"] else max(0, int(math.floor(100 - lost + 1e-9)))
            rep["ccl"] = ccl_for(rep["km"])
        write_js(OUT / "reports" / f"{month}.js", "KM_REPORTS", month, by_store)
        print(f"  {month}: {len(by_store)} stores")

    write_js(OUT / "stores.js", "KM_STORES", None, sorted(stores.values(), key=lambda s: s["code"]))
    write_js(OUT / "months.js", "KM_MONTHS", None, sorted(reports, reverse=True))
    with open(SRC / "data_check.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Sheet row", "Issue", "Details"])
        w.writerows(issues)
    print(f"Stores: {len(stores)}. Months: {len(reports)}. Rows to check in sheet: {len(issues)} (see source/data_check.csv)")


if __name__ == "__main__":
    main()
