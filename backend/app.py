import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .model_service import CLASSES
from .pipeline import LAYER_WEIGHTS, RISK_THRESHOLD, AnalysisPipeline
from .schemas import AnalysisResponse, EmailInput


app = FastAPI(title="MailDesk Multi-layer AI Defense API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8000", "http://localhost:8000"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
pipeline = AnalysisPipeline()
ROOT = Path(__file__).resolve().parents[1]


@app.get("/health")
def health():
    return {"status": "ok", "framework": "multi-layer", "version": "1.0"}


@app.get("/framework")
def framework():
    return {
        "name": "MailDesk multi-layer AI email defense",
        "version": "1.0",
        "categories": list(CLASSES),
        "models": [
            "logistic_regression",
            "random_forest",
            "xgboost",
            "neural_classifier",
            "isolation_forest",
            "ollama_llama3.2",
        ],
        "layers": list(LAYER_WEIGHTS),
        "weights": LAYER_WEIGHTS,
        "risk_threshold": RISK_THRESHOLD,
        "limitations": [
            "Bootstrap data is synthetic demonstration data, not thesis evidence.",
            "Attachment inspection is static and size-limited; it is not a malware sandbox.",
            "Zero-day capability is represented by anomaly detection and requires independent unseen-data validation.",
        ],
    }


@app.get("/evaluation")
def evaluation():
    report_path = ROOT / "reports" / "bootstrap_evaluation.json"
    if not report_path.exists():
        raise HTTPException(status_code=404, detail="Run python -m backend.evaluate first")
    return json.loads(report_path.read_text(encoding="utf-8"))


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze(email: EmailInput, use_ollama: bool = Query(default=True)):
    return await pipeline.analyze(email, use_ollama=use_ollama)
