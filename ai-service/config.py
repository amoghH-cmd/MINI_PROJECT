"""Environment-based settings. The AI service is stateless and never writes to MongoDB."""
import os
from pathlib import Path

UPLOAD_ROOT = Path(os.getenv("AI_UPLOAD_ROOT", "../backend/uploads")).resolve()
SERVICE_TOKEN = os.getenv("AI_SERVICE_TOKEN", "")
ALLOW_NO_TOKEN = os.getenv("AI_ALLOW_NO_TOKEN", "0") == "1"   # local experiments only
MAX_PAGES = int(os.getenv("AI_MAX_PAGES", "60"))
MAX_FILE_MB = int(os.getenv("AI_MAX_FILE_MB", "30"))
OCR_DPI = int(os.getenv("AI_OCR_DPI", "300"))
OCR_LANG = os.getenv("AI_OCR_LANG", "eng")
MIN_TEXT_CHARS_PER_PAGE = int(os.getenv("AI_MIN_TEXT_CHARS", "40"))   # below this a page is treated as scanned
LOW_CONFIDENCE = float(os.getenv("AI_LOW_CONFIDENCE", "0.70"))
TESSERACT_CMD = os.getenv("TESSERACT_CMD", "")                         # Windows: C:\Program Files\Tesseract-OCR\tesseract.exe
