from typing import Literal, Optional

from pydantic import BaseModel


class ScrapeItemResult(BaseModel):
    index: int
    card: str
    status: Literal["success", "error"]
    data: Optional[dict] = None
    error_code: Optional[str] = None
    message: Optional[str] = None
    duration_ms: int


class ScrapeResponse(BaseModel):
    success: bool = True
    results: list[ScrapeItemResult]
    total_duration_ms: int


class ErrorResponse(BaseModel):
    success: bool = False
    error_code: str
    message: str
