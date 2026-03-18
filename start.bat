@echo off
title MicStream
cd /d "%~dp0"
if not exist "node_modules" (
  echo Установка зависимостей...
  npm install
)
npx electron .
