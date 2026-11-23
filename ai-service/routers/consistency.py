from fastapi import APIRouter, Depends
from schemas.models import ConsistencyRequest, ConsistencyResponse
from services.matcher import check
from utils.security import require_service_token

router = APIRouter(prefix="/v1", dependencies=[Depends(require_service_token)])


@router.post("/consistency", response_model=ConsistencyResponse)
def consistency(req: ConsistencyRequest):
    return ConsistencyResponse(findings=check(req))
