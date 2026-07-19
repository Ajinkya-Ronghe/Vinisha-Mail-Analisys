from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class AttachmentInput(BaseModel):
    name: str
    mime_type: str = "application/octet-stream"
    size: int = 0
    data_base64: Optional[str] = None


class EmailInput(BaseModel):
    message_id: str = ""
    sender_name: str = ""
    sender_email: str = ""
    recipient: str = ""
    subject: str = ""
    body: str = ""
    headers: Dict[str, str] = Field(default_factory=dict)
    attachments: List[AttachmentInput] = Field(default_factory=list)


class LayerResult(BaseModel):
    score: float = Field(ge=0, le=1)
    findings: List[str] = Field(default_factory=list)


class AnalysisResponse(BaseModel):
    suspicious: bool
    category: str
    confidence: float = Field(ge=0, le=1)
    risk_score: float = Field(ge=0, le=1)
    reason: str
    indicators: List[str]
    layers: Dict[str, LayerResult]
    model_scores: Dict[str, float]
    framework_version: str = "1.0"

