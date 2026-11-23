import hmac
from pathlib import Path
from fastapi import Header, HTTPException
import config


def require_service_token(x_service_token: str = Header(default="")) -> None:
    """Only the Node backend (shared secret over the internal network) may call this service."""
    if not config.SERVICE_TOKEN:
        if config.ALLOW_NO_TOKEN:
            return
        raise HTTPException(503, detail={"code": "SERVICE_NOT_CONFIGURED", "message": "AI_SERVICE_TOKEN is not set"})
    if not hmac.compare_digest(x_service_token.encode(), config.SERVICE_TOKEN.encode()):
        raise HTTPException(401, detail={"code": "UNAUTHORIZED", "message": "Invalid service token"})


def safe_path(file_path: str) -> Path:
    """Resolve a storage key / path inside UPLOAD_ROOT only (no traversal, no absolute escapes)."""
    p = (config.UPLOAD_ROOT / file_path).resolve() if not Path(file_path).is_absolute() else Path(file_path).resolve()
    if config.UPLOAD_ROOT != p and config.UPLOAD_ROOT not in p.parents:
        raise HTTPException(400, detail={"code": "BAD_PATH", "message": "Path is outside the upload root"})
    if not p.is_file():
        raise HTTPException(404, detail={"code": "FILE_NOT_FOUND", "message": "File not found"})
    if p.stat().st_size > config.MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(413, detail={"code": "FILE_TOO_LARGE", "message": "File exceeds the processing limit"})
    return p
