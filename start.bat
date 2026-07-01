@echo off
chcp 65001 >nul
echo Starting local server on http://localhost:7000
echo מפעיל שרת מקומי - השאירו חלון זה פתוח
echo.
start "" http://localhost:7000/index.html
where python >nul 2>nul && (python -m http.server 7000 & goto :eof)
where py >nul 2>nul && (py -m http.server 7000 & goto :eof)
echo Python not found - install from python.org
pause
