@echo off
setlocal
title Tarkov Task Reader
pushd "%~dp0"
if errorlevel 1 goto directoryError

where node >nul 2>&1
if errorlevel 1 goto nodeError
node -e "const [major,minor]=process.versions.node.split('.').map(Number); process.exit(major>22 || (major===22 && minor>=13) ? 0 : 1)"
if errorlevel 1 goto nodeError
where npm.cmd >nul 2>&1
if errorlevel 1 goto npmError

if not exist "node_modules\cheerio\package.json" goto install
if not exist "node_modules\sanitize-html\package.json" goto install
goto launch

:install
echo Installing dependencies...
call npm ci
if errorlevel 1 goto installError

:launch
echo Starting Tarkov Task Reader...
echo Open the local URL printed below in your browser.
echo Keep this window open. Press Ctrl+C to stop the server.
echo.
call npm start
if errorlevel 1 goto startError
popd
exit /b 0

:nodeError
echo Node.js 22.13 or newer is required. Node.js 24 LTS is recommended.
echo Install it from https://nodejs.org/ and then run this file again.
goto fail

:npmError
echo npm was not found. Reinstall Node.js with npm included, then try again.
goto fail

:installError
echo Dependency installation failed. Check the error above and your internet connection.
goto fail

:startError
echo The server could not start or stopped unexpectedly. Check the error above.
echo If the port is already in use, stop the other reader or change PORT in .env.
goto fail

:directoryError
echo Could not open the application folder.
pause
exit /b 1

:fail
popd
echo.
pause
exit /b 1
