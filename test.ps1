# Runs the calculation tests in headless Edge (no installs needed).
#   powershell -ExecutionPolicy Bypass -File .\test.ps1
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # E:\Other\dostlar
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$tmp = Join-Path $env:TEMP 'dostlar-test'
New-Item -ItemType Directory -Force $tmp | Out-Null
$srv = Start-Process python -ArgumentList '-m', 'http.server', '8765', '--bind', '127.0.0.1' -WorkingDirectory $root -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2
try {
    $dom = & $edge --headless=new --disable-gpu --no-proxy-server --virtual-time-budget=8000 "--user-data-dir=$tmp\profile" --dump-dom 'http://127.0.0.1:8765/mobile/pwa/test/test.html' 2>$null | Out-String
} finally { Stop-Process $srv.Id }
$text = [System.Net.WebUtility]::HtmlDecode([regex]::Match($dom, '<pre id="out">([\s\S]*?)=====PARITY').Groups[1].Value)
Write-Host $text
if ($text -match 'FAIL' -or $text -notmatch 'PASS') { Write-Host 'TESTS FAILED' -ForegroundColor Red; exit 1 }
Write-Host 'All tests passed' -ForegroundColor Green
