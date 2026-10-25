import sys

from flask import Flask, request, jsonify
from flask_cors import CORS

try:
    from multi_source_analyzer import analyze_input
except ModuleNotFoundError as e:
    msg = e.name or str(e)
    sys.stderr.write(
        "\n=== BrandShield AI service: missing module ===\n"
        f"Import error: {msg}\n\n"
        "Run from ai-service folder:\n"
        "  python ai_model.py\n"
        "============================================================\n\n"
    )
    raise SystemExit(1) from e

app = Flask(__name__)
CORS(app)


@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json(silent=True)
        if not data or not isinstance(data, dict):
            return jsonify({"error": "Request body must be JSON"}), 400
        if "url" not in data or data.get("url") is None:
            return jsonify({"error": "URL or input is required"}), 400

        raw = str(data["url"]).strip()
        if not raw:
            return jsonify({"error": "URL or input is required"}), 400

        hint = data.get("sourceType")
        if hint is not None:
            hint = str(hint).strip().upper() or None

        prior = data.get("priorScans")
        if isinstance(prior, list):
            prior_list = [x for x in prior if isinstance(x, dict)]
        else:
            prior_list = None

        out = analyze_input(raw, hint, prior_list)
        return jsonify(out), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
