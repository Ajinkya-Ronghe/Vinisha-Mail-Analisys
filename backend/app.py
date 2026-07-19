from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from .pipeline import AnalysisPipeline
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


@app.get("/health")
def health():
    return {"status": "ok", "framework": "multi-layer", "version": "1.0"}


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze(email: EmailInput, use_ollama: bool = Query(default=True)):
    return await pipeline.analyze(email, use_ollama=use_ollama)
