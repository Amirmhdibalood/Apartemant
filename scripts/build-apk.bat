@echo off
REM ساخت APK دیباگ در ویندوز با یک دستور (نیازمند Node.js، JDK 21 و Android SDK)
REM اجرا از پوشه پروژه:  scripts\build-apk.bat
setlocal
cd /d "%~dp0\.."

call npm install || goto :error
call npm run build || goto :error
if not exist android (
  call npx cap add android || goto :error
)
call npx cap sync android || goto :error

cd android
call gradlew.bat assembleDebug || goto :error
cd ..

echo.
echo APK ready: %cd%\android\app\build\outputs\apk\debug\app-debug.apk
goto :eof

:error
echo.
echo Build failed. See the messages above.
exit /b 1
