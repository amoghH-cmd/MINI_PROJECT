"""Find the bounding box of an extracted value on its page. Returns None when it cannot be found: boxes are never invented."""
import re


def _norm(w: str) -> str:
    return re.sub(r"^[^\w₹]+|[^\w]+$", "", w.lower())


def locate(words, value: str):
    toks = [_norm(t) for t in value.split() if _norm(t)]
    if not toks or not words:
        return None
    n = len(toks)
    normed = [_norm(w[4]) for w in words]
    for i in range(len(words) - n + 1):
        if normed[i:i + n] == toks:
            return _union(words[i:i + n])
    # value glued to a label by the text layer (e.g. "GSTIN:29AAAA...") -> single word containing it
    needle = "".join(toks)
    for w, nw in zip(words, normed):
        if needle and needle in re.sub(r"[^\w]", "", w[4].lower()):
            return [round(w[0], 2), round(w[1], 2), round(w[2], 2), round(w[3], 2)]
    return None


def _union(ws):
    return [round(min(w[0] for w in ws), 2), round(min(w[1] for w in ws), 2), round(max(w[2] for w in ws), 2), round(max(w[3] for w in ws), 2)]
