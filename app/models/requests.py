from pydantic import BaseModel, Field


class ScrapeItem(BaseModel):
    card: str = Field(..., min_length=1, description="Card number to look up")


class ScrapeRequest(BaseModel):
    items: list[ScrapeItem] = Field(..., min_length=1, description="List of cards to process")
