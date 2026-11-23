"""Structural screening signals. These are HINTS for a human, never proof of tampering."""
import re
from datetime import datetime

EDITORS = ("photoshop", "canva", "ilovepdf", "smallpdf", "pdfescape", "sejda", "pdf24", "foxit phantom", "wondershare", "nitro")


def _pdf_date(s: str):
    m = re.match(r"D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?", s or "")
    if not m:
        return None
    parts = [int(x) if x else d for x, d in zip(m.groups(), (1970, 1, 1, 0, 0, 0))]
    try:
        return datetime(*parts)
    except ValueError:
        return None


def pdf_signals(raw: bytes, metadata: dict) -> dict:
    flags = []
    if not raw.startswith(b"%PDF"):
        return {"isPdf": False, "flags": []}
    eof = raw.count(b"%%EOF")
    if eof > 1:
        flags.append({"code": "INCREMENTAL_UPDATE", "detail": f"{eof} end-of-file markers: the file was saved with appended revisions (common after signing or editing)"})
    if re.search(rb"/(JS|JavaScript)\b", raw):
        flags.append({"code": "EMBEDDED_JAVASCRIPT", "detail": "File contains JavaScript actions (never executed by this system)"})
    if b"/EmbeddedFile" in raw:
        flags.append({"code": "EMBEDDED_FILES", "detail": "File contains embedded attachments (never opened by this system)"})
    producer = f"{metadata.get('producer', '')} {metadata.get('creator', '')}".lower()
    ed = [e for e in EDITORS if e in producer]
    if ed:
        flags.append({"code": "EDITING_SOFTWARE_PRODUCER", "detail": f"Producer/creator metadata names {', '.join(ed)}; may be benign"})
    c, m = _pdf_date(metadata.get("creationDate")), _pdf_date(metadata.get("modDate"))
    if c and m and m < c:
        flags.append({"code": "METADATA_DATE_MISMATCH", "detail": "Modification date is earlier than creation date"})
    elif c and m and (m - c).days > 30:
        flags.append({"code": "MODIFIED_LONG_AFTER_CREATION", "detail": f"Modified {(m - c).days} days after creation"})
    return {"isPdf": True, "eofMarkers": eof, "producer": metadata.get("producer") or None, "creator": metadata.get("creator") or None,
            "creationDate": c.isoformat() if c else None, "modDate": m.isoformat() if m else None, "flags": flags}
