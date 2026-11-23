"""Proposes eligibility requirements from NIT/ATC text. These are DRAFT CANDIDATES for the officer: nothing here is a rule
until the officer edits and approves it. Pattern-based and intentionally conservative; missing parameters are left for the
officer (needsOfficerInput) instead of being guessed."""
import re
from schemas.models import Candidate
from utils.textparse import parse_amount, number_from_words

NUM = r"(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|single)"
NUMBERING = re.compile(r"^\s*(?:\d+(?:\.\d+)*[.)]|\d+(?:\.\d+)+|\(?[a-z]\)|\(?[ivx]+\)|[-•*])\s+", re.I)


def clauses(pages):
    """(page, text) clauses: numbered items / paragraphs, with wrapped lines re-joined."""
    for p in pages:
        cur, buf = None, []
        def flush():
            if buf:
                yield_list.append((p.number, re.sub(r"\s+", " ", " ".join(buf)).strip()))
        yield_list = []
        for ln in p.text.split("\n"):
            if not ln.strip():
                flush(); buf.clear(); continue
            if NUMBERING.match(ln) and buf:
                flush(); buf.clear()
            buf.append(ln.strip())
        flush()
        yield from yield_list


def _years(low):
    m = re.search(r"(?:last|preceding|previous)\s+" + NUM + r"\s+(?:completed\s+)?(?:financial\s+)?years?", low)
    return number_from_words(m.group(1)) if m else None


def _unit(raw):
    r = (raw or "").lower()
    return ("INR_CRORE", 1e7) if ("crore" in r or re.search(r"\bcr\b", r)) else ("INR_LAKH", 1e5) if ("lakh" in r or "lac" in r) else ("INR", 1.0)


def extract_candidates(pages):
    found = []   # (key, Candidate-ish dict)

    def add(key, type_, desc, rule, page, text, conf, mandatory=True, needs=False):
        if len(text) > 600:   # probably several clauses merged by the PDF layout: parameters may belong to a neighbour
            conf = max(0.2, conf - 0.25)
        found.append((key, dict(type=type_, description=desc, rule=rule, sourcePage=page, text=text[:600], confidence=conf, mandatory=mandatory, needsOfficerInput=needs)))

    for page, cl in clauses(pages):
        low = cl.lower()
        if "turnover" in low:
            amt = parse_amount(cl)
            if amt:
                unit, mult = _unit(amt[1])
                years = _years(low)
                agg = "average" if "average" in low else ("each" if re.search(r"\b(each|every|in all)\b", low) else "latest")
                rule = {"type": "numeric_min", "docType": "FINANCIAL_STATEMENT", "field": "turnover", "min": round(amt[0] / mult, 4), "unit": unit, "aggregate": agg}
                if years:
                    rule["years"] = years
                add("turnover", "FINANCIAL", cl, rule, page, cl, 0.85 if years else 0.72)
            else:
                add("turnover", "FINANCIAL", cl, {}, page, cl, 0.35, needs=True)
        elif re.search(r"similar|experience|executed|completed", low) and re.search(r"\b(orders?|contracts?|works?|supplies|supply)\b", low) and re.search(r"at least|minimum|\bone\b|\btwo\b|\bthree\b|\d+", low):
            n = re.search(r"(?:at least|minimum(?: of)?)\s+" + NUM + r"\b|" + NUM + r"\s+(?:similar\s+)?(?:orders?|contracts?|works?|supply orders?)", low)
            count = number_from_words(next(g for g in n.groups() if g)) if n else None
            amt = parse_amount(cl)
            yrs = re.search(r"(?:last|preceding|previous)\s+" + NUM + r"\s+(?:completed\s+)?(?:financial\s+)?years?", low)
            if count:
                rule = {"type": "count_min", "docType": "EXPERIENCE_LETTER", "minCount": count}
                if amt:
                    rule["minValue"] = int(round(amt[0]))
                if yrs and number_from_words(yrs.group(1)):
                    rule["sinceYears"] = number_from_words(yrs.group(1))
                add("experience", "EXPERIENCE", cl, rule, page, cl, 0.8 if amt else 0.65)
            else:
                add("experience", "EXPERIENCE", cl, {}, page, cl, 0.35, needs=True)
        if re.search(r"\bgst\b|goods and services tax", low) and re.search(r"registration|certificate|gstin", low):
            add("gst", "DOCUMENT", cl, {"type": "document_present", "docType": "GST_CERTIFICATE"}, page, cl, 0.8)
        if re.search(r"\bpan\b|permanent account number", low) and re.search(r"copy|card|submit|furnish|attach|valid", low):
            add("pan", "DOCUMENT", cl, {"type": "document_present", "docType": "PAN_CARD"}, page, cl, 0.75)
        if re.search(r"udyam|msme|\bmse\b", low):
            optional = bool(re.search(r"exemption|preference|claiming|if the bidder|relaxation", low))
            add("udyam", "DOCUMENT", cl, {"type": "document_present", "docType": "UDYAM_CERTIFICATE"}, page, cl, 0.65, mandatory=not optional)
        if re.search(r"certificate of incorporation|partnership deed|incorporation|registration certificate of the (?:firm|company)", low):
            add("incorp", "DOCUMENT", cl, {"type": "document_present", "docType": "INCORPORATION_CERTIFICATE"}, page, cl, 0.75)
        if re.search(r"land border|144\s*\(xi\)", low):
            add("decl_land", "DECLARATION", cl, {"type": "declaration_present", "declarationCode": "LAND_BORDER_144XI"}, page, cl, 0.85)
        if re.search(r"make in india", low):
            add("decl_mii", "DECLARATION", cl, {"type": "declaration_present", "declarationCode": "MAKE_IN_INDIA"}, page, cl, 0.7)
        if re.search(r"blacklist|debarr", low):
            add("decl_bl", "DECLARATION", cl, {"type": "declaration_present", "declarationCode": "NOT_BLACKLISTED"}, page, cl, 0.75)

    best = {}
    for key, c in found:   # one candidate per requirement kind: keep the most confident
        if key not in best or c["confidence"] > best[key]["confidence"]:
            best[key] = c
    out = []
    for i, c in enumerate(sorted(best.values(), key=lambda c: (c["sourcePage"], -c["confidence"])), start=1):
        out.append(Candidate(code=f"REQ-{i:02d}", **c))
    return out
