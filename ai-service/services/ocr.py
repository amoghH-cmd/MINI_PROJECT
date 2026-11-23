"""Tesseract OCR with OpenCV pre-processing. Word boxes are returned in PDF points so evidence highlighting works for scans."""
import shutil
from dataclasses import dataclass

import cv2
import numpy as np

import config

try:
    import pytesseract
except ImportError:  # pragma: no cover
    pytesseract = None


class OcrUnavailable(RuntimeError):
    pass


@dataclass
class OcrResult:
    text: str
    words: list
    confidence: float
    deskewed: bool


def available() -> bool:
    if pytesseract is None:
        return False
    if config.TESSERACT_CMD:
        pytesseract.pytesseract.tesseract_cmd = config.TESSERACT_CMD
        return shutil.which(config.TESSERACT_CMD) is not None or __import__("os").path.exists(config.TESSERACT_CMD)
    return shutil.which("tesseract") is not None


def _deskew(gray: np.ndarray):
    """Rotate by the detected skew angle when it is small but non-trivial."""
    inv = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    pts = np.column_stack(np.where(inv > 0))
    if len(pts) < 500:
        return gray, False
    angle = cv2.minAreaRect(pts.astype(np.float32))[-1]
    angle = -(90 + angle) if angle < -45 else -angle
    if abs(angle) < 0.5 or abs(angle) > 15:
        return gray, False
    h, w = gray.shape
    m = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(gray, m, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE), True


def ocr_page(page) -> OcrResult:
    if not available():
        raise OcrUnavailable("tesseract not found")
    pix = page.get_pixmap(dpi=config.OCR_DPI)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY) if pix.n >= 3 else img[:, :, 0]
    gray = cv2.medianBlur(gray, 3)               # light denoise
    gray, deskewed = _deskew(gray)
    data = pytesseract.image_to_data(gray, lang=config.OCR_LANG, output_type=pytesseract.Output.DICT)
    scale = 72.0 / config.OCR_DPI
    words, lines, confs = [], {}, []
    for i, t in enumerate(data["text"]):
        t = (t or "").strip()
        conf = float(data["conf"][i])
        if not t or conf < 0:
            continue
        x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
        words.append((x * scale, y * scale, (x + w) * scale, (y + h) * scale, t))
        confs.append(conf / 100.0)
        lines.setdefault((data["block_num"][i], data["par_num"][i], data["line_num"][i]), []).append(t)
    text = "\n".join(" ".join(v) for _, v in sorted(lines.items()))
    return OcrResult(text, words, float(np.mean(confs)) if confs else 0.0, deskewed)
