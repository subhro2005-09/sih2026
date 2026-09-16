from typing import List, Optional
import pydantic

class RAGchunkandsrc(pydantic.BaseModel):
    chunk: List[str]
    source_id: Optional[str] = None

class RAGUpsertresult(pydantic.BaseModel):
    inngest: int

class RAGSearchresult(pydantic.BaseModel):
    context: List[str]
    source: List[str]

class MCQItem(pydantic.BaseModel):
    question: str = pydantic.Field(description="Question stem")
    options: List[str] = pydantic.Field(description="List of exactly 4 choices")
    answer: int = pydantic.Field(description="Index of correct choice (0, 1, 2, or 3)")
    explanation: str = pydantic.Field(description="Contextual explanation for why this answer is correct")
    difficulty: str = pydantic.Field(description="Basic, Intermediate, or Advanced")
    competency: str = pydantic.Field(description="Competency domain e.g. Statistical Methodology")

class MCQQuizResponse(pydantic.BaseModel):
    quiz: List[MCQItem]