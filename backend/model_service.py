import csv
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier

from .estimators import EncodedXGBoostClassifier

ROOT = Path(__file__).resolve().parents[1]
DATASET_PATH = ROOT / "data" / "bootstrap_emails.csv"
CLASSES = ("safe", "threat", "phishing", "malware")


class ModelService:
    """Small reproducible baseline ensemble. Replace its CSV with research data."""

    def __init__(self, dataset_path: Path = DATASET_PATH):
        texts, labels = load_dataset(dataset_path)
        self.vectorizer = TfidfVectorizer(
            lowercase=True,
            stop_words="english",
            ngram_range=(1, 2),
            min_df=1,
            max_features=4000,
            sublinear_tf=True,
        )
        matrix = self.vectorizer.fit_transform(texts)
        dense = matrix.toarray()
        self.models = {
            "logistic_regression": LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42),
            "random_forest": RandomForestClassifier(
                n_estimators=120, class_weight="balanced", random_state=42, min_samples_leaf=1
            ),
            "xgboost": EncodedXGBoostClassifier(n_estimators=100, max_depth=3, learning_rate=0.1),
            "neural_classifier": MLPClassifier(
                hidden_layer_sizes=(32,), max_iter=800, early_stopping=False, random_state=42
            ),
        }
        for model in self.models.values():
            model.fit(dense, labels)

        safe_matrix = dense[np.asarray(labels) == "safe"]
        self.anomaly = IsolationForest(n_estimators=100, contamination="auto", random_state=42)
        self.anomaly.fit(safe_matrix)

    def predict(self, subject: str, body: str) -> Tuple[Dict[str, float], Dict[str, float], float]:
        vector = self.vectorizer.transform([f"{subject}\n{body}"]).toarray()
        model_risks: Dict[str, float] = {}
        combined = {name: 0.0 for name in CLASSES}

        for model_name, model in self.models.items():
            probabilities = model.predict_proba(vector)[0]
            class_scores = dict(zip(model.classes_, probabilities))
            for class_name in CLASSES:
                combined[class_name] += float(class_scores.get(class_name, 0.0)) / len(self.models)
            model_risks[model_name] = 1.0 - float(class_scores.get("safe", 0.0))

        raw_anomaly = float(self.anomaly.decision_function(vector)[0])
        anomaly_score = float(1.0 / (1.0 + np.exp(8.0 * raw_anomaly)))
        return combined, model_risks, anomaly_score


def load_dataset(path: Path) -> Tuple[List[str], np.ndarray]:
    if not path.exists():
        raise FileNotFoundError(f"Training dataset not found: {path}")
    texts: List[str] = []
    labels: List[str] = []
    with path.open("r", encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            label = row["label"].strip().lower()
            if label not in CLASSES:
                raise ValueError(f"Unsupported label in bootstrap dataset: {label}")
            texts.append(f"{row['subject']}\n{row['body']}")
            labels.append(label)
    if len(set(labels)) != len(CLASSES):
        raise ValueError("Bootstrap dataset must contain all four classes")
    return texts, np.asarray(labels)
