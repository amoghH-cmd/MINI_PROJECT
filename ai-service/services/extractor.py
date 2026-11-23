"""Deterministic field extraction: regex + label proximity. Every field carries page, bbox (if locatable), confidence and method."""
import re
from schemas.models import Field_
from services import validators as V
from services.locate import locate
from utils.textparse import DATE_ANY, parse_date, parse_amount, unit_hint

GSTIN_RE = re.compile(r"\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b")
PAN_RE = re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b")
UDYAM_RE = re.compile(r"\bUDYAM-[A-Z]{2}-\d{2}-\d{7}\b")
CIN_RE = re.compile(r"\b[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b")
FY_RE = re.compile(r"(?:FY|F\.Y\.|year ended|financial year)\s*[:\-]?\s*(?:31(?:st)?\s+\w+\s+)?((?:19|20)\d{2})\s*[-–/]\s*(\d{2,4})", re.I)
NOT_APPLICABLE = r"(?:not applicable|n/?a|perpetual|life\s?time|no expiry)"

DATE_LABELS = {
    "registration_date": r"date of registration|date of incorporation|date of liability|registered on",
    "valid_from": r"valid from|effective from|w\.e\.f\.?",
    "valid_upto": r"valid\s*(?:upto|up to|till|until|through)|date of expiry|expires on|validity upto",
    "issue_date": r"date of issue|issued on",
}
NAME_LABEL = re.compile(
    r"(?im)^[ \t]*(?:legal name(?: of (?:the )?(?:business|firm|company|enterprise))?|name of (?:the )?(?:enterprise|firm|company|organi[sz]ation|bidder|unit)|name of applicant)[ \t]*[:\-][ \t]*(.+?)[ \t]*$")
ADDR_LABEL = re.compile(r"(?im)^[ \t]*(?:registered office(?: address)?|principal place of business|address(?: of (?:the )?(?:enterprise|firm|company))?)[ \t]*[:\-]?[ \t]*(.*)$")
VALUE_LABEL = re.compile(r"(?i)(order value|contract value|value of (?:the )?(?:work|order|contract|supply)|total order value|purchase order value|total contract value)")
ORDER_DATE = re.compile(r"(?i)(order date|date of order|date of award|work order dated|dated|completion date|date of completion)\s*[:\-]?\s*(" + DATE_ANY + ")")

DECLARATIONS = {
    "LAND_BORDER_144XI": re.compile(r"land border|144\s*\(xi\)", re.I),
    "MAKE_IN_INDIA": re.compile(r"make in india|preference to make in india", re.I),
    "NOT_BLACKLISTED": re.compile(r"(?:not|never)\s+(?:been\s+)?(?:blacklisted|debarred|banned)", re.I),
}


class Collector:
    def __init__(self, page, ocr_factor):
        self.page, self.k, self.out = page, ocr_factor, []

    def add(self, name, raw, norm, conf, method, **attrs):
        bbox = locate(self.page.words, raw)
        a = dict(attrs)
        if bbox and self.page.deskewed:
            a["bboxApproximate"] = True   # OCR page was rotated for reading; box may be slightly offset
        self.out.append(Field_(fieldName=name, rawValue=raw, normalizedValue=norm, confidence=round(min(1.0, conf * self.k), 2),
                               page=self.page.number, bbox=bbox, pageSize=[self.page.width, self.page.height],
                               method=("ocr+" if self.page.ocr else "") + method, attrs=a))


def _page_fields(page, doc_type):
    k = page.ocr_conf if (page.ocr and page.ocr_conf is not None) else 1.0
    c, text = Collector(page, k), page.text

    gst_spans = []
    for m in GSTIN_RE.finditer(text):
        ok = V.valid_gstin(m.group())
        gst_spans.append(m.span())
        c.add("gstin", m.group(), m.group(), 0.97 if ok else 0.55, "regex", checksumValid=ok)
    for m in PAN_RE.finditer(text):
        if any(s <= m.start() and m.end() <= e for s, e in gst_spans):
            continue  # that is the PAN embedded inside a GSTIN, not a separate PAN mention
        c.add("pan", m.group(), m.group(), 0.95 if V.valid_pan(m.group()) else 0.5, "regex", formatValid=V.valid_pan(m.group()))
    for m in UDYAM_RE.finditer(text):
        c.add("udyam_no", m.group(), m.group(), 0.97, "regex")
    for m in CIN_RE.finditer(text):
        c.add("cin", m.group(), m.group(), 0.93, "regex")

    for m in NAME_LABEL.finditer(text):
        v = m.group(1).strip()
        if len(v) >= 3:
            c.add("legal_name", v, v, 0.88, "label")
    if doc_type in ("PAN_CARD", "TURNOVER_CERTIFICATE"):   # bare "Name:" is only unambiguous on these document types
        for m in re.finditer(r"(?im)^[ \t]*name(?: of (?:the )?(?:holder|assessee))?[ \t]*:[ \t]*(.+?)[ \t]*$", text):
            v = m.group(1).strip()
            if len(v) >= 3:
                c.add("legal_name", v, v, 0.78, "label")
    for m in ADDR_LABEL.finditer(text):
        v = m.group(1).strip()
        if not v:   # address on the following line
            nxt = text[m.end():].lstrip("\n").split("\n", 1)[0].strip()
            v = nxt if nxt and ":" not in nxt else ""
        if len(v) >= 8:
            c.add("address", v, re.sub(r"\s+", " ", v), 0.8, "label")

    for fname, labels in DATE_LABELS.items():
        for m in re.finditer(r"(?i)(?:" + labels + r")\s*[:\-]?\s*(" + DATE_ANY + "|" + NOT_APPLICABLE + ")", text):
            raw = m.group(1).strip()
            iso = parse_date(raw)
            if iso:
                c.add(fname, raw, iso, 0.9, "label")
            else:  # e.g. "Valid Upto: Not Applicable": surfaced as-is so the rule engine can route it to review
                c.add(fname, raw, "NOT_APPLICABLE", 0.6, "label", note="no end date stated")

    # financial: turnover / revenue lines, with fiscal year from the same or the preceding lines
    lines = text.split("\n")
    hint = unit_hint(text)
    for i, ln in enumerate(lines):
        if re.search(r"(?i)turnover|revenue from operations", ln):
            bare = hint != 1.0   # the statement states its unit, so unlabelled figures are amounts in that unit
            amt = parse_amount(ln, hint, bare) or (parse_amount(lines[i + 1], hint, bare) if i + 1 < len(lines) else None)
            if not amt:
                continue
            fy = None
            for j in range(i, max(-1, i - 4), -1):
                if f := FY_RE.search(lines[j]):
                    fy = f"{f.group(1)}-{f.group(2)[-2:]}"
                    break
            c.add("turnover", amt[1], str(int(round(amt[0]))), 0.82, "label", fiscalYear=fy, unit="INR")

    # experience evidence
    for i, ln in enumerate(lines):
        if VALUE_LABEL.search(ln):
            amt = parse_amount(ln) or (parse_amount(lines[i + 1]) if i + 1 < len(lines) else None)
            if amt:
                c.add("order_value", amt[1], str(int(round(amt[0]))), 0.82, "label", unit="INR")
    for m in ORDER_DATE.finditer(text):
        iso = parse_date(m.group(2))
        if iso:
            kind = "completion_date" if "complet" in m.group(1).lower() else "order_date"
            c.add(kind, m.group(2), iso, 0.8, "label")

    # declarations (only where the document actually reads like one)
    if doc_type == "DECLARATION" or re.search(r"(?i)hereby declare|undertak", text):
        for code, rx in DECLARATIONS.items():
            if m := rx.search(text):
                c.add("declaration_code", m.group(), code, 0.8, "regex", clause=_sentence(text, m.start()))
    return c.out


def _sentence(text, pos, width=160):
    s = max(0, pos - width // 2)
    return re.sub(r"\s+", " ", text[s:pos + width // 2]).strip()


def extract_fields(pages, doc_type):
    seen, out = set(), []
    for p in pages:
        for f in _page_fields(p, doc_type):
            key = (f.fieldName, f.normalizedValue, f.attrs.get("fiscalYear"))
            if key in seen:
                continue
            seen.add(key)
            out.append(f)
    return out
