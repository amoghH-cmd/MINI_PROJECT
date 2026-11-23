from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class ProcessRequest(BaseModel):
    filePath: str
    docId: str
    declaredCategory: Optional[str] = None


class Field_(BaseModel):
    fieldName: str
    rawValue: str
    normalizedValue: Optional[str] = None
    confidence: float = Field(ge=0, le=1)
    page: int                                  # 1-based
    bbox: Optional[list[float]] = None         # [x0, y0, x1, y1] in PDF points; None when the text could not be located (never invented)
    pageSize: Optional[list[float]] = None     # [width, height] in points
    method: str                                # 'regex' | 'label' | 'ocr+regex' ...
    attrs: dict[str, Any] = {}


class ProcessResponse(BaseModel):
    docId: str
    docType: str
    classifyConfidence: float
    classifyBasis: list[str] = []              # which keywords decided it, for explainability
    pageCount: int
    ocrPages: list[int] = []
    ocrConfidence: Optional[float] = None
    lowConfidence: bool = False
    fields: list[Field_] = []
    pdfSignals: dict[str, Any] = {}
    warnings: list[str] = []


class TenderExtractRequest(BaseModel):
    filePath: str
    tenderId: str


class Candidate(BaseModel):
    code: str
    type: str
    description: str
    rule: dict[str, Any]
    mandatory: bool = True
    sourcePage: int
    text: str
    confidence: float = Field(ge=0, le=1)
    needsOfficerInput: bool = False


class TenderExtractResponse(BaseModel):
    tenderId: str
    pageCount: int
    candidates: list[Candidate]
    warnings: list[str] = []


class ConsistencyField(BaseModel):
    docId: str
    docType: str
    fieldName: str
    rawValue: str = ""
    normalizedValue: Optional[str] = None


class OrgProfile(BaseModel):
    legalName: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    address: Optional[str] = None


class ConsistencyRequest(BaseModel):
    fields: list[ConsistencyField]
    orgProfile: Optional[OrgProfile] = None


class Finding(BaseModel):
    type: str
    fieldA: dict[str, Any]
    fieldB: dict[str, Any]
    score: float
    verdict: Literal["MATCH", "PROBABLE_MATCH", "MISMATCH", "INSUFFICIENT_DATA"]
    explanation: str


class ConsistencyResponse(BaseModel):
    findings: list[Finding]
