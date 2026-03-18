@echo off
title MicStream — Сборка APK
color 0A
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   MicStream — Сборка Android APK     ║
echo  ╚══════════════════════════════════════╝
echo.
echo  Требования:
echo   - Node.js  (https://nodejs.org)
echo   - Android Studio  (https://developer.android.com/studio)
echo   - JDK 17+
echo.
echo  Шаги:

cd /d "%~dp0android"

echo  [1/4] Установка Capacitor...
call npm install
if errorlevel 1 ( echo  Ошибка & pause & exit /b 1 )

echo  [2/4] Инициализация Android проекта...
call npx cap init MicStream com.micstream.phone --web-dir app/src/main/assets/public
call npx cap add android
if errorlevel 1 ( echo  Ошибка добавления Android & pause & exit /b 1 )

echo  [3/4] Синхронизация файлов...
call npx cap sync android

echo  [4/4] Открытие Android Studio...
echo  В Android Studio: Build ^> Build APK(s)
call npx cap open android

echo.
echo  После сборки APK будет в:
echo  android\android\app\build\outputs\apk\debug\app-debug.apk
echo.
pause
