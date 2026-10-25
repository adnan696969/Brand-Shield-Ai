// api.js - Handlers for communicating with the Spring Boot Backend API

const API_BASE = "http://localhost:8080/api";

function parseStoredUser() {
    try {
        const raw = localStorage.getItem("brandshield_user");
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/** True when a session with a valid user id exists (required for /api/detect). */
function isLoggedIn() {
    const u = parseStoredUser();
    return u != null && u.userId != null && String(u.userId).trim() !== "";
}

async function apiCall(endpoint, method = "GET", body = null) {
    const headers = {
        Accept: "application/json",
        "Content-Type": "application/json"
    };

    const user = parseStoredUser();
    if (user != null && user.userId != null && user.userId !== "") {
        headers["X-User-Id"] = String(user.userId);
    }

    const options = {
        method,
        headers
    };

    if (body != null && method !== "GET" && method !== "HEAD") {
        options.body = JSON.stringify(body);
    }

    let response;
    try {
        response = await fetch(`${API_BASE}${endpoint}`, options);
    } catch (err) {
        throw new Error(
            "Failed to reach the API at " +
                API_BASE +
                ". Is the Spring Boot backend running on port 8080?"
        );
    }

    const text = await response.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            throw new Error(
                response.ok
                    ? "Invalid JSON from server"
                    : `Server error (${response.status}): ${text.slice(0, 120)}`
            );
        }
    }

    if (!response.ok) {
        const msg =
            (data && (data.error || data.message)) ||
            `Request failed (${response.status})`;
        if (response.status === 401) {
            const err = new Error(msg);
            err.status = 401;
            throw err;
        }
        throw new Error(msg);
    }

    return data;
}

const DETECT_LOADING_MESSAGES = {
    WEBSITE: "Analyzing website…",
    SOCIAL_MEDIA: "Analyzing social media profile…",
    PRODUCT: "Analyzing product link…"
};

function getDetectLoadingMessage(sourceType) {
    const key = (sourceType || "WEBSITE").toUpperCase();
    return DETECT_LOADING_MESSAGES[key] || DETECT_LOADING_MESSAGES.WEBSITE;
}

function historyPatternKey(url) {
    const u = String(url || "")
        .toLowerCase()
        .replace(/^https?:\/\//, "");
    const parts = u.match(/[a-z0-9]{4,}/g) || [];
    return [...new Set(parts)].sort().join("|").slice(0, 200);
}

/** Rows that share a fingerprint with another non-SAFE scan (Symmetric AI / repeat patterns). */
function computeRepeatPatternIndices(history) {
    const byKey = new Map();
    history.forEach((item, i) => {
        const k = historyPatternKey(item.url);
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k).push(i);
    });
    const highlight = new Set();
    byKey.forEach((indices) => {
        if (indices.length < 2) return;
        const anyBad = indices.some((i) => {
            const r = String(history[i].result || "").toUpperCase();
            return r === "FAKE" || r === "SUSPICIOUS";
        });
        if (anyBad) indices.forEach((i) => highlight.add(i));
    });
    return highlight;
}

function formatSourceTypeLabel(type) {
    if (!type) return "";
    const t = String(type).toUpperCase();
    const map = {
        WEBSITE: "Website",
        SOCIAL_MEDIA: "Social media",
        PRODUCT: "Product link"
    };
    return map[t] || type;
}

/**
 * POST /api/detect — body: { url, sourceType? }
 */
async function detectUrl(url, sourceType) {
    if (!isLoggedIn()) {
        alert("Please login first");
        window.location.href = "auth.html";
        throw new Error("Authentication required");
    }

    const trimmed = (url || "").trim();
    const st = sourceType ? String(sourceType).trim().toUpperCase() : "WEBSITE";
    const payload = { url: trimmed, sourceType: st };

    console.debug("[BrandShield] POST /api/detect", {
        url: `${API_BASE}/detect`,
        headers: { "Content-Type": "application/json" },
        body: payload
    });

    const data = await apiCall("/detect", "POST", payload);

    console.debug("[BrandShield] /api/detect response:", data);
    if (data != null) {
        console.debug("[BrandShield] parsed fields:", {
            type: data.sourceType || data.type,
            result: data.result,
            score: data.score,
            reasons: data.reasons
        });
    }

    return data;
}

// Setup Auth Forms
function setupAuthForms() {
    const loginForm = document.getElementById("form-login");
    const signupForm = document.getElementById("form-signup");

    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = document.getElementById("login-email").value;
            const password = document.getElementById("login-password").value;
            const errorP = document.getElementById("login-error");
            
            try {
                const btn = loginForm.querySelector('button');
                btn.textContent = "Logging in...";
                btn.disabled = true;
                
                const data = await apiCall("/auth/login", "POST", { email, password });

                const session = {
                    userId: data.userId,
                    name: data.name,
                    email: data.email,
                    message: data.message
                };
                localStorage.setItem("brandshield_user", JSON.stringify(session));
                window.location.href = "dashboard.html";
            } catch (error) {
                errorP.textContent = error.message;
            } finally {
                const btn = loginForm.querySelector('button');
                btn.textContent = "Login";
                btn.disabled = false;
            }
        });
    }

    if (signupForm) {
        signupForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("signup-name").value;
            const email = document.getElementById("signup-email").value;
            const password = document.getElementById("signup-password").value;
            const errorP = document.getElementById("signup-error");
            
            try {
                const btn = signupForm.querySelector('button');
                btn.textContent = "Signing up...";
                btn.disabled = true;
                
                const data = await apiCall("/auth/signup", "POST", { name, email, password });
                
                // Switch to login tab
                alert("Signup successful! Please login.");
                switchAuthTab('login');
                document.getElementById('login-email').value = email;
            } catch (error) {
                errorP.textContent = error.message;
            } finally {
                const btn = signupForm.querySelector('button');
                btn.textContent = "Sign Up";
                btn.disabled = false;
            }
        });
    }
}

/** Enable or disable the detection UI based on login state (index page). */
function applyDetectionFormAuthState() {
    const detectForm = document.getElementById("detect-form");
    const urlInput = document.getElementById("url-input");
    const sourceSelect = document.getElementById("detect-source-type");
    const btn = document.getElementById("btn-analyze");
    const box = document.querySelector(".detection-box");
    const notice = document.getElementById("detection-auth-notice");
    if (!detectForm || !urlInput || !btn) return;

    const ok = isLoggedIn();
    urlInput.disabled = !ok;
    if (sourceSelect) sourceSelect.disabled = !ok;
    btn.disabled = !ok;
    detectForm.classList.toggle("detect-form--disabled", !ok);
    if (box) box.classList.toggle("detection-box--locked", !ok);
    if (notice) notice.classList.toggle("hidden", ok);
}

// Setup Detection form inside Index page
function setupDetectionForm() {
    const detectForm = document.getElementById("detect-form");
    if (!detectForm) return;

    applyDetectionFormAuthState();

    detectForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!isLoggedIn()) {
            alert("Please login first");
            window.location.href = "auth.html";
            applyDetectionFormAuthState();
            return;
        }

        const urlInput = document.getElementById("url-input").value;
        const sourceSelect = document.getElementById("detect-source-type");
        const selectedType = sourceSelect ? sourceSelect.value : "WEBSITE";

        const loadingWrap = document.getElementById("loading-wrap");
        const loadingText = loadingWrap
            ? loadingWrap.querySelector(".loading-text")
            : null;
        const loading = document.getElementById("loading");
        const resultBox = document.getElementById("result-box");
        const btn = document.getElementById("btn-analyze");

        if (loadingText) {
            loadingText.textContent = getDetectLoadingMessage(selectedType);
        }

        const symBannerReset = document.getElementById("symmetric-ai-banner");
        if (symBannerReset) {
            symBannerReset.textContent = "";
            symBannerReset.classList.add("hidden");
        }

        // UI Reset
        if (loadingWrap) {
            loadingWrap.classList.remove("hidden");
            loadingWrap.setAttribute("aria-busy", "true");
        } else if (loading) {
            loading.classList.remove("hidden");
        }
        resultBox.classList.add("hidden");
        resultBox.className = "result-box hidden"; // Reset classes
        btn.disabled = true;
        
        try {
            const data = await detectUrl(urlInput, selectedType);
            if (!data || data.result == null) {
                throw new Error("Invalid detection response from server");
            }

            const detectedType =
                data.sourceType != null && data.sourceType !== ""
                    ? String(data.sourceType).trim()
                    : data.type != null
                      ? String(data.type).trim()
                      : "";
            const typeLine = document.getElementById("result-source-type");
            if (typeLine) {
                if (detectedType) {
                    typeLine.textContent = `Detected type: ${formatSourceTypeLabel(detectedType)} (pattern-based)`;
                    typeLine.classList.remove("hidden");
                } else {
                    typeLine.textContent = "";
                    typeLine.classList.add("hidden");
                }
            }

            const symBanner = document.getElementById("symmetric-ai-banner");
            if (symBanner) {
                const sym = data.symmetricAi;
                if (sym && Number(sym.prior_matches) > 0) {
                    const boost = sym.score_boost != null ? sym.score_boost : sym.scoreBoost;
                    symBanner.textContent = `Symmetric AI (learn): ${sym.prior_matches} similar past detection(s) influenced this score (+${boost} risk).`;
                    symBanner.classList.remove("hidden");
                } else {
                    symBanner.textContent = "";
                    symBanner.classList.add("hidden");
                }
            }

            const resultLabel = String(data.result).trim().toUpperCase();
            const scoreVal =
                data.score != null && data.score !== ""
                    ? Math.max(0, Math.min(100, Number(data.score)))
                    : 0;
            const reasons = Array.isArray(data.reasons) ? data.reasons : [];

            const resultHeading = document.getElementById("result-text");
            resultHeading.textContent = resultLabel;
            resultHeading.classList.remove(
                "result-label-safe",
                "result-label-fake",
                "result-label-suspicious"
            );
            if (resultLabel === "FAKE") {
                resultHeading.classList.add("result-label-fake");
            } else if (resultLabel === "SUSPICIOUS") {
                resultHeading.classList.add("result-label-suspicious");
            } else {
                resultHeading.classList.add("result-label-safe");
            }

            const scoreValueEl = document.getElementById("score-value");
            if (scoreValueEl) {
                scoreValueEl.textContent = String(scoreVal);
            } else {
                const fallback = document.querySelector("#score-indicator span");
                if (fallback) fallback.textContent = String(scoreVal);
            }

            const barFill = document.getElementById("score-bar-fill");
            if (barFill) {
                barFill.style.width = `${scoreVal}%`;
                barFill.classList.remove(
                    "score-bar-fill--safe",
                    "score-bar-fill--suspicious",
                    "score-bar-fill--fake"
                );
                if (resultLabel === "FAKE") {
                    barFill.classList.add("score-bar-fill--fake");
                } else if (resultLabel === "SUSPICIOUS") {
                    barFill.classList.add("score-bar-fill--suspicious");
                } else {
                    barFill.classList.add("score-bar-fill--safe");
                }
            }

            const reasonsList = document.getElementById("reasons-list");
            reasonsList.innerHTML = "";
            if (reasons.length > 0) {
                reasons.forEach((r) => {
                    const li = document.createElement("li");
                    li.textContent = r != null ? String(r) : "";
                    reasonsList.appendChild(li);
                });
            } else {
                const li = document.createElement("li");
                li.textContent = "No explanations returned.";
                reasonsList.appendChild(li);
            }

            resultBox.classList.remove("result-safe", "result-fake", "result-suspicious");
            if (resultLabel === "FAKE") {
                resultBox.classList.add("result-fake");
            } else if (resultLabel === "SUSPICIOUS") {
                resultBox.classList.add("result-suspicious");
            } else {
                resultBox.classList.add("result-safe");
            }

            if (resultLabel === "FAKE" || (resultLabel === "SUSPICIOUS" && scoreVal >= 50)) {
                alert("Potential fake detected");
            }

            if (loadingWrap) {
                loadingWrap.classList.add("hidden");
                loadingWrap.setAttribute("aria-busy", "false");
            } else if (loading) {
                loading.classList.add("hidden");
            }
            resultBox.classList.remove("hidden");
            resultBox.classList.add("fade-in-up", "visible"); // Triggers animation dynamically
            
        } catch (error) {
            if (error.status === 401 || /authentication/i.test(error.message || "")) {
                alert("Please login first");
                window.location.href = "auth.html";
            } else {
                alert(`Error analyzing URL: ${error.message}`);
            }
            if (loadingWrap) {
                loadingWrap.classList.add("hidden");
                loadingWrap.setAttribute("aria-busy", "false");
            } else if (loading) {
                loading.classList.add("hidden");
            }
        } finally {
            btn.disabled = false;
            if (!isLoggedIn()) applyDetectionFormAuthState();
        }
    });
}

// Load Dashboard History
async function loadDashboardHistory() {
    const tbody = document.getElementById("history-body");
    const user = parseStoredUser();

    if (!user || !tbody) return;

    try {
        const history = await apiCall("/history", "GET");

        if (!Array.isArray(history)) {
            throw new Error("Unexpected response from server");
        }

        if (history.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #888;">No scans performed yet. <br><a href="index.html#detection"style="color:var(--accent-gold);text-decoration:underline;">Run your first scan</a></td></tr>`;
            return;
        }

        tbody.innerHTML = "";

        const repeatRows = computeRepeatPatternIndices(history);

        // Prepare chart data optionally
        let safeCount = 0;
        let fakeCount = 0;
        let suspiciousCount = 0;

        history.forEach((item, index) => {
            const row = document.createElement("tr");
            if (repeatRows.has(index)) {
                row.classList.add("history-row-repeat-pattern");
                row.title = "Repeated URL pattern seen before with a non-safe verdict (Symmetric AI)";
            }
            const date = new Date(item.timestamp).toLocaleString();
            const res = String(item.result || "").toUpperCase();
            let badgeClass = "badge-fake";
            if (res === "SAFE") badgeClass = "badge-safe";
            else if (res === "SUSPICIOUS") badgeClass = "badge-suspicious";

            const typeLabel = formatSourceTypeLabel(item.sourceType || "WEBSITE");
            const repeatTag = repeatRows.has(index)
                ? '<span class="repeat-pattern-tag" title="Matches another scan fingerprint">Repeat pattern</span>'
                : "";

            row.innerHTML = `
                <td><div style="max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.url}">${item.url}</div>${repeatTag}</td>
                <td><span class="history-type">${typeLabel}</span></td>
                <td><span class="badge ${badgeClass}">${item.result}</span></td>
                <td><strong>${item.score}</strong>/100</td>
                <td>${date}</td>
            `;
            tbody.appendChild(row);

            if (res === "SAFE") safeCount++;
            else if (res === "SUSPICIOUS") suspiciousCount++;
            else fakeCount++;
        });

        // Init Chart if canvas exists (avoid stacking charts on re-fetch)
        const ctx = document.getElementById("overviewChart");
        if (ctx && window.Chart) {
            const existing = typeof Chart.getChart === "function" ? Chart.getChart(ctx) : null;
            if (existing) {
                existing.destroy();
            }
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['SAFE', 'SUSPICIOUS', 'FAKE'],
                    datasets: [{
                        data: [safeCount, suspiciousCount, fakeCount],
                        backgroundColor: ['#2ECC71', '#e67e22', '#E74C3C'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    cutout: '70%',
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }

    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #E74C3C;">Failed to load history: ${error.message}</td></tr>`;
    }
}
