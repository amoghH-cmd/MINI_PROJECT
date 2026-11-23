from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from schemas.models import ProcessRequest, ProcessResponse
from services.document_pipeline import process_document
from utils.errors import ProcessingError
from utils.security import require_service_token, safe_path

router = APIRouter(prefix="/v1/documents", dependencies=[Depends(require_service_token)])


@router.post("/process", response_model=ProcessResponse)
async def process(req: ProcessRequest):
    path = safe_path(req.filePath)
    try:
        return await run_in_threadpool(process_document, path, req.docId)
    except ProcessingError as e:
        raise HTTPException(422, detail={"code": e.code, "message": e.message})
