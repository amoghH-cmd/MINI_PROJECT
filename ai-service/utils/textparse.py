"""Date and amount parsing for Indian documents. Deterministic; returns None rather than guessing."""
import re
from datetime import date

MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}
NUMBER_WORDS = {"a": 1, "one": 1, "single": 1, "two": 2, "three": 3, "four": 4, "five": 5,
                "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}

DATE_NUM = re.compile(r"\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b")
DATE_TXT = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?[\s\-]+([A-Za-z]{3,9})\.?,?[\s\-]+(\d{4})\b")
DATE_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
DATE_ANY = "(?:" + DATE_NUM.pattern + "|" + DATE_TXT.pattern + "|" + DATE_ISO.pattern + ")"


def _mk(y, m, d):
    try:
        return date(int(y), int(m), int(d)).isoformat()
    except ValueError:
        return None


def parse_date(s: str):
    """Returns ISO date or None. Indian numeric dates are day-first."""
    s = s.strip()
    if m := DATE_ISO.search(s):
        return _mk(m[1], m[2], m[3])
    if m := DATE_NUM.search(s):
        return _mk(m[3], m[2], m[1])
    if m := DATE_TXT.search(s):
        mon = MONTHS.get(m[2][:3].lower())
        return _mk(m[3], mon, m[1]) if mon else None
    return None


AMOUNT = re.compile(
    r"(?:(?:rs\.?|inr|rupees|₹)\s*)?(\d{1,3}(?:,\d{2,3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(crores?|cr\.?|lakhs?|lacs?|million)?",
    re.IGNORECASE)
MULT = {"crore": 1e7, "crores": 1e7, "cr": 1e7, "cr.": 1e7, "lakh": 1e5, "lakhs": 1e5, "lac": 1e5, "lacs": 1e5, "million": 1e6}
CURRENCY = re.compile(r"(rs\.?|inr|rupees|₹)", re.IGNORECASE)


def parse_amount(text: str, default_multiplier: float = 1.0, allow_bare: bool = False):
    """First money-like amount in `text` -> (rupees, raw_match) or None.
    A bare number counts only if it has a currency marker, a crore/lakh unit, is large, or the caller knows the statement's unit
    (allow_bare). Year-like integers (e.g. 2023) are never treated as amounts."""
    for m in AMOUNT.finditer(text):
        num, unit = m.group(1), (m.group(2) or "").lower()
        has_cur = bool(CURRENCY.search(m.group(0)))
        try:
            val = float(num.replace(",", ""))
        except ValueError:
            continue
        if unit:
            return val * MULT[unit], m.group(0).strip()
        if not unit and not has_cur and re.fullmatch(r"(19|20)\d{2}", num):
            continue
        if has_cur or val >= 10000 or allow_bare:
            return val * default_multiplier, m.group(0).strip()
    return None


def unit_hint(text: str) -> float:
    """Statement-level unit note such as '(Amount in Rs. lakhs)'."""
    m = re.search(r"(?:amounts?|figures?)?\s*(?:are\s*)?in\s*(?:rs\.?|inr|₹)?\s*(crores?|lakhs?|lacs?)", text, re.IGNORECASE)
    return MULT[m.group(1).lower()] if m else 1.0


def number_from_words(s: str):
    s = s.lower().strip()
    if s.isdigit():
        return int(s)
    return NUMBER_WORDS.get(s)
