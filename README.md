# 🎙️ MicStream — Нативное приложение

## Структура проекта
```
micstream-app/
  electron/          ← ПК приложение (EXE)
    src/
      main.js        ← Главный процесс Electron
      preload.js     ← Мост renderer ↔ main
    pc-ui/
      app.html       ← Интерфейс приложения
  android/           ← Android приложение (APK)
    app/src/main/assets/public/
      index.html     ← Интерфейс телефона
  BUILD_PC.bat       ← Собрать EXE
  BUILD_ANDROID.bat  ← Собрать APK
  RUN_DEV.bat        ← Запустить без сборки
```

---

## 🖥️ ПК приложение (Electron EXE)

### Быстрый запуск (без сборки EXE)
```
RUN_DEV.bat
```

### Сборка установщика EXE
```
BUILD_PC.bat
```
Готовый установщик появится в `electron/dist/`

### Требования
- Node.js 18+ (https://nodejs.org)

### Функции
- Иконка в системном трее
- Сворачивание в трей вместо закрытия
- Встроенный HTTPS сервер
- Выбор устройства вывода (VB-Audio Cable и др.)
- Визуализатор аудио

---

## 📱 Android приложение (APK)

### Требования
- Node.js 18+
- Android Studio (https://developer.android.com/studio)
- JDK 17+

### Сборка APK
```
BUILD_ANDROID.bat
```
Скрипт установит Capacitor, создаст Android проект и откроет Android Studio.
В Android Studio нажми: **Build → Build APK(s)**

APK будет в: `android/android/app/build/outputs/apk/debug/app-debug.apk`

### Как пользоваться APK
1. Перенеси APK на телефон
2. Включи "Установка из неизвестных источников" в настройках
3. Установи APK
4. Введи IP адрес ПК в приложении (формат: `192.168.1.15:3000`)
5. Нажми большую кнопку!

---

## 🔄 Как это работает
```
Телефон (APK)
    ↓ WebSocket (WSS)
Electron сервер на ПК (порт 3000)
    ↓ PCM аудио
Electron renderer (воспроизводит звук)
    ↓ (опционально) VB-Audio Cable
Discord / OBS / Teams
```

## 🎛️ Для использования как микрофон в Discord/OBS
1. Установи VB-Audio Virtual Cable: https://vb-audio.com/Cable/
2. В приложении MicStream (ПК) выбери **CABLE Input** как устройство вывода
3. В Discord/OBS выбери **CABLE Output** как микрофон
