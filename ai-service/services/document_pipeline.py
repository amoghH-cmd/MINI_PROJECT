from pathlib import Path
import config
from schemas.models import ProcessResponse
from services import classifier, extractor, ingest
from services.pdf_signals import pdf_signals


def process_document(path: Path, doc_id: str) -> ProcessResponse:
    pages, meta, warnings = ingest.load(path)
    text = "\n".join(p.text for p in pages)
    doc_type, conf, basis = classifier.classify(text)
    fields = extractor.extract_fields(pages, doc_type)

    ocr_pages = [p.number for p in pages if p.ocr]
    confs = [p.ocr_conf for p in pages if p.ocr and p.ocr_conf is not None]
    ocr_conf = round(sum(confs) / len(confs), 2) if confs else None
    unreadable = bool(meta["ocrUnavailablePages"])
    low = unreadable or (ocr_conf is not None and ocr_conf < config.LOW_CONFIDENCE) or conf < 0.5
    if low:
        warnings.append("LOW_CONFIDENCE: route to officer review; do not rely on extracted values without checking the page")
    if not text.strip():
        warnings.append("NO_TEXT: no text could be read from this document")

    raw = Path(path).read_bytes()
    signals = pdf_signals(raw, meta["metadata"])
    return ProcessResponse(docId=doc_id, docType=doc_type, classifyConfidence=conf, classifyBasis=basis, pageCount=meta["pageCount"],
                           ocrPages=ocr_pages, ocrConfidence=ocr_conf, lowConfidence=low, fields=fields, pdfSignals=signals, warnings=warnings)
