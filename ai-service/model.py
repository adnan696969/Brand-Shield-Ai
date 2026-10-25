"""
Phishing-style URL analysis: typo-domain checks (difflib) + LogisticRegression on engineered features.
Returns SAFE | FAKE | SUSPICIOUS with score 0–100 and human-readable reasons.
"""

from __future__ import annotations

import difflib
import os
import re
import urllib.parse
from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_DATASET_PATH = os.path.join(_BASE_DIR, "dataset.csv")

# Popular brands for homoglyph / typo squatting checks
BRAND_NAMES = ["google", "amazon", "facebook", "paypal"]

SUSPICIOUS_KEYWORDS = ("login", "bank", "verify", "secure")

_model_pipeline: Pipeline | None = None

_TYPO_RATIO_THRESHOLD = 0.8


def _normalize_host(url: str) -> str:
    url = (url or "").strip()
    if not url:
        return ""
    parsed = urllib.parse.urlparse(url if "://" in url else "https://" + url)
    host = (parsed.netloc or "").lower()
    if not host and parsed.path:
        host = parsed.path.split("/")[0].lower()
    if ":" in host:
        host = host.split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    return host


def _primary_label(host: str) -> str:
    """First DNS label (rough; good enough for brand typo checks)."""
    if not host or "." not in host:
        return host
    return host.split(".")[0]


def check_typo_domain(url: str) -> tuple[bool, list[str]]:
    """
    Detect possible typo-squatting vs BRAND_NAMES using SequenceMatcher.
    If similarity > threshold and label is not an exact brand match → suspicious.
    """
    host = _normalize_host(url)
    if not host:
        return False, []

    main = _primary_label(host)
    if not main:
        return False, []

    reasons: list[str] = []
    for brand in BRAND_NAMES:
        ratio = difflib.SequenceMatcher(None, main, brand).ratio()
        if ratio > _TYPO_RATIO_THRESHOLD and main != brand:
            reasons.append(
                f"Typo domain detected: '{main}' closely resembles '{brand}' "
                f"(similarity {ratio:.0%})"
            )
            return True, reasons
    return False, []


def extract_ml_features(url: str) -> list[float]:
    """
    Numeric feature vector for sklearn (same logic used at train and predict time).
    Order must stay stable.
    """
    url = (url or "").strip()
    if not url:
        raise ValueError("URL is empty")

    parsed = urllib.parse.urlparse(url if "://" in url else "https://" + url)
    low = url.lower()

    length = float(len(url))
    has_https = 1.0 if parsed.scheme == "https" else 0.0
    has_login = 1.0 if "login" in low else 0.0
    has_bank = 1.0 if "bank" in low else 0.0
    has_verify = 1.0 if "verify" in low else 0.0
    has_secure = 1.0 if "secure" in low else 0.0

    num_dots = float(url.count("."))
    num_digits = float(sum(1 for c in url if c.isdigit()))
    # Non-alphanumeric excluding common URL punctuation
    allowed = set("./:-_%?#&=@+")
    num_special = float(
        sum(1 for c in url if not c.isalnum() and c not in allowed)
    )

    typo_flag = 1.0 if check_typo_domain(url)[0] else 0.0

    return [
        length,
        has_https,
        has_login,
        has_bank,
        has_verify,
        has_secure,
        num_dots,
        num_digits,
        num_special,
        typo_flag,
    ]


FEATURE_NAMES = [
    "length",
    "has_https",
    "has_login",
    "has_bank",
    "has_verify",
    "has_secure",
    "num_dots",
    "num_digits",
    "num_special",
    "typo_flag",
]


def _keyword_reasons(url: str) -> list[str]:
    low = url.lower()
    found = [kw for kw in SUSPICIOUS_KEYWORDS if kw in low]
    if not found:
        return []
    return [f"Suspicious keywords found: {', '.join(found)}"]


def _load_and_train() -> None:
    global _model_pipeline

    df = pd.read_csv(_DATASET_PATH)
    if "url" not in df.columns or "result" not in df.columns:
        raise ValueError("dataset.csv must have columns: url, result")

    X_list: list[list[float]] = []
    y_list: list[int] = []

    for _, row in df.iterrows():
        u = str(row["url"]).strip()
        label = str(row["result"]).strip().upper()
        if label not in ("SAFE", "FAKE"):
            continue
        feats = extract_ml_features(u)
        X_list.append(feats)
        y_list.append(1 if label == "FAKE" else 0)

    X = np.asarray(X_list, dtype=float)
    y = np.asarray(y_list, dtype=int)

    if len(np.unique(y)) < 2:
        raise ValueError("dataset must contain both SAFE and FAKE examples")

    pipe = Pipeline(
        [
            ("scaler", StandardScaler()),
            (
                "clf",
                LogisticRegression(
                    max_iter=3000,
                    random_state=42,
                    class_weight="balanced",
                    solver="lbfgs",
                ),
            ),
        ]
    )
    pipe.fit(X, y)
    _model_pipeline = pipe


def _ensure_trained() -> None:
    if _model_pipeline is None:
        _load_and_train()


def _verdict_from_score(fake_prob_percent: int) -> str:
    if fake_prob_percent > 70:
        return "FAKE"
    if fake_prob_percent < 30:
        return "SAFE"
    return "SUSPICIOUS"


def predict_url(url: str) -> dict[str, Any]:
    """
    Combine typo-domain rules + ML probabilities.
    Typo-domain match forces FAKE. Otherwise SAFE / FAKE / SUSPICIOUS from score bands.
    """
    _ensure_trained()
    assert _model_pipeline is not None

    url = (url or "").strip()
    if not url:
        raise ValueError("URL is empty")

    typo_hit, typo_reasons = check_typo_domain(url)
    feats = extract_ml_features(url)
    X = np.asarray([feats], dtype=float)

    proba = _model_pipeline.predict_proba(X)[0]
    # Binary: classes_ [0, 1] → columns [P(SAFE), P(FAKE)]
    classes = list(_model_pipeline.named_steps["clf"].classes_)
    fake_idx = classes.index(1) if 1 in classes else 1
    fake_prob = float(proba[fake_idx])
    score = int(round(fake_prob * 100))
    score = max(0, min(100, score))

    reasons: list[str] = []

    if typo_hit:
        reasons.extend(typo_reasons)
        reasons.append("High-confidence rule: typo / look-alike brand domain")
        result = "FAKE"
        score = max(score, 92)
        kw = _keyword_reasons(url)
        reasons.extend(kw)
        return {"result": result, "score": score, "reasons": reasons}

    verdict = _verdict_from_score(score)

    kw = _keyword_reasons(url)
    reasons.extend(kw)

    if score > 70:
        reasons.append(f"High ML risk score ({score}% fake probability)")
    elif score < 30:
        reasons.append(f"Low ML risk score ({score}% fake probability)")
    else:
        reasons.append(
            f"Elevated but uncertain ML risk ({score}% fake probability) - marked SUSPICIOUS"
        )

    reasons.append("ML model: logistic regression on URL structure + keyword features")

    if not kw and verdict == "SAFE":
        reasons.append("No strong keyword or typo-domain signals detected")

    return {
        "result": verdict,
        "score": score,
        "reasons": reasons,
    }
