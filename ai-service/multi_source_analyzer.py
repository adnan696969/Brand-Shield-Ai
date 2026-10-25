"""
Multi-source pattern analysis (no external APIs): websites, social profiles, product links.
Auto-detects type from input; scores 0–100 with SAFE / SUSPICIOUS / FAKE bands.
"""

from __future__ import annotations

import re
import urllib.parse
from typing import Any, Iterable

# Suspicious tokens used for cross-scan pattern matching (Symmetric AI / Learn step)
_LEARN_TOKENS_WEB = frozenset(
    ("login", "verify", "secure", "bank", "account", "password", "wallet", "update")
)
_LEARN_TOKENS_SOCIAL = frozenset(("official", "real", "support", "verified", "helpdesk"))
_LEARN_TOKENS_PRODUCT = frozenset(("offer", "discount", "free", "deal", "winner", "claim", "gift"))

# --- Auto classification (TASK 2) ---
_SOCIAL_MARKERS = (
    "instagram.com",
    "twitter.com",
    "x.com",
    "tiktok.com",
    "facebook.com",
    "t.co/",
    "linkedin.com/in",
)
_PRODUCT_MARKERS = (
    "amazon.",
    "amazon.com",
    "amzn.to",
    "a.co/",
    "flipkart.",
    "flipkart.com",
)


def detect_input_type(text: str) -> str:
    low = text.lower().strip()
    for m in _SOCIAL_MARKERS:
        if m in low:
            return "SOCIAL_MEDIA"
    for m in _PRODUCT_MARKERS:
        if m in low:
            return "PRODUCT"
    return "WEBSITE"


def _cap_score(s: int) -> int:
    return max(0, min(100, s))


def _verdict(score: int) -> str:
    if score > 60:
        return "FAKE"
    if score < 30:
        return "SAFE"
    return "SUSPICIOUS"


def _extract_social_username(text: str) -> str:
    """Best-effort username from URL or raw handle."""
    t = text.strip()
    low = t.lower()
    if "://" in t or "." in t and "/" in t:
        p = urllib.parse.urlparse(t if "://" in t else "https://" + t)
        path = (p.path or "").strip("/")
        parts = [x for x in path.split("/") if x]
        # instagram.com/foo, twitter.com/foo/status/1 -> first segment often user
        skip = {"p", "reel", "stories", "share", "intent", "i", "status", "photo"}
        for seg in parts:
            if seg.lower() not in skip and not seg.isdigit():
                return seg.lstrip("@")
        host = (p.netloc or "").lower()
        if host:
            return host.split(":")[0]
    return t.lstrip("@")


def _analyze_website(text: str) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    raw = text.strip()
    low = raw.lower()

    p = urllib.parse.urlparse(raw if "://" in raw else "https://" + raw)
    if p.scheme != "https":
        score += 28
        reasons.append("Website: not using HTTPS")

    if len(raw) > 60:
        score += 18
        reasons.append(f"Website: long URL ({len(raw)} characters)")

    keywords = ("login", "verify", "secure", "bank")
    hits = [k for k in keywords if k in low]
    if hits:
        score += min(40, 12 * len(hits))
        reasons.append(f"Website: suspicious keywords: {', '.join(hits)}")

    if re.search(r"\d{4,}", raw):
        score += 12
        reasons.append("Website: long digit sequence in URL (possible noise)")

    if score == 0:
        reasons.append("Website: no strong negative URL patterns detected")

    return _cap_score(score), reasons


def _analyze_social(text: str) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    user = _extract_social_username(text).lower()
    if not user:
        reasons.append("Social: could not parse username; scored conservatively")
        return 45, reasons

    suspicious = ("official", "real", "support", "helpdesk", "verified")
    found = [w for w in suspicious if w in user]
    if found:
        score += min(35, 14 * len(found))
        reasons.append(f"Social: impersonation-prone words in handle: {', '.join(found)}")

    digits = sum(c.isdigit() for c in user)
    if digits >= 3:
        score += 28
        reasons.append(f"Social: many digits in username ({digits}) - common in fake accounts")
    elif digits >= 1 and "official" in user:
        score += 30
        reasons.append('Social: "official" combined with numbers in username')

    if len(user) > 24:
        score += 18
        reasons.append(f"Social: unusually long username ({len(user)} chars)")

    if re.fullmatch(r"[a-z0-9._-]+", user) is None:
        score += 15
        reasons.append("Social: unusual characters in username")

    if not reasons:
        reasons.append("Social: handle looks relatively normal")

    return _cap_score(score), reasons


def _analyze_product(text: str) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    raw = text.strip()
    low = raw.lower()

    promo = ("offer", "discount", "free", "deal", "winner", "claim")
    ph = [w for w in promo if w in low]
    if ph:
        score += min(45, 14 * len(ph))
        reasons.append(f"Product link: promotional / scam-prone words: {', '.join(ph)}")

    p = urllib.parse.urlparse(raw if "://" in raw else "https://" + raw)
    host = (p.netloc or "").lower()
    legit = ("amazon.", "flipkart.", "amzn.")
    if host and not any(x in host for x in legit) and ("product" in low or "dp/" in low or "/p/" in low):
        score += 35
        reasons.append("Product: marketplace-style path on non-marketplace host (possible fake listing)")

    if len(raw) > 95:
        score += 20
        reasons.append("Product: very long / messy URL")

    if raw.count("-") > 6 or raw.count("%") > 2:
        score += 15
        reasons.append("Product: cluttered URL structure")

    if not reasons:
        reasons.append("Product: no strong scam patterns in link text")

    return _cap_score(score), reasons


def _token_set(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]{2,}", text.lower()))


def _host_key(text: str) -> str:
    raw = text.strip()
    p = urllib.parse.urlparse(raw if "://" in raw else "https://" + raw)
    h = (p.netloc or "").lower().split(":")[0]
    if h.startswith("www."):
        h = h[4:]
    return h


def _risk_tokens_for_type(detected: str, text: str) -> set[str]:
    low = text.lower()
    if detected == "SOCIAL_MEDIA":
        return {t for t in _LEARN_TOKENS_SOCIAL if t in low} | _token_set(_extract_social_username(text))
    if detected == "PRODUCT":
        return {t for t in _LEARN_TOKENS_PRODUCT if t in low} | _token_set(low)
    return {t for t in _LEARN_TOKENS_WEB if t in low} | _token_set(low)


def _learning_adjustment(
    text: str,
    detected: str,
    base_score: int,
    prior_scans: Iterable[dict[str, Any]] | None,
) -> tuple[int, list[str], dict[str, Any]]:
    """
    Symmetric AI — Learn: boost score when current input resembles prior bad outcomes.
    """
    if not prior_scans:
        return base_score, [], {"prior_matches": 0, "score_boost": 0}

    cur_host = _host_key(text)
    cur_tokens = _token_set(text)
    cur_risk = _risk_tokens_for_type(detected, text)
    boost = 0
    match_notes: list[str] = []
    fake_hits = 0
    susp_hits = 0

    for entry in prior_scans:
        if not isinstance(entry, dict):
            continue
        prev_url = str(entry.get("url") or "").strip()
        if not prev_url:
            continue
        prev_result = str(entry.get("result") or "").strip().upper()
        prev_type_raw = str(entry.get("sourceType") or entry.get("type") or "").strip().upper()
        if prev_result not in ("FAKE", "SUSPICIOUS"):
            continue

        prev_detected = (
            prev_type_raw
            if prev_type_raw in ("WEBSITE", "SOCIAL_MEDIA", "PRODUCT")
            else detect_input_type(prev_url)
        )
        prev_host = _host_key(prev_url)
        prev_tokens = _token_set(prev_url)
        overlap = len(cur_tokens & prev_tokens)
        host_match = bool(cur_host and prev_host and cur_host == prev_host)
        type_match = prev_detected.upper() == detected.upper()
        prev_risk = _risk_tokens_for_type(prev_detected, prev_url)
        risk_overlap = len(cur_risk & prev_risk)

        similar = host_match or overlap >= 4 or (overlap >= 2 and type_match) or (
            risk_overlap >= 2 and type_match
        )
        if not similar:
            continue

        if prev_result == "FAKE":
            fake_hits += 1
            boost += 18 if host_match or overlap >= 4 else 12
            if risk_overlap >= 2:
                boost += 6
        else:
            susp_hits += 1
            boost += 8 if host_match or overlap >= 3 else 5

    boost = min(40, boost)
    if boost > 0:
        parts = []
        if fake_hits:
            parts.append(f"{fake_hits} prior FAKE")
        if susp_hits:
            parts.append(f"{susp_hits} prior SUSPICIOUS")
        match_notes.append(
            f"Symmetric AI (learn): similar pattern to {', '.join(parts)} - score raised by {boost}"
        )

    meta = {
        "prior_matches": fake_hits + susp_hits,
        "score_boost": boost,
        "fake_hits": fake_hits,
        "suspicious_hits": susp_hits,
    }
    new_score = _cap_score(base_score + boost)
    return new_score, match_notes, meta


def analyze_input(
    text: str,
    _user_selected_hint: str | None = None,
    prior_scans: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Run pattern analysis. `type` is always auto-detected from the input string.
    """
    text = (text or "").strip()
    if not text:
        raise ValueError("Input is empty")

    detected = detect_input_type(text)
    reasons: list[str] = [f"Detected source type: {detected} (pattern-based)"]

    if detected == "SOCIAL_MEDIA":
        s, r = _analyze_social(text)
    elif detected == "PRODUCT":
        s, r = _analyze_product(text)
    else:
        s, r = _analyze_website(text)

    reasons.extend(r)

    s2, learn_reasons, sym_meta = _learning_adjustment(text, detected, s, prior_scans)
    reasons.extend(learn_reasons)
    verdict = _verdict(s2)

    out: dict[str, Any] = {
        "type": detected,
        "result": verdict,
        "score": s2,
        "reasons": reasons,
        "symmetricAi": sym_meta,
    }
    return out
