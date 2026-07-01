@echo off
REM Sobe um servidor estatico para servir o app (index.html) e a pasta swipe/ juntos.
REM Nao e backend. Necessario porque file:// bloqueia o video local em alguns navegadores.
cd /d "%~dp0"
echo.
echo Pulsar Social Media Agente
echo Abra em: http://localhost:8000/
echo Pressione Ctrl+C para parar.
echo.
python -m http.server 8000
