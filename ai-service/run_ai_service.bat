@echo off
setlocal
cd /d "%~dp0"

set "VENV_PY=%~dp0..\.venv\Scripts\python.exe"
if exist "%VENV_PY%" (
  echo Using project venv: %VENV_PY%
  "%VENV_PY%" -m pip install -r "%~dp0requirements.txt"
  if errorlevel 1 exit /b 1
  "%VENV_PY%" "%~dp0ai_model.py"
) else (
  echo No ..\.venv found — using system Python. Create a venv at repo root for consistency.
  python -m pip install -r "%~dp0requirements.txt"
  if errorlevel 1 exit /b 1
  python "%~dp0ai_model.py"
)
