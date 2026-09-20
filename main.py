import os
import time
import uuid
import shutil
import logging
import tempfile
from pathlib import Path
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from dotenv import load_dotenv

# 1. Load environment variables FIRST before any DB or API client initializes
load_dotenv()

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, status, Response
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
import inngest
import inngest.fast_api
from google import genai

from competency import analyze_resume_gaps
from customtypes import RAGchunkandsrc, RAGUpsertresult, MCQQuizResponse
from data_loader import load_and_chunk_pdf, embed_text
from vetor_db import QdrantStorage
from database import get_db, init_db, Employee, Base
from auth import hash_password, verify_password, create_access_token

BASE_DIR = Path(__file__).resolve().parent

# Write to OS temporary directory (safe for Vercel/AWS Lambda serverless instances)
UPLOAD_DIR = Path(tempfile.gettempdir()) / "uploaded_docs"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# 2. Database Models for Quiz History
class QuizHistory(Base):
    __tablename__ = "quiz_history"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, index=True)
    topic = Column(String)
    score = Column(Integer)
    total_questions = Column(Integer)
    percentage = Column(Float)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

# 3. Lifespan & App Setup
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_db()
        print("PostgreSQL connected and tables verified.")
    except Exception as e:
        print(f"Warning: Could not initialize database on startup: {e}")
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 4. Clients
ai_client = genai.Client(api_key=os.environ.get("API_KEY", ""))
inngest_client = inngest.Inngest(
    app_id="resume_reviewer",
    logger=logging.getLogger("uvicorn"),
    is_production=False,
    serializer=inngest.PydanticSerializer()
)

# 5. Inngest Ingestion Workflow
@inngest_client.create_function(
    fn_id="Rag PDF",
    trigger=inngest.TriggerEvent(event="rag_ingestpdf")
)
async def rag_ingestpdf(ctx: inngest.Context):
    def _load(ctx: inngest.Context) -> RAGchunkandsrc:
        pdf_path = ctx.event.data["pdf_path"]
        source_id = ctx.event.data.get("source_id", pdf_path)
        chunks = load_and_chunk_pdf(pdf_path)
        return RAGchunkandsrc(chunk=chunks, source_id=source_id)

    def _upsert(chunk_and_src: RAGchunkandsrc) -> RAGUpsertresult:
        chunks = chunk_and_src.chunk
        source_id = chunk_and_src.source_id
        vecs = embed_text(chunks)
        ids = [str(uuid.uuid5(uuid.NAMESPACE_URL, f"{source_id}:{i}")) for i in range(len(chunks))]
        payload = [{"source": source_id, "text": chunks[i]} for i in range(len(chunks))]
        QdrantStorage().upsert(ids, vecs, payload)
        return RAGUpsertresult(inngest=len(chunks))

    chunk_and_src = await ctx.step.run("load-and-chunk", lambda: _load(ctx), output_type=RAGchunkandsrc)
    ingested = await ctx.step.run("embed-upsert", lambda: _upsert(chunk_and_src), output_type=RAGUpsertresult)
    return ingested.model_dump()

inngest.fast_api.serve(app, inngest_client, [rag_ingestpdf])

# 6. REST API Schemas & Authentication Endpoints
class EmployeeRegister(BaseModel):
    email: EmailStr
    password: str
    years_of_experience: int

class EmployeeLogin(BaseModel):
    email: EmailStr
    password: str

class QuizResultCreate(BaseModel):
    employee_id: int
    topic: str
    score: int
    total_questions: int

@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register_employee(data: EmployeeRegister, db: Session = Depends(get_db)):
    try:
        existing = db.query(Employee).filter(Employee.email == data.email).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email is already registered."
            )

        hashed = hash_password(data.password)

        new_emp = Employee(
            email=data.email,
            hashed_password=hashed,
            years_of_experience=data.years_of_experience,
        )
        db.add(new_emp)
        db.commit()
        db.refresh(new_emp)

        return {
            "status": "success",
            "message": "Employee registered successfully",
            "employee_id": new_emp.id,
            "email": new_emp.email,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logging.error(f"Registration failure: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}"
        )

@app.post("/api/auth/login")
def login_employee(data: EmployeeLogin, db: Session = Depends(get_db)):
    emp = db.query(Employee).filter(Employee.email == data.email).first()
    if not emp or not verify_password(data.password, emp.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password. User record not found."
        )

    token = create_access_token(
        data={"sub": emp.email, "experience": emp.years_of_experience}
    )

    return {
        "status": "success",
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": emp.id,
            "email": emp.email,
            "years_of_experience": emp.years_of_experience,
            "created_at": emp.created_at.strftime("%Y-%m-%d") if emp.created_at else "N/A"
        }
    }

# 7. Quiz Persistence Endpoints
@app.post("/api/quiz/save")
def save_quiz_result(data: QuizResultCreate, db: Session = Depends(get_db)):
    pct = round((data.score / data.total_questions) * 100, 1) if data.total_questions > 0 else 0.0
    record = QuizHistory(
        employee_id=data.employee_id,
        topic=data.topic,
        score=data.score,
        total_questions=data.total_questions,
        percentage=pct
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"status": "success", "quiz_id": record.id, "percentage": pct}

@app.get("/api/quiz/history/{employee_id}")
def get_quiz_history(employee_id: int, db: Session = Depends(get_db)):
    records = db.query(QuizHistory).filter(QuizHistory.employee_id == employee_id).order_by(QuizHistory.timestamp.desc()).all()
    return [
        {
            "id": r.id,
            "topic": r.topic,
            "score": f"{r.score}/{r.total_questions}",
            "percentage": r.percentage,
            "date": r.timestamp.strftime("%d %b %Y, %I:%M %p")
        }
        for r in records
    ]

# 8. RAG Document Indexing & Assessment Generation
@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_path = UPLOAD_DIR / file.filename
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        await file.close()

    chunks = load_and_chunk_pdf(str(file_path))
    if not chunks:
        raise HTTPException(status_code=400, detail="Could not extract text from PDF.")

    vecs = embed_text(chunks)
    ids = [str(uuid.uuid5(uuid.NAMESPACE_URL, f"{file.filename}:{i}")) for i in range(len(chunks))]
    payload = [{"source": file.filename, "text": chunks[i]} for i in range(len(chunks))]

    storage = QdrantStorage()
    storage.upsert(ids, vecs, payload)

    return {
        "status": "ok",
        "message": f"{file.filename} processed: {len(chunks)} chunks embedded and stored in Qdrant."
    }

@app.post("/api/generate-quiz")
async def generate_quiz(topic: str = Form("General Assessment")):
    try:
        query_vectors = embed_text([topic])
        if not query_vectors:
            raise HTTPException(status_code=500, detail="Failed to create embedding for topic.")
        query_vector = query_vectors[0]

        storage = QdrantStorage()
        search_res = storage.search(query_vector=query_vector, top_k=4)
        contexts = search_res.get("context", [])

        if not contexts:
            raise HTTPException(
                status_code=400,
                detail="No indexed document found in Qdrant. Please upload a PDF first."
            )

        context_str = "\n\n---\n\n".join(contexts)
        prompt = f"""
        You are an expert exam designer for capacity building.
        Generate a 3-question Multiple Choice Quiz based strictly and ONLY on the context below.
        Topic Focus: {topic}

        Context:
        {context_str}
        """

        # Fallback Gemini models
        models_to_try = [
            "gemini-2.5-flash",
            "gemini-2.0-flash",
        ]

        response = None
        last_error = None

        for m in models_to_try:
            for attempt in range(3):
                try:
                    response = ai_client.models.generate_content(
                        model=m,
                        contents=prompt,
                        config={
                            "response_mime_type": "application/json",
                            "response_schema": MCQQuizResponse,
                            "temperature": 0.2,
                        },
                    )
                    if response and response.parsed:
                        break
                except Exception as model_err:
                    last_error = model_err
                    err_str = str(model_err).lower()

                    if any(code in err_str for code in ["503", "429", "unavailable", "resource_exhausted"]):
                        logging.warning(f"Model {m} busy (attempt {attempt + 1}/3): {model_err}. Retrying...")
                        time.sleep(1.5 * (2 ** attempt))
                        continue

                    break

            if response and response.parsed:
                break

        if not response or not response.parsed:
            logging.error(f"All model attempts exhausted. Final error: {last_error}")
            raise HTTPException(
                status_code=503,
                detail="AI service is currently busy handling high demand. Please retry in a few seconds."
            )

        return response.parsed.model_dump()

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error generating quiz: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# 9. Competency Analysis Endpoint
TARGET_CADRE_REQUIREMENTS = {
    "Survey Design": 5.0,
    "Sampling": 5.0,
    "National Accounts": 4.0,
    "Price Statistics": 4.0,
    "Labour Statistics": 4.0,
    "Python": 4.0,
    "R": 3.0,
    "SQL": 4.0,
    "Data Visualization": 4.0,
    "AI/ML": 3.0,
    "Cybersecurity": 3.0,
    "Data Privacy": 4.0,
    "Project Management": 4.0
}

@app.post("/api/analyze-resume")
async def api_analyze_resume(file: UploadFile = File(...)):
    """Extracts text from an uploaded PDF resume and analyzes skill gaps using ONNX MiniLM."""
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF resumes are supported.")

    file_path = UPLOAD_DIR / file.filename
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        chunks = load_and_chunk_pdf(str(file_path))
        if not chunks:
            raise HTTPException(status_code=400, detail="Could not extract text from PDF resume.")

        full_resume_text = "\n".join(chunks)

        # Execute ONNX competency engine
        gap_results = analyze_resume_gaps(
            resume_text=full_resume_text,
            required_competencies=TARGET_CADRE_REQUIREMENTS
        )

        return {
            "status": "success",
            "filename": file.filename,
            "overall_competencies_detected": len(gap_results["assessment"]["competencies"]),
            "top_matched_skills": gap_results["assessment"]["competencies"][:5],
            "identified_skill_gaps": gap_results["skill_gaps"]
        }
    except Exception as e:
        logging.error(f"Error analyzing resume competency: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await file.close()

# 10. Frontend Static Asset Routes
@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)

@app.get("/", include_in_schema=False)
@app.get("/index.html", include_in_schema=False)
def serve_index():
    index_file = BASE_DIR / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=404, detail=f"index.html not found in {BASE_DIR}")
    return FileResponse(str(index_file))

@app.get("/styles.css", include_in_schema=False)
def serve_css():
    return FileResponse(str(BASE_DIR / "styles.css"))

@app.get("/app.js", include_in_schema=False)
def serve_js():
    return FileResponse(str(BASE_DIR / "app.js"))

@app.get("/data.js", include_in_schema=False)
def serve_data():
    return FileResponse(str(BASE_DIR / "data.js"))
