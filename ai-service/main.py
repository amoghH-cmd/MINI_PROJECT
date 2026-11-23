from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from routers import consistency, documents, tender
from services import ocr

app = FastAPI(title="Bid Compliance AI Service", version="0.1.0",
              description="Stateless extraction/matching service. Proposes; never decides. Never writes to MongoDB.")
app.include_router(documents.router)
app.include_router(tender.router)
app.include_router(consistency.router)


@app.get("/health")
def health():
    return {"status": "ok", "ocrAvailable": ocr.available()}


# Same error envelope as the Node API: { error: { code, message } }
@app.exception_handler(HTTPException)
async def http_exc(_: Request, exc: HTTPException):
    d = exc.detail if isinstance(exc.detail, dict) else {"code": "ERROR", "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content={"error": d})


@app.exception_handler(RequestValidationError)
async def val_exc(_: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": {"code": "VALIDATION_FAILED", "message": "Invalid request",
                        "fields": [{"path": ".".join(map(str, e["loc"][1:])), "message": e["msg"]} for e in exc.errors()]}})
