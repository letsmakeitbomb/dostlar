# Serves the app on this PC: open http://localhost:8080 in Chrome or Edge.
#   powershell -ExecutionPolicy Bypass -File .\serve.ps1
# Stop with Ctrl+C. (Uses the Python that is already installed.)
Set-Location $PSScriptRoot
Write-Host 'Dostlar is running at http://localhost:8080  (Ctrl+C to stop)' -ForegroundColor Green
Start-Process 'http://localhost:8080'
python -m http.server 8080 --bind 127.0.0.1
