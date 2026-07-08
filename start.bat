@echo off
cd /d "%~dp0"
start http://127.0.0.1:5180
"C:\Users\chbon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" server.py
