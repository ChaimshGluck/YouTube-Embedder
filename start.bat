@echo off
echo Starting local server...
start "" http://localhost:3010
node "%~dp0server.js"
