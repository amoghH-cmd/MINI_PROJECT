from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from schemas.models import TenderExtractRequest, TenderExtractResponse
from services import ingest
from services.tender_extractor import extract_candidates
from utils.errors import ProcessingError
from utils.security import require_service_token, safe_path

router = APIRouter(prefix="/v1/tender", dependencies=[Depends(require_service_token)])


def _run(path, tender_id):
    pages, meta, warnings = ingest.load(path)
    cands = extract_candidates(pages)
    if not cands:
        warnings.append("NO_CANDIDATES: no eligibility clauses were recognised; add requirements manually")
    if any(p.ocr for p in pages):
        warnings.append("OCR_USED: some pages were read by OCR; verify each candidate against its source page")
    return TenderExtractResponse(tenderId=tender_id, pageCount=meta["pageCount"], candidates=cands, warnings=warnings)


@router.post("/extract", response_model=TenderExtractResponse)
async def extract(req: TenderExtractRequest):
    path = safe_path(req.filePath)
    try:
        return await run_in_threadpool(_run, path, req.tenderId)
    except ProcessingError as e:
        raise HTTPException(422, detail={"code": e.code, "message": e.message})
