"""Format/checksum validation. Mirrors backend/utils/identifiers.js. Format only: says nothing about registration."""
import re

GST_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
PAN_TYPES = "ABCFGHLJPT"
STATE_CODES = {f"{i:02d}" for i in range(1, 39)} | {"97", "99"}


def gstin_check_char(first14: str):
    total = 0
    for i, ch in enumerate(first14[:14]):
        v = GST_CHARS.find(ch)
        if v < 0:
            return None
        p = v * (1 if i % 2 == 0 else 2)
        total += p // 36 + p % 36
    return GST_CHARS[(36 - total % 36) % 36]


def valid_pan(s: str) -> bool:
    s = (s or "").strip().upper()
    return bool(PAN_RE.match(s)) and s[3] in PAN_TYPES


def valid_gstin(s: str) -> bool:
    g = (s or "").strip().upper()
    return (len(g) == 15 and g[:2] in STATE_CODES and valid_pan(g[2:12]) and g[12] != "0" and g[13] == "Z"
            and gstin_check_char(g[:14]) == g[14])
