"""Cross-document consistency: normalisation + RapidFuzz token-set ratio with explicit thresholds. Thresholds are
screening aids; the officer can accept genuine variants or reject real mismatches."""
import re
from collections import Counter
from rapidfuzz import fuzz
from schemas.models import ConsistencyRequest, Finding

MATCH_AT, PROBABLE_AT = 95, 85


def norm_name(s: str) -> str:
    s = (s or "").lower().replace("&", " and ")
    s = re.sub(r"\bm/s\.?\b", " ", s)
    s = re.sub(r"[.,()'\"\-/]", " ", s)
    s = re.sub(r"\bprivate\b", "pvt", s)
    s = re.sub(r"\blimited\b", "ltd", s)
    return re.sub(r"\s+", " ", s).strip()


def norm_addr(s: str) -> str:
    s = (s or "").lower()
    for a, b in {r"\bstreet\b": "st", r"\broad\b": "rd", r"\bindustrial\b": "ind", r"\bestate\b": "est", r"\bphase\b": "ph", r"\bnear\b": "nr"}.items():
        s = re.sub(a, b, s)
    return re.sub(r"[^a-z0-9 ]", " ", re.sub(r"\s+", " ", s)).strip()


def _verdict(score):
    return "MATCH" if score >= MATCH_AT else "PROBABLE_MATCH" if score >= PROBABLE_AT else "MISMATCH"


def _ref(src, kind, value, doc=None):
    return {"source": src, "docId": doc, "value": value}


def check(req: ConsistencyRequest):
    prof = req.orgProfile
    findings: list[Finding] = []
    by = {}
    for f in req.fields:
        v = (f.normalizedValue or f.rawValue or "").strip()
        if v:
            by.setdefault(f.fieldName, []).append((f.docId, f.docType, v))

    def compare(ftype, label, values, profile_value, norm, exact):
        if not values and not profile_value:
            return
        ref_src, ref_val, ref_doc = ("organisation profile", profile_value, None) if profile_value else (
            "most common document value", Counter(norm(v) for _, _, v in values).most_common(1)[0][0], None)
        if not profile_value and len(values) < 2:
            findings.append(Finding(type=ftype, fieldA=_ref("document", label, values[0][2], values[0][0]), fieldB=_ref("none", label, None), score=0,
                                    verdict="INSUFFICIENT_DATA", explanation=f"Only one document states {label}; nothing to compare against."))
            return
        for doc, dtype, v in values:
            a, b = norm(v), norm(ref_val)
            score = 100.0 if a == b else (0.0 if exact else float(fuzz.token_set_ratio(a, b)))
            verdict = "MATCH" if (exact and a == b) else ("MISMATCH" if exact else _verdict(score))
            findings.append(Finding(type=ftype, fieldA=_ref(dtype, label, v, doc), fieldB=_ref(ref_src, label, ref_val), score=round(score, 1), verdict=verdict,
                                    explanation=f"{label} in {dtype} compared with {ref_src}: similarity {round(score)}"
                                                + (" (exact comparison)" if exact else f" (match ≥{MATCH_AT}, probable ≥{PROBABLE_AT})") + "."))

    ident = lambda s: re.sub(r"\s+", "", s.upper())
    compare("legal_name", "Legal name", by.get("legal_name", []), prof.legalName if prof else None, norm_name, False)
    compare("gstin", "GSTIN", by.get("gstin", []), prof.gstin if prof else None, ident, True)
    compare("pan", "PAN", by.get("pan", []), prof.pan if prof else None, ident, True)
    compare("address", "Address", by.get("address", []), prof.address if prof else None, norm_addr, False)

    # PAN embedded in GSTIN (characters 3-12) must equal ONE reference PAN: the organisation profile's if given,
    # otherwise the most common PAN among documents. (Comparing against "any stated PAN" would let a wrong PAN in one
    # document excuse a wrong GSTIN in another.)
    doc_pans = [ident(v) for _, _, v in by.get("pan", [])]
    ref_pan = ident(prof.pan) if prof and prof.pan else (Counter(doc_pans).most_common(1)[0][0] if doc_pans else None)
    ref_src = "organisation profile" if prof and prof.pan else "most common document PAN"
    for doc, dtype, g in by.get("gstin", []):
        g = ident(g)
        if len(g) == 15 and ref_pan:
            ok = g[2:12] == ref_pan
            findings.append(Finding(type="pan_in_gstin", fieldA=_ref(dtype, "GSTIN", g, doc), fieldB=_ref(ref_src, "PAN", ref_pan),
                                    score=100.0 if ok else 0.0, verdict="MATCH" if ok else "MISMATCH",
                                    explanation=f"PAN embedded in the GSTIN (characters 3-12) {'equals' if ok else 'does not equal'} the PAN from the {ref_src}."))
    return findings
