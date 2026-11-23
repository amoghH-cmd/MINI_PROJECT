"""Turns a stored file into pages of text + word boxes. Digital text first; OCR only for pages without a usable text layer."""
from dataclasses import dataclass, field
from typing import Optional
import fitz  # PyMuPDF

import config
from services import ocr
from utils.errors import ProcessingError


@dataclass
class Page:
    number: int                      # 1-based
    width: float
    height: float
    text: str
    words: list = field(default_factory=list)   # (x0, y0, x1, y1, word)
    ocr: bool = False
    ocr_conf: Optional[float] = None
    deskewed: bool = False


def load(path):
    warnings: list[str] = []
    try:
        doc = fitz.open(str(path))
    except Exception as e:  # noqa: BLE001 - fitz raises several types
        raise ProcessingError("UNREADABLE_FILE", f"File could not be opened: {e}") from e
    if doc.needs_pass or doc.is_encrypted:
        raise ProcessingError("ENCRYPTED_PDF", "Encrypted or password-protected files are not processed")
    if doc.page_count == 0:
        raise ProcessingError("UNREADABLE_FILE", "Document has no pages")

    n = min(doc.page_count, config.MAX_PAGES)
    if doc.page_count > n:
        warnings.append(f"PAGE_LIMIT: only the first {n} of {doc.page_count} pages were processed")

    pages: list[Page] = []
    unavailable: list[int] = []
    for i in range(n):
        p = doc[i]
        text = p.get_text("text") or ""
        words = [(w[0], w[1], w[2], w[3], w[4]) for w in p.get_text("words")]
        page = Page(i + 1, float(p.rect.width), float(p.rect.height), text, words)
        if len(text.strip()) < config.MIN_TEXT_CHARS_PER_PAGE:
            try:
                res = ocr.ocr_page(p)
                page.text, page.words, page.ocr_conf, page.deskewed, page.ocr = res.text, res.words, res.confidence, res.deskewed, True
            except ocr.OcrUnavailable:
                unavailable.append(i + 1)
            except Exception as e:  # noqa: BLE001 - a bad page must not sink the whole document
                warnings.append(f"OCR_FAILED: page {i + 1}: {e}")
        pages.append(page)
    if unavailable:
        warnings.append(f"OCR_UNAVAILABLE: Tesseract is not installed/configured; pages {unavailable} could not be read")
    meta = {"pageCount": doc.page_count, "metadata": dict(doc.metadata or {}), "ocrUnavailablePages": unavailable}
    doc.close()
    return pages, meta, warnings
