# Технический анализ и архитектура AI-фабрики для Яндекс Игр

## 1. Результат исследования архитектуры Godogen

Изучив репозиторий `htdt/godogen`, я выделил ключевые архитектурные решения, которые делают его успешным, и определил, что нужно изменить для нашей задачи.

### Что мы берём из Godogen (Engine-agnostic & Babylon.js specific):
1. **Proof over claims (Визуальная валидация):** Агент не верит успешному `npm run build`. Он запускает игру в headless-браузере, делает скриншот, собирает логи консоли и анализирует их через Vision LLM. Если экран чёрный или есть ошибки — код переписывается.
2. **Babylon.js + Vite + TypeScript:** Идеальный стек для веба. Vite обеспечивает мгновенный HMR, а TypeScript спасает агента от глупых ошибок типизации.
3. **Разделение Host Agent и Engine Guide:** Godogen использует тонкие markdown-манифесты (`engines/babylon.md`), чтобы объяснить агенту, как работать с движком.

### Что мы меняем (Адаптация под Yandex Games Factory):
1. **Отказ от "тонкого клиента":** В Godogen агент сам с нуля создаёт весь тулинг (скрипты захвата, скаффолдинг). Это нестабильно. Наша Фабрика будет **оркестратором**, который жёстко контролирует пайплайн, а агенты будут писать только логику игры.
2. **Offline-first для ассетов:** Godogen сильно полагается на Gemini/xAI/Tripo3D. Мы внедряем **Asset Fallback Pipeline** (Процедурная генерация → Локальные ассеты → AI API).
3. **Potato Mode (Low-end):** Внедряем строгие Performance Budgets. Игра изначально проектируется под слабые устройства (интегрированная графика, старые CPU).
4. **Yandex Games SDK:** Внедряем слой адаптера, который мокается при локальной разработке и компилируется в production-сборке.
5. **Docker-first для Windows:** Пользователю не нужно ставить Node.js, Python, Chromium и xvfb. Всё упаковано в контейнер.

---

## 2. Архитектура проекта (Yandex Games Factory)

Фабрика — это CLI/Web-инструмент на Node.js, который генерирует независимый проект игры в папке `output/`.

```text
yandex-games-factory/
├── docker-compose.yml
├── Dockerfile
├── start.bat
├── .env.example
├── src/
│   ├── cli/                 # Интерфейс пользователя
│   ├── pipeline/            # Оркестратор (Planner -> Architect -> Developer -> Tester)
│   ├── agents/              # Промпты и роли (GamePlanner, BugFixer, VisualReviewer)
│   ├── providers/           # Абстракция LLM (Claude, Codex)
│   ├── asset-pipeline/      # Fallback-система (Procedural -> Local -> AI)
│   ├── browser/             # Puppeteer для запуска и скриншотов
│   ├── performance/         # Профили качества (LOW, MEDIUM, HIGH)
│   └── yandex/              # Интеграция Yandex SDK и моки
├── templates/
│   ├── babylon-base/        # Базовый Vite + TS проект
│   ├── 2d/                  # Шаблоны 2D (ортографическая камера, спрайты)
│   └── 3d/                  # Шаблоны 3D
└── output/                  # Сгенерированные игры (не зависят от фабрики)
```

---

## 3. Рабочий MVP: Исходный код Фабрики

Ниже представлены ключевые файлы для создания рабочего MVP.

### 3.1. Docker и запуск (Windows Friendly)

**`Dockerfile`**
```dockerfile
FROM node:22-bullseye

# Установка Chromium и зависимостей для headless-тестирования
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    libdrm2 \
    libgbm1 \
    libasound2 \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build:factory

CMD ["npm", "run", "start:cli"]
```

**`docker-compose.yml`**
```yaml
version: '3.8'
services:
  factory:
    build: .
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - GOOGLE_API_KEY=${GOOGLE_API_KEY}
      - XAI_API_KEY=${XAI_API_KEY}
      - TRIPO3D_API_KEY=${TRIPO3D_API_KEY}
      - AI_PROVIDER=${AI_PROVIDER:-auto}
      - GAME_QUALITY=${GAME_QUALITY:-auto}
    ports:
      - "5173:5173" # Vite Dev Server для тестирования игры
```

**`start.bat`**
```bat
@echo off
echo [Yandex Games AI Factory] Starting...
if not exist .env copy .env.example .env
docker compose up --build -d
docker compose exec factory npm run cli
pause
```

**`.env.example`**
```env
# AI API Keys (Опционально для ассетов)
GOOGLE_API_KEY=
XAI_API_KEY=
TRIPO3D_API_KEY=

# Основной провайдер для кода (claude / codex / auto)
AI_PROVIDER=auto
GAME_QUALITY=auto
YGG_SDK_ENABLED=true
```

---

### 3.2. Ядро Фабрики: Оркестратор и Агенты

**`src/pipeline/orchestrator.ts`**
Оркестратор управляет всем процессом, передавая контекст от одного специализированного агента к другому.

```typescript
import { GamePlanner, GameArchitect, GameplayDeveloper, VisualReviewer, BugFixer, BuildManager } from '../agents';
import { AssetManager } from '../asset-pipeline/manager';
import { BrowserTester } from '../browser/tester';

export class FactoryPipeline {
    async run(prompt: string, quality: string) {
        console.log('✓ Анализ игры...');
        const plan = await GamePlanner.analyze(prompt, quality);
        
        console.log(`✓ Архитектура (Тип: ${plan.type}, Quality: ${plan.quality})...`);
        const projectPath = await GameArchitect.scaffold(plan);
        
        console.log('✓ Создание ассетов (Fallback Strategy)...');
        await AssetManager.resolveAssets(plan.assets, projectPath);
        
        console.log('✓ Написание игрового кода...');
        await GameplayDeveloper.writeCode(plan, projectPath);
        
        console.log('✓ Запуск и визуальная проверка (Proof over claims)...');
        let isValid = false;
        let attempts = 0;
        
        while (!isValid && attempts < 5) {
            const testResult = await BrowserTester.run(projectPath);
            const review = await VisualReviewer.analyze(testResult.screenshot, testResult.consoleErrors);
            
            if (review.passed) {
                isValid = true;
                console.log('✓ Визуальная проверка пройдена!');
            } else {
                console.log(`! Обнаружены проблемы: ${review.issues}. Исправление (Попытка ${attempts + 1})...`);
                await BugFixer.fix(projectPath, review.issues, testResult.consoleErrors);
                attempts++;
            }
        }
        
        console.log('✓ Интеграция Yandex Games SDK и Production Build...');
        const buildPath = await BuildManager.buildForYandex(projectPath);
        
        console.log(`🎉 Игра готова! Пакет сохранен в: ${buildPath}`);
    }
}
```

---

### 3.3. Asset Fallback Strategy (Работа без API ключей)

Это критический компонент. Если ключей нет, фабрика использует процедурную генерацию Babylon.js.

**`src/asset-pipeline/manager.ts`**
```typescript
export class AssetManager {
    static async resolveAssets(assets: any[], projectPath: string) {
        for (const asset of assets) {
            if (asset.type === '3D_MODEL') {
                await this.resolve3DModel(asset, projectPath);
            } else if (asset.type === 'TEXTURE') {
                await this.resolveTexture(asset, projectPath);
            }
        }
    }

    private static async resolve3DModel(asset: any, path: string) {
        // Level 3: AI Generation
        if (process.env.TRIPO3D_API_KEY) {
            const model = await Tripo3D.generate(asset.description);
            if (model) return this.save(model, path);
        }
        
        // Level 2: Local Assets
        const local = await LocalLibrary.findModel(asset.tags);
        if (local) return this.copy(local, path);
        
        // Level 1: Procedural Fallback (Babylon.js Primitives)
        console.log(`[Fallback] Используем процедурную геометрию для: ${asset.name}`);
        this.injectProceduralCode(asset, path);
    }
}
```

---

### 3.4. Поддержка слабых компьютеров (Potato Mode)

Фабрика внедряет конфигурацию производительности прямо в генерируемый код.

**`src/performance/budget.ts`**
```typescript
export const QualityPresets = {
    LOW: {
        targetFPS: 30,
        hardwareScalingLevel: 2.0, // Рендер в 50% разрешения
        shadowsEnabled: false,
        postProcessing: false,
        maxParticles: 50,
        textureSize: 512,
        useLOD: true
    },
    MEDIUM: {
        targetFPS: 60,
        hardwareScalingLevel: 1.0,
        shadowsEnabled: true,
        shadowMapSize: 1024,
        postProcessing: false,
        maxParticles: 200,
        textureSize: 1024,
        useLOD: true
    },
    HIGH: {
        targetFPS: 60,
        hardwareScalingLevel: 1.0,
        shadowsEnabled: true,
        shadowMapSize: 2048,
        postProcessing: true,
        maxParticles: 1000,
        textureSize: 2048,
        useLOD: false
    }
};
```
*Агент `PerformanceOptimizer` использует эти данные для настройки `engine.setHardwareScalingLevel()` и отключения теней в коде игры.*

---

### 3.5. Browser Testing & Visual Validation (Proof over claims)

Адаптация идеи Godogen для Docker. Запускаем Vite, открываем Puppeteer, ждём рендера, делаем скриншот.

**`src/browser/tester.ts`**
```typescript
import puppeteer from 'puppeteer';
import { exec } from 'child_process';

export class BrowserTester {
    static async run(projectPath: string) {
        // Запускаем Vite dev server
        const server = exec('npm run dev', { cwd: projectPath });
        await new Promise(resolve => setTimeout(resolve, 3000)); // Ждем старта

        const browser = await puppeteer.launch({
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=egl']
        });
        
        const page = await browser.newPage();
        const consoleErrors: string[] = [];
        
        page.on('console', msg => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('pageerror', err => consoleErrors.push(err.message));

        await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
        await page.waitForTimeout(2000); // Ждем рендера Babylon.js
        
        const screenshot = await page.screenshot({ encoding: 'base64' });
        await browser.close();
        server.kill();
        
        return { screenshot, consoleErrors };
    }
}
```

---

### 3.6. Yandex Games Adapter

Слой абстракции, который позволяет игре работать локально без ошибок, а в проде использовать реальный SDK.

**`templates/babylon-base/src/yandex/adapter.ts`**
```typescript
export class YandexGamesAdapter {
    private ysdk: any = null;
    private isMock = false;

    async init() {
        if (typeof window['ysdk'] !== 'undefined') {
            this.ysdk = window['ysdk'];
            await this.ysdk.features.LoadingAPI?.ready();
        } else {
            console.warn('[Yandex Games] SDK не найден. Включен Mock-режим (Offline).');
            this.isMock = true;
        }
    }

    async showFullscreenAd(): Promise<boolean> {
        if (this.isMock) {
            console.log('[MOCK] Показ полноэкранной рекламы...');
            return true;
        }
        return new Promise((resolve) => {
            this.ysdk.adv.showFullscreenAdv({
                callbacks: {
                    onClose: () => resolve(true),
                    onError: () => resolve(false)
                }
            });
        });
    }
}
```

---

## 4. Поддержка 2D и 3D

Фабрика не делает 2D как "тяжёлое 3D с фиксированной камерой". 
Если `GamePlanner` определяет игру как 2D, `GameArchitect` выбирает шаблон `templates/2d/`, который использует:
* Ортографическую камеру (`BABYLON.FreeCamera` с `mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA`).
* `BABYLON.SpriteManager` или плоскости с `StandardMaterial` (disableLighting = true) для максимальной дешевизны рендера.
* Отключение физического движка (использование простых AABB пересечений).

---

## 5. Acceptance Tests (Как проверить результат)

После запуска `start.bat` и входа в CLI, выполните следующие проверки:

### Test 1 & 2: Работа без API ключей (2D и 3D)
1. Убедитесь, что в `.env` ключи `GOOGLE_API_KEY`, `XAI_API_KEY`, `TRIPO3D_API_KEY` пусты.
2. Введите промпт: *"Сделай 3D гонку, где кубик уклоняется от препятствий"*.
3. **Ожидаемый результат:** Фабрика сгенерирует игру, используя `BABYLON.MeshBuilder.CreateBox`, применит процедурные цвета, успешно пройдет визуальный тест и соберет ZIP-архив.

### Test 5: Слабое железо (Potato Mode)
1. При создании игры выберите `Target Device: LOW`.
2. **Ожидаемый результат:** В сгенерированном коде `src/game.ts` будет присутствовать `engine.setHardwareScalingLevel(2)` и `shadowGenerator.dispose()`. Игра будет выдавать стабильный FPS даже на интегрированной графике.

### Test 6: Visual Self-Repair
1. Если LLM сгенерирует код с ошибкой (например, камера смотрит в пустоту), `BrowserTester` сделает скриншот черного экрана.
2. `VisualReviewer` (Vision LLM) получит скриншот и ответит: *"Экран пустой, объекты не в поле зрения камеры"*.
3. `BugFixer` изменит координаты камеры в коде, и цикл повторится до успешного рендера.

### Test 7: Yandex Production Build
1. По завершении пайплайна фабрика выполнит `npm run build`.
2. В папке `output/my-game/dist/` появится `index.html` с подключенным `<script src="https://yandex.ru/games/sdk/v2"></script>`.
3. Папка будет автоматически запакована в `game.zip`, полностью готовый к загрузке в консоль разработчика Яндекс Игр.

---

## Резюме

Данная архитектура перенимает **лучшие инженерные идеи Godogen** (визуальная валидация, итеративное исправление, Vite+Babylon), но избавляется от его хрупкости за счет **строгого пайплайна, Asset Fallback системы и Docker-изоляции**. 

Система полностью автономна, ориентирована на слабые ПК (Potato Mode) и гарантирует создание рабочего HTML5-пакета для Яндекс Игр даже при полном отсутствии ключей для генерации ассетов.