"""Keyword/layout rule classifier (HLD: rules first, ML later). Returns the evidence it used so the result is explainable."""
import re

RULES = {
    "GST_CERTIFICATE": [("registration certificate", 2), ("form gst reg", 3), ("goods and services tax", 2), ("gstin", 1), ("gst reg-06", 3)],
    "PAN_CARD": [("permanent account number", 3), ("income tax department", 2), ("pan card", 2)],
    "INCORPORATION_CERTIFICATE": [("certificate of incorporation", 3), ("registrar of companies", 2), ("corporate identity number", 2), ("partnership deed", 2), ("limited liability partnership", 1)],
    "UDYAM_CERTIFICATE": [("udyam registration certificate", 3), ("udyam", 2), ("msme", 1), ("micro, small", 1)],
    "FINANCIAL_STATEMENT": [("balance sheet", 2), ("profit and loss", 2), ("statement of profit", 2), ("independent auditor", 2), ("revenue from operations", 2), ("notes to accounts", 1)],
    "TURNOVER_CERTIFICATE": [("turnover certificate", 3), ("chartered accountant", 1), ("annual turnover", 2), ("certify that", 1)],
    "EXPERIENCE_LETTER": [("work order", 2), ("purchase order", 2), ("completion certificate", 3), ("satisfactorily completed", 3), ("letter of award", 2), ("order value", 1), ("contract value", 1)],
    "DECLARATION": [("hereby declare", 3), ("declaration", 2), ("undertaking", 2), ("solemnly affirm", 2)],
}


def classify(text: str):
    low = re.sub(r"\s+", " ", text.lower())
    head = low[:700]
    scores, basis = {}, {}
    for dt, kws in RULES.items():
        s, hit = 0.0, []
        for kw, w in kws:
            if kw in low:
                s += w * (1.5 if kw in head else 1.0)   # a title match counts more than a body mention
                hit.append(kw)
        if s:
            scores[dt], basis[dt] = s, hit
    if not scores:
        return "OTHER", 0.2, []
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    best, top = ranked[0]
    second = ranked[1][1] if len(ranked) > 1 else 0.0
    conf = min(0.95, 0.4 + 0.08 * top)
    if second and second >= 0.8 * top:
        conf = max(0.3, conf - 0.25)       # near tie: say so
    return best, round(conf, 2), basis[best]
