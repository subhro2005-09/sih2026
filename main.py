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

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, status
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
import torch
import torch.nn.functional as F
import inngest
import inngest.fast_api
from google import genai

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

# 8. RAG Document Indexing, Assessment Generation, & Resume Skill Gap Analysis
@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_path = UPLOAD_DIR / file.filename
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

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

# NEW ENDPOINT: Resume Skill Gap Analysis & iGOT Course Recommendation
TARGET_STATISTICAL_COMPETENCIES = [
    "Advanced Data Analytics and R Programming",
    "Machine Learning and AI Applications in Public Governance",
    "Sample Survey Methods and NSSO Design Standards",
    "National Accounts Aggregates and CPI/WPI Indexing",
    "Data Privacy Laws and Cybersecurity for Officials",
    "Public Sector Project Management and Decision Making"
]

FAKED_IGOT_CATALOGUE = [
    {
        "id": "IGOT-STAT-101",
        "title": "Advanced Data Analytics for Official Statistics",
        "provider": "NSSTA & iGOT Karmayogi",
        "competency": "Domain",
        "skills": ["R Programming", "Sample Survey", "Data Scrubbing"]
    },
    {
        "id": "IGOT-AI-202",
        "title": "Machine Learning Applications in Public Governance",
        "provider": "iGOT Karmayogi Bharat",
        "competency": "Domain",
        "skills": ["Python", "Predictive Analytics", "NLP"]
    },
    {
        "id": "IGOT-GOV-301",
        "title": "Jan Bhagidari & Public Service Delivery Excellence",
        "provider": "Karmayogi Academy",
        "competency": "Behavioral",
        "skills": ["Communication", "Empathy", "Citizen Service"]
    },
    {
        "id": "IGOT-STAT-404",
        "title": "National Sample Survey (NSS) Methodology & Standards",
        "provider": "NSSTA National Training Centre",
        "competency": "Functional",
        "skills": ["Sampling Design", "Survey Audit", "Indicator Calculation"]
    }
]

@app.post("/api/analyze-resume-gap")
async def analyze_resume_gap(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please upload a valid PDF resume.")

    file_path = UPLOAD_DIR / file.filename
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    chunks = load_and_chunk_pdf(str(file_path))
    if not chunks:
        raise HTTPException(status_code=400, detail="Could not extract text from uploaded resume PDF.")

    # Generate embeddings using existing embed_text helper
    resume_vecs = torch.tensor(embed_text(chunks))
    target_vecs = torch.tensor(embed_text(TARGET_STATISTICAL_COMPETENCIES))

    if resume_vecs.numel() == 0 or target_vecs.numel() == 0:
        raise HTTPException(status_code=500, detail="Failed to generate embeddings for comparison.")

    # Normalize vectors for cosine similarity
    resume_vecs = F.normalize(resume_vecs, p=2, dim=1)
    target_vecs = F.normalize(target_vecs, p=2, dim=1)

    similarity_matrix = torch.mm(target_vecs, resume_vecs.T)

    matched_competencies = []
    missing_gaps = []

    for idx, target_skill in enumerate(TARGET_STATISTICAL_COMPETENCIES):
        max_score, _ = torch.max(similarity_matrix[idx], dim=0)
        score = float(max_score.item())

        if score >= 0.65:
            matched_competencies.append({"competency": target_skill, "similarity_score": round(score, 2)})
        else:
            missing_gaps.append({"competency": target_skill, "similarity_score": round(score, 2)})

    # Map missing gaps to catalogue items
    course_texts = [c["title"] + " " + " ".join(c["skills"]) for c in FAKED_IGOT_CATALOGUE]
    course_vecs = F.normalize(torch.tensor(embed_text(course_texts)), p=2, dim=1)

    gap_names = [g["competency"] for g in missing_gaps]
    recommended_courses = []

    if gap_names and course_vecs.numel() > 0:
        gap_vecs = F.normalize(torch.tensor(embed_text(gap_names)), p=2, dim=1)
        gap_course_sim = torch.mm(gap_vecs, course_vecs.T)

        recommended_ids = set()
        for g_idx, gap_name in enumerate(gap_names):
            best_score, best_course_idx = torch.max(gap_course_sim[g_idx], dim=0)
            c_score = float(best_score.item())
            course = FAKED_IGOT_CATALOGUE[best_course_idx.item()]

            if course["id"] not in recommended_ids:
                recommended_ids.add(course["id"])
                recommended_courses.append({
                    "course_id": course["id"],
                    "title": course["title"],
                    "provider": course["provider"],
                    "competency": course["competency"],
                    "matched_for_gap": gap_name,
                    "relevance_score": round(c_score, 2)
                })

    readiness = round((len(matched_competencies) / len(TARGET_STATISTICAL_COMPETENCIES)) * 100, 1)

    return {
        "filename": file.filename,
        "readiness_score": f"{readiness}%",
        "matched_competencies": matched_competencies,
        "missing_gaps": missing_gaps,
        "recommended_courses": recommended_courses
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

        models_to_try = [
            "gemini-3.6-flash",
            "gemini-3.6-flash-8b",
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

# 9. Frontend Static Asset Routes
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
