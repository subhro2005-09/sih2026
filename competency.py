"""
competency.py
NLP-based competency assessment engine for MoSPI & Govt Statistical Cadres.
Runs ONNX Runtime locally without PyTorch or Gemini API calls.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Mapping, Sequence

import numpy as np
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from transformers import AutoTokenizer

logger = logging.getLogger("uvicorn")

DEFAULT_MODEL_DIR = Path("models/all-MiniLM-L6-v2")
EMBEDDING_DIMENSION = 384
MAX_SEQUENCE_LENGTH = 256
DEFAULT_MATCH_THRESHOLD = 0.40

DEFAULT_SCORE_THRESHOLDS = {
    5: 0.80,
    4: 0.70,
    3: 0.60,
    2: 0.50,
    1: 0.40,
}

# Master MoSPI Competency Matrix (33 Competencies across 4 Pillars)
COMPETENCIES: Mapping[str, str] = {
    # Statistical
    "Survey Design": "Design and methodology of statistical surveys, questionnaire design, survey planning and implementation.",
    "Sampling": "Statistical sampling methods, sampling design, sample selection and estimation.",
    "National Accounts": "National accounts, GDP estimation, economic aggregates and national economic accounting.",
    "Price Statistics": "Price statistics, price indices, CPI, WPI, inflation measurement and price data analysis.",
    "Labour Statistics": "Labour statistics, employment, unemployment, workforce and labour market indicators.",
    "Agricultural Statistics": "Agricultural statistics, crop statistics, agricultural surveys and agricultural data analysis.",
    "Industrial Statistics": "Industrial statistics, industrial production, manufacturing statistics and industrial data analysis.",
    "SDG Indicators": "Sustainable Development Goal indicators, SDG measurement, monitoring and statistical reporting.",
    "Metadata Standards": "Statistical metadata, metadata standards, dataset documentation and statistical data description.",
    "Data Quality Frameworks": "Statistical data quality, validation, accuracy, consistency, completeness and quality assurance frameworks.",

    # Technical
    "Python": "Python programming, Python scripting, data analysis and Python-based data processing.",
    "R": "R programming, statistical computing and data analysis using R.",
    "SQL": "SQL programming, relational databases, database querying and structured data management.",
    "Stata": "Stata statistical software and statistical data analysis.",
    "SPSS": "SPSS statistical software and statistical data analysis.",
    "SAS": "SAS programming, statistical analysis and data processing.",
    "GIS": "Geographic Information Systems, spatial data analysis and geographic visualization.",
    "Data Visualization": "Data visualization, dashboards, charts and visual presentation of statistical data.",
    "AI/ML": "Artificial intelligence, machine learning, predictive modelling, classification and regression.",
    "Cloud Computing": "Cloud computing, cloud infrastructure, cloud platforms and cloud-based applications.",
    "APIs": "Application Programming Interfaces, REST APIs, system integration and data exchange.",
    "Open Data": "Open government data, open datasets, data publishing and open data platforms.",

    # Digital Governance
    "Cybersecurity": "Cybersecurity, information security, secure systems, security controls and protection of digital systems.",
    "Data Privacy": "Data privacy, DPDP Act, protection of personal information, privacy controls and responsible data handling.",
    "Digital Signatures": "Digital signatures, electronic authentication and digitally signed documents.",
    "Government Cloud": "Government cloud infrastructure, MeghRaj, government cloud platforms and secure public-sector cloud services.",
    "Digital Public Infrastructure": "Digital Public Infrastructure, DPI, interoperable public digital platforms and digital government systems.",

    # Behavioural / Managerial
    "Leadership": "Leadership, team management, strategic leadership and leading organizational initiatives.",
    "Communication": "Professional communication, written communication, presentations and stakeholder communication.",
    "Project Management": "Project planning, execution, monitoring, resource management and project coordination.",
    "Ethics": "Professional ethics, integrity, responsible decision making and ethical conduct.",
    "Decision Making": "Decision making, analytical reasoning, problem solving and evidence-based decisions.",
    "Change Management": "Change management, organizational transformation, technology adoption and organizational change."
}

@dataclass(frozen=True)
class CompetencyResult:
    competency: str
    similarity: float
    score: float
    level: str
    evidence: List[str]

@dataclass(frozen=True)
class SkillGap:
    competency: str
    current_score: float
    required_score: float
    gap: float
    priority: str

class MiniLMEncoder:
    def __init__(self, model_dir: Path | str = DEFAULT_MODEL_DIR) -> None:
        self.model_dir = Path(model_dir)
        model_path = self.model_dir / "model.onnx"

        # Auto-download ONNX model files from Hugging Face if missing on deployment server
        if not model_path.exists():
            logger.info(f"ONNX model missing at {model_path}. Downloading from Hugging Face...")
            self.model_dir.mkdir(parents=True, exist_ok=True)
            
            hf_hub_download(
                repo_id="Xenova/all-MiniLM-L6-v2",
                filename="onnx/model.onnx",
                local_dir=self.model_dir
            )
            
            # Re-locate file if placed inside a nested 'onnx' subfolder by hf_hub_download
            nested_path = self.model_dir / "onnx" / "model.onnx"
            if nested_path.exists():
                nested_path.rename(model_path)

        # Download or load Hugging Face Tokenizer files
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(str(self.model_dir))
        except Exception:
            logger.info("Tokenizer files missing locally. Fetching tokenizer from Hugging Face...")
            self.tokenizer = AutoTokenizer.from_pretrained("Xenova/all-MiniLM-L6-v2")
            self.tokenizer.save_pretrained(str(self.model_dir))

        # Set CPU thread limits for serverless compatibility
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 1
        opts.inter_op_num_threads = 1
        self.session = ort.InferenceSession(str(model_path), sess_options=opts, providers=["CPUExecutionProvider"])

    @staticmethod
    def _mean_pool(token_embeddings: np.ndarray, attention_mask: np.ndarray) -> np.ndarray:
        mask = attention_mask[..., np.newaxis].astype(np.float32)
        summed = np.sum(token_embeddings * mask, axis=1)
        counts = np.clip(np.sum(mask, axis=1), a_min=1e-9, a_max=None)
        return summed / counts

    @staticmethod
    def _normalize(embeddings: np.ndarray) -> np.ndarray:
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        return embeddings / np.clip(norms, a_min=1e-12, a_max=None)

    def encode(self, texts: Sequence[str]) -> np.ndarray:
        if not texts:
            return np.empty((0, EMBEDDING_DIMENSION), dtype=np.float32)

        clean_texts = [re.sub(r"\s+", " ", t.replace("\x00", " ")).strip() for t in texts]
        inputs = self.tokenizer(clean_texts, padding=True, truncation=True, max_length=MAX_SEQUENCE_LENGTH, return_tensors="np")
        
        ort_inputs = {
            k: v.astype(np.int64) 
            for k, v in inputs.items() 
            if k in {"input_ids", "attention_mask", "token_type_ids"}
        }

        outputs = self.session.run(None, ort_inputs)
        embeddings = self._mean_pool(outputs[0], inputs["attention_mask"])
        return self._normalize(embeddings).astype(np.float32)

class CompetencyEngine:
    def __init__(self, encoder: MiniLMEncoder, competencies: Mapping[str, str] = COMPETENCIES) -> None:
        self.encoder = encoder
        self.competencies = dict(competencies)
        self._competency_names = list(self.competencies.keys())
        self._competency_embeddings = self.encoder.encode(list(self.competencies.values()))

    @staticmethod
    def extract_evidence(resume_text: str, max_evidence: int = 100) -> List[str]:
        if not resume_text:
            return []
        lines = re.split(r"[\n\r]+", resume_text.replace("\x00", " "))
        evidence = []
        for line in lines:
            cleaned = re.sub(r"^[\s•●▪▸\-–—]+", "", line)
            cleaned = re.sub(r"\s+", " ", cleaned).strip()
            if len(cleaned) >= 15:
                evidence.append(cleaned)
            if len(evidence) >= max_evidence:
                break
        return evidence

    def analyze(self, resume_text: str) -> Dict:
        evidence = self.extract_evidence(resume_text)
        if not evidence:
            raise ValueError("No valid text lines found in resume.")

        evidence_embeddings = self.encoder.encode(evidence)
        similarity_matrix = evidence_embeddings @ self._competency_embeddings.T

        results: List[CompetencyResult] = []
        for idx, competency in enumerate(self._competency_names):
            scores = similarity_matrix[:, idx]
            top_indices = np.argsort(scores)[-3:][::-1]
            best_sim = float(scores[top_indices[0]])

            # Calculate 1-5 score
            score = 0.0
            for s, thresh in sorted(DEFAULT_SCORE_THRESHOLDS.items(), reverse=True):
                if best_sim >= thresh:
                    score = float(s)
                    break

            level = "Advanced" if score >= 5 else "Upper Intermediate" if score >= 4 else "Intermediate" if score >= 3 else "Basic" if score >= 2 else "Beginner" if score >= 1 else "Not Evidenced"
            matched_evidence = [evidence[i] for i in top_indices if scores[i] >= DEFAULT_MATCH_THRESHOLD]

            results.append(CompetencyResult(competency=competency, similarity=round(best_sim, 4), score=score, level=level, evidence=matched_evidence))

        results.sort(key=lambda x: x.similarity, reverse=True)
        return {
            "model": "all-MiniLM-L6-v2",
            "competency_count": len(results),
            "competencies": [{"competency": r.competency, "similarity": r.similarity, "score": r.score, "level": r.level, "evidence": r.evidence} for r in results]
        }

    def calculate_gaps(self, assessment: Mapping, required_competencies: Mapping[str, float]) -> List[Dict]:
        current_scores = {item["competency"]: float(item["score"]) for item in assessment["competencies"]}
        gaps = []

        for competency, req_score in required_competencies.items():
            req_score = float(np.clip(req_score, 0, 5))
            cur_score = current_scores.get(competency, 0.0)
            gap = max(req_score - cur_score, 0.0)
            priority = "High" if gap >= 3 else "Medium" if gap >= 2 else "Low" if gap > 0 else "None"

            gaps.append(SkillGap(competency=competency, current_score=cur_score, required_score=req_score, gap=gap, priority=priority))

        gaps.sort(key=lambda x: x.gap, reverse=True)
        return [{"competency": g.competency, "current_score": g.current_score, "required_score": g.required_score, "gap": g.gap, "priority": g.priority} for g in gaps]

_engine: CompetencyEngine | None = None

def get_competency_engine(model_dir: Path | str = DEFAULT_MODEL_DIR) -> CompetencyEngine:
    global _engine
    if _engine is None:
        _engine = CompetencyEngine(encoder=MiniLMEncoder(model_dir=model_dir))
    return _engine

def analyze_resume_gaps(resume_text: str, required_competencies: Mapping[str, float]) -> Dict:
    engine = get_competency_engine()
    assessment = engine.analyze(resume_text)
    gaps = engine.calculate_gaps(assessment, required_competencies)
    return {"assessment": assessment, "skill_gaps": gaps}
