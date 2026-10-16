# Karmayogi Bharat — AI-Powered Skill Intelligence Platform

Karmayogi Bharat is a prototype skill-intelligence and learning platform designed to help officials identify competency gaps, discover relevant learning resources, and check their understanding through AI-generated assessments.

The project brings together semantic competency matching, role-based skill-gap analysis, course recommendations, and document-based quiz generation. It is being developed as a prototype for Smart India Hackathon 2026.

## Features

- **Competency analysis:** Uses `sentence-transformers/all-MiniLM-L6-v2` through ONNX Runtime to match evidence from a text-based PDF resume against competency descriptions.
- **Role-based skill gaps:** Compares the assessment with the selected role's competency requirements.
- **Course recommendations:** Ranks learning resources against the identified gaps.
- **Document-based quizzes:** Ingests PDF content, retrieves relevant passages, and uses Google Gemini to generate MCQs with answers and explanations.
- **Learner records:** Supports registration/login and quiz-history endpoints.
- **External-service integration points:** PostgreSQL for application data, Qdrant for vector search, and Inngest for workflow orchestration.
- **Web interface:** HTML, CSS, and JavaScript frontend with learner and administrator views.

> **Prototype note:** The bundled course catalogue is sample data. It should not be presented as a verified list of live iGOT Karmayogi or NSSTA courses. The current project is not an official iGOT integration; production API access and credentials would be needed for that.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, JavaScript |
| API | Python, FastAPI |
| Competency NLP | `sentence-transformers/all-MiniLM-L6-v2`, ONNX Runtime |
| Document processing | pypdf, LlamaIndex |
| Generative AI | Google Gemini |
| Relational database | PostgreSQL, SQLAlchemy |
| Vector database | Qdrant |
| Workflow orchestration | Inngest |

## Project Structure

```text
.
├── index.html             # Main web interface
├── styles.css             # Frontend styles
├── app.js                 # Frontend interactions and API calls
├── data.js                # Prototype dashboard/course data
├── main.py                # FastAPI app and API endpoints
├── competency.py          # MiniLM-based competency analysis
├── recommendation.py      # Skill-gap-based course ranking
├── data_loader.py         # Document chunking and Gemini embeddings
├── vetor_db.py            # Qdrant collection and vector operations
├── database.py            # SQLAlchemy models and database setup
├── auth.py                # Password hashing and JWT helpers
├── customtypes.py         # Pydantic response schemas
├── download_minilm.py     # Downloads the ONNX model files
├── requirements.txt       # Python dependencies
└── .env                   # Local secrets (create this; do not commit)
```

## Requirements

- Python 3.11 or a compatible Python version supported by the installed dependencies
- PostgreSQL database
- Qdrant instance (local or cloud)
- Google Gemini API key
- Inngest credentials if using the Inngest workflow
- Internet access for the first model download

## Local Setup

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd <repository-folder>
```

### 2. Create and activate a virtual environment

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install dependencies

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Configure environment variables

Create a `.env` file in the project root. Use the variable names expected by the code in your current version. Typical settings include:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
QDRANT_URL=https://YOUR-CLUSTER-URL
QDRANT_API_KEY=YOUR_QDRANT_API_KEY
GOOGLE_API_KEY=YOUR_GEMINI_API_KEY
```

The exact Gemini and Inngest variable names should match the names read in `main.py` and `data_loader.py`. Never commit real credentials or production secrets.

Make sure the PostgreSQL database exists and that the database URL is reachable from your machine.

### 5. Download the MiniLM ONNX files

```bash
python download_minilm.py
```

The script downloads the model/tokenizer files into the expected `models/all-MiniLM-L6-v2` directory. The model files are not bundled in the source ZIP, so this step is required before using resume competency analysis.

### 6. Start the API

```bash
uvicorn main:app --reload
```

Open the FastAPI documentation at:

```text
http://127.0.0.1:8000/docs
```

Open `index.html` through a local static server for frontend testing. The frontend API base URL must point to the FastAPI server during local development.

## Main API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Register an account |
| `POST` | `/api/auth/login` | Log in |
| `POST` | `/api/quiz/save` | Save quiz results |
| `GET` | `/api/quiz/history/{employee_id}` | Retrieve quiz history |
| `POST` | `/api/upload` | Upload a PDF for document ingestion |
| `POST` | `/api/generate-quiz` | Generate a quiz from retrieved document content |
| `GET` | `/api/competency/roles` | List supported assessment roles |
| `GET` | `/api/competency/health` | Check competency model readiness |
| `POST` | `/api/analyze-resume` | Analyze a PDF resume and return gaps/recommendations |

Check `/docs` for the request fields and response schemas exposed by the running version.

## How Competency Analysis Works

1. The user selects a target role and uploads a text-based PDF resume.
2. The backend extracts text from the PDF.
3. MiniLM encodes the resume evidence and competency descriptions.
4. The competency engine estimates which competencies are supported by the evidence.
5. Role requirements are compared with the assessment to identify potential gaps.
6. The recommendation engine ranks sample learning resources that cover those gaps.

The result is a prototype estimate, not a validated or authoritative employee appraisal. Scanned PDFs may not work unless OCR is added. Semantic similarity alone does not prove proficiency; real deployment would require transparent scoring rules, representative validation data, and human review.

## RAG and Quiz Generation

The document workflow extracts and splits uploaded PDF content into chunks, creates embeddings, stores vectors in Qdrant, and retrieves relevant passages when a quiz is requested. Google Gemini then generates questions grounded in the retrieved context.

**Embedding models must be consistent.** The current RAG pipeline uses Gemini embeddings and the Qdrant collection is configured for 3072-dimensional vectors. The MiniLM competency model produces 384-dimensional vectors and is a separate pipeline. Do not change one pipeline's model without updating its vector dimensions and recreating or migrating the corresponding Qdrant collection.

## Deployment Notes: Vercel

The frontend can be hosted on Vercel, and FastAPI can be deployed using Vercel's Python runtime with an appropriate entry point and routing configuration. However, do not assume the repository will deploy unchanged.

Before deploying:

1. Add a Vercel-compatible FastAPI entry point and routing configuration.
2. Replace any hard-coded `http://127.0.0.1:8000` frontend API URL with the deployed API path or backend URL.
3. Configure database, Qdrant, Gemini, and Inngest secrets as Vercel environment variables.
4. Verify that the selected Python dependencies, function package size, execution duration, and model files fit the current Vercel limits.
5. Test MiniLM cold starts and memory usage. If bundling the ONNX model is too large or slow, use a compatible quantized ONNX model or host inference separately.
6. Use managed PostgreSQL and Qdrant Cloud rather than services running only on your development machine.

Serverless functions have execution and filesystem constraints. Treat this section as a deployment checklist, not a claim that Vercel deployment has already been verified.

## Security and Production Readiness

This is a prototype and needs additional work before handling real employee records:

- Restrict CORS to the required frontend origin.
- Store secrets only in environment variables.
- Review authentication, token expiry, authorization, and password-hashing configuration.
- Enforce file-size/type limits and validate uploads.
- Add rate limits, structured logging, monitoring, and database migrations.
- Apply role-based access control and avoid exposing one employee's data to another.
- Validate competency scoring with domain experts and representative data.
- Confirm privacy, retention, accessibility, and government security requirements before production use.

## Project Status

Prototype for Smart India Hackathon 2026. Course recommendations, dashboard metrics, and employee examples may contain mock data. The project is intended to demonstrate a workflow and should not be described as an official government platform or a production integration with iGOT unless that integration has been implemented and authorized.

## License

MIT License 2026. Team-Sub_zer0.
