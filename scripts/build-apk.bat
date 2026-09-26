@echo off
REM ساخت APK در ویندوز با یک دستور (نیازمند Node.js، JDK 21 و Android SDK)
REM اجرا از پوشه پروژه:
REM   scripts\build-apk.bat            => APK دیباگ (app-debug.apk)
REM   scripts\build-apk.bat release    => APK نسخه Release امضاشده (apartemant-release.apk)
REM برای release قبل از اجرا این متغیرها را تنظیم کنید (رمزها را در فایل‌های پروژه ننویسید):
REM   set ANDROID_KEYSTORE_PATH=D:\keys\apartemant-release.jks
REM   set ANDROID_KEYSTORE_PASSWORD=...
REM   set ANDROID_KEY_ALIAS=apartemant
REM   set ANDROID_KEY_PASSWORD=...        (اختیاری؛ پیش‌فرض همان رمز keystore)
setlocal
cd /d "%~dp0\.."

set MODE=%~1
if /i "%MODE%"=="release" (
  if "%ANDROID_KEYSTORE_PATH%"=="" goto :nokey
  if "%ANDROID_KEYSTORE_PASSWORD%"=="" goto :nokey
  if "%ANDROID_KEY_ALIAS%"=="" goto :nokey
)

call npm install || goto :error
call npm test || goto :error
call npm run build || goto :error
if not exist android (
  call npx cap add android || goto :error
)
call npx cap sync android || goto :error

cd android
if /i "%MODE%"=="release" (
  call gradlew.bat assembleRelease || goto :error
) else (
  call gradlew.bat assembleDebug || goto :error
)
cd ..

if /i "%MODE%"=="release" (
  call node scripts\sign-release.mjs --out apartemant-release.apk || goto :error
  echo.
  echo Signed release APK ready: %cd%\apartemant-release.apk
) else (
  echo.
  echo APK ready: %cd%\android\app\build\outputs\apk\debug\app-debug.apk
)
goto :eof

:nokey
echo.
echo Release build needs ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD and ANDROID_KEY_ALIAS (see README).
exit /b 1

:error
echo.
echo Build failed. See the messages above.
exit /b 1
