<!-- handoff:task:413f7101-b7c1-4c5e-ab95-1bee5974e0eb -->
# AI-фабрика HTML5-игр для Яндекс Игр

**Ветка:** feature/ai-html5-413f71  
**Создано:** 2026-08-14  
**Статус:** В разработке

---

## Настройки

- [ ] **Тестирование:** Да (модульные и интеграционные тесты)
- [ ] **Логирование:** Verbose (подробное DEBUG-логирование для разработки)
- [ ] **Документация:** Да (обязательная проверка документации при завершении)

---

## Описание проекта

Создание AI-фабрики для генерации HTML5-игр под платформу Яндекс Игры. Система основана на архитектуре Godogen (визуальная валидация, самовосстановление), адаптированная для работы на слабом железе, с поддержкой offline-режима (без внешних API ключей) и Docker-развертыванием для Windows.

**Ключевые технологии:**
- [ ] Babylon.js (2D/3D движок)
- [ ] TypeScript + Vite
- [ ] Puppeteer (headless-тестирование)
- [ ] Docker (изоляция окружения)
- [ ] Yandex Games SDK

**Принципы:**
- [ ] Proof over claims: визуальная валидация через скриншоты
- [ ] Offline-first: процедурная генерация → локальные ассеты → AI API
- [ ] Performance budgets: LOW/MEDIUM/HIGH пресеты
- [ ] Self-repair loop: build → run → capture → analyze → fix
- [ ] Engine-agnostic core с Babylon.js-реализацией

---

## Фазы реализации

### Фаза 0: Исследование и подготовка

**Задачи:**

- [x] **Task 0.1: Глубокий анализ архитектуры Godogen**
  - [x] Клонировать репозиторий `htdт/godogen` и изучить ключевые компоненты
  - [x] Проанализировать систему визуальной валидации (browser testing)
  - [x] Изучить механизм self-repair loop и промпты агентов
  - [x] Понять структуру engine manifests (`engines/babylon.md`)
  - [x] Задокументировать выводы в `/home/www/yandex-game-html5-factory/docs/godogen-analysis.md`
  - [x] **Файлы:** `docs/godogen-analysis.md` (создать)
  - [x] **Логирование:** `INFO` при старте анализа, `DEBUG` для каждого найденного паттерна

- [x] **Task 0.2: Определение адаптаций для Yandex Games**
  - [x] Составить список отличий от оригинального Godogen
  - [x] Определить требования Yandex Games SDK (реклама, авторизация, лидерборды)
  - [x] Спроектировать Asset Fallback Pipeline (3 уровня)
  - [x] Определить Performance Budgets для LOW/MEDIUM/HIGH пресетов
  - [x] Задокументировать в `/home/www/yandex-game-html5-factory/docs/yandex-adaptations.md`
  - [x] **Файлы:** `docs/yandex-adaptations.md` (создать)
  - [x] **Логирование:** `INFO` для каждого ключевого решения

---

### Фаза 1: Инфраструктура и Docker

**Задачи:**

- [ ] **Task 1.1: Настройка базовой структуры проекта**
  - [ ] Создать корневую структуру: `src/`, `templates/`, `output/`, `tests/`, `docs/`
  - [ ] Инициализировать TypeScript проект с tsconfig для Node.js
  - [ ] Настроить `package.json` с зависимостями: `puppeteer`, `typescript`, `@types/node`
  - [ ] Создать `.env.example` с переменными: `GOOGLE_API_KEY`, `XAI_API_KEY`, `TRIPO3D_API_KEY`, `AI_PROVIDER`, `GAME_QUALITY`
  - [ ] **Файлы:** `package.json`, `tsconfig.json`, `.env.example`, структура папок
  - [ ] **Логирование:** `INFO` при создании каждой директории

- [ ] **Task 1.2: Docker-окружение для Windows**
  - [ ] Создать `Dockerfile` на базе `node:22-bullseye`
  - [ ] Установить Chromium, xvfb и зависимости для headless-режима
  - [ ] Настроить переменные `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` и `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`
  - [ ] Создать `docker-compose.yml` с монтированием volumes и портами (5173 для Vite)
  - [ ] Создать `start.bat` для запуска под Windows одной командой
  - [ ] **Файлы:** `Dockerfile`, `docker-compose.yml`, `start.bat`
  - [ ] **Логирование:** `DEBUG` при установке каждого пакета в Docker

- [ ] **Task 1.3: Базовый CLI интерфейс**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/cli/index.ts` с interactive prompts
  - [ ] Реализовать выбор типа игры: 2D / 3D
  - [ ] Реализовать выбор quality preset: LOW / MEDIUM / HIGH / AUTO
  - [ ] Реализовать ввод описания игры (текстовый промпт)
  - [ ] Добавить команду `npm run cli` в `package.json`
  - [ ] **Файлы:** `src/cli/index.ts`, обновить `package.json`
  - [ ] **Логирование:** `INFO` для каждого пользовательского выбора, `DEBUG` для валидации входных данных
  - [ ] **Тесты:** `tests/cli/prompts.test.ts` - проверка валидации inputs

---

### Фаза 2: AI Providers Abstraction

**Задачи:**

- [ ] **Task 2.1: Базовый интерфейс AI Provider**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/providers/base.ts` с интерфейсом `IProvider`
  - [ ] Определить методы: `generateCode(prompt, context)`, `analyzeScreenshot(imageBase64, context)`, `fixBug(code, error, context)`
  - [ ] Добавить типы для ответов: `CodeResponse`, `AnalysisResponse`, `FixResponse`
  - [ ] **Файлы:** `src/providers/base.ts`
  - [ ] **Логирование:** `DEBUG` для определения интерфейса

- [ ] **Task 2.2: Claude Code Provider**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/providers/claude.ts` реализующий `IProvider`
  - [ ] Использовать Claude Code SDK для вызова агентов
  - [ ] Реализовать retry-логику (3 попытки с экспоненциальным backoff)
  - [ ] Добавить обработку rate limits и таймаутов
  - [ ] **Файлы:** `src/providers/claude.ts`
  - [ ] **Логирование:** `INFO` для каждого запроса, `WARN` при retry, `ERROR` при исчерпании попыток
  - [ ] **Тесты:** `tests/providers/claude.test.ts` - моки вызовов API
  - [ ] **Зависит от:** Task 2.1

- [ ] **Task 2.3: Codex Provider (заглушка)**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/providers/codex.ts` реализующий `IProvider`
  - [ ] Реализовать базовую структуру (методы возвращают моки)
  - [ ] Добавить TODO-комментарии для будущей интеграции
  - [ ] **Файлы:** `src/providers/codex.ts`
  - [ ] **Логирование:** `WARN` "Codex provider is a stub, returning mock data"
  - [ ] **Тесты:** `tests/providers/codex.test.ts` - проверка mock responses
  - [ ] **Зависит от:** Task 2.1

- [ ] **Task 2.4: Provider Factory и Auto-selection**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/providers/factory.ts`
  - [ ] Реализовать `createProvider(type: 'claude' | 'codex' | 'auto')`
  - [ ] При `auto` проверять доступность провайдеров (пинг API или проверка переменных окружения)
  - [ ] Добавить fallback-цепочку: Claude → Codex → Error
  - [ ] **Файлы:** `src/providers/factory.ts`
  - [ ] **Логирование:** `INFO` для выбранного провайдера, `DEBUG` для проверок доступности
  - [ ] **Тесты:** `tests/providers/factory.test.ts` - сценарии auto-selection
  - [ ] **Зависит от:** Task 2.2, Task 2.3

---

### Фаза 3: Asset Pipeline (Offline-First)

**Задачи:**

- [ ] **Task 3.1: Asset Manager Core**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/asset-pipeline/manager.ts`
  - [ ] Реализовать метод `resolveAssets(assets: AssetRequest[], projectPath: string)`
  - [ ] Определить тип `AssetRequest` с полями: `type`, `name`, `description`, `tags`
  - [ ] Реализовать 3-уровневый fallback: AI → Local → Procedural
  - [ ] **Файлы:** `src/asset-pipeline/manager.ts`, `src/asset-pipeline/types.ts`
  - [ ] **Логирование:** `INFO` для каждого ассета, `DEBUG` для каждого уровня fallback

- [ ] **Task 3.2: Procedural Generation (Level 1 Fallback)**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/asset-pipeline/procedural.ts`
  - [ ] Реализовать генерацию Babylon.js примитивов: Box, Sphere, Cylinder, Plane
  - [ ] Реализовать процедурные материалы (цвета, градиенты)
  - [ ] Реализовать простые паттерны текстур (шахматная доска, полосы)
  - [ ] Генерировать TypeScript код, который создаёт mesh в runtime
  - [ ] **Файлы:** `src/asset-pipeline/procedural.ts`
  - [ ] **Логирование:** `WARN` "Using procedural fallback for asset: {name}", `DEBUG` для параметров генерации
  - [ ] **Тесты:** `tests/asset-pipeline/procedural.test.ts` - валидация генерируемого кода
  - [ ] **Зависит от:** Task 3.1

- [ ] **Task 3.3: Local Asset Library (Level 2 Fallback)**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/asset-pipeline/local-library.ts`
  - [ ] Создать папку `/home/www/yandex-game-html5-factory/assets/library/` с базовыми ассетами
  - [ ] Добавить простые 3D модели (.glb): куб, сфера, машина, персонаж (CC0 лицензии)
  - [ ] Добавить текстуры: трава, камень, металл, дерево (512x512 PNG)
  - [ ] Реализовать поиск по тегам и копирование в проект игры
  - [ ] **Файлы:** `src/asset-pipeline/local-library.ts`, `assets/library/*`
  - [ ] **Логирование:** `INFO` "Using local asset: {filename}", `DEBUG` для поиска по тегам
  - [ ] **Тесты:** `tests/asset-pipeline/local-library.test.ts` - поиск и копирование файлов
  - [ ] **Зависит от:** Task 3.1

- [ ] **Task 3.4: AI Asset Generation (Level 3 - Optional)**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/asset-pipeline/ai-generator.ts`
  - [ ] Реализовать интеграцию с Tripo3D API (для 3D моделей)
  - [ ] Реализовать интеграцию с DALL-E / Stable Diffusion API (для текстур)
  - [ ] Добавить graceful degradation: если API недоступен, вернуть `null`
  - [ ] **Файлы:** `src/asset-pipeline/ai-generator.ts`
  - [ ] **Логирование:** `INFO` "Requesting AI asset generation", `WARN` если API keys отсутствуют, `ERROR` при сбое API
  - [ ] **Тесты:** `tests/asset-pipeline/ai-generator.test.ts` - моки API вызовов
  - [ ] **Зависит от:** Task 3.1

---

### Фаза 4: Game Templates и Scaffolding

**Задачи:**

- [ ] **Task 4.1: Базовый Babylon.js + Vite шаблон**
  - [ ] Создать `/home/www/yandex-game-html5-factory/templates/babylon-base/`
  - [ ] Настроить Vite конфигурацию для TypeScript и Babylon.js
  - [ ] Создать `index.html` с canvas и загрузкой Yandex Games SDK
  - [ ] Создать `src/main.ts` с инициализацией Babylon.Engine
  - [ ] Добавить `package.json` с зависимостями: `babylonjs`, `vite`, `typescript`
  - [ ] **Файлы:** `templates/babylon-base/{vite.config.ts, index.html, src/main.ts, package.json}`
  - [ ] **Логирование:** `DEBUG` при инициализации шаблона

- [ ] **Task 4.2: Yandex Games Adapter (Mock + Production)**
  - [ ] Создать `/home/www/yandex-game-html5-factory/templates/babylon-base/src/yandex/adapter.ts`
  - [ ] Реализовать методы: `init()`, `showFullscreenAd()`, `showRewardedAd()`, `getPlayer()`
  - [ ] Добавить Mock-режим для локальной разработки (когда SDK недоступен)
  - [ ] Логировать все вызовы в консоль браузера
  - [ ] **Файлы:** `templates/babylon-base/src/yandex/adapter.ts`
  - [ ] **Логирование:** `WARN` "Yandex SDK not found, using mock mode" при локальной разработке
  - [ ] **Тесты:** `tests/templates/yandex-adapter.test.ts` - моки SDK вызовов
  - [ ] **Зависит от:** Task 4.1

- [ ] **Task 4.3: 2D Game Template**
  - [ ] Создать `/home/www/yandex-game-html5-factory/templates/2d/` на базе `babylon-base`
  - [ ] Настроить ортографическую камеру (`BABYLON.Camera.ORTHOGRAPHIC_CAMERA`)
  - [ ] Добавить `SpriteManager` для спрайтовой графики
  - [ ] Отключить физический движок (использовать AABB коллизии)
  - [ ] Создать пример 2D сцены (платформер или аркада)
  - [ ] **Файлы:** `templates/2d/{src/game2d.ts, src/physics2d.ts}`
  - [ ] **Логирование:** `INFO` "Initializing 2D scene", `DEBUG` для настроек камеры
  - [ ] **Зависит от:** Task 4.1

- [ ] **Task 4.4: 3D Game Template**
  - [ ] Создать `/home/www/yandex-game-html5-factory/templates/3d/` на базе `babylon-base`
  - [ ] Настроить `ArcRotateCamera` или `UniversalCamera`
  - [ ] Добавить базовое освещение (`HemisphericLight`, `DirectionalLight`)
  - [ ] Интегрировать простую физику (CannonJS или AmmoJS)
  - [ ] Создать пример 3D сцены (раннер или third-person)
  - [ ] **Файлы:** `templates/3d/{src/game3d.ts, src/physics3d.ts}`
  - [ ] **Логирование:** `INFO` "Initializing 3D scene", `DEBUG` для настроек камеры и света
  - [ ] **Зависит от:** Task 4.1

- [ ] **Task 4.5: Scaffolding System**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/scaffold/generator.ts`
  - [ ] Реализовать копирование шаблона в `output/<game-name>/`
  - [ ] Реализовать замену плейсхолдеров в файлах (название игры, настройки)
  - [ ] Запускать `npm install` в сгенерированном проекте
  - [ ] **Файлы:** `src/scaffold/generator.ts`
  - [ ] **Логирование:** `INFO` "Scaffolding project: {name}", `DEBUG` для каждого скопированного файла, `WARN` при ошибках npm install
  - [ ] **Тесты:** `tests/scaffold/generator.test.ts` - проверка копирования и плейсхолдеров
  - [ ] **Зависит от:** Task 4.1, Task 4.3, Task 4.4

---

### Фаза 5: Performance Optimization

**Задачи:**

- [ ] **Task 5.1: Performance Budgets Definition**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/performance/budgets.ts`
  - [ ] Определить пресеты LOW, MEDIUM, HIGH с параметрами:
    - [ ] `targetFPS`, `hardwareScalingLevel`, `shadowsEnabled`, `shadowMapSize`
    - [ ] `postProcessing`, `maxParticles`, `textureSize`, `useLOD`
  - [ ] Экспортировать константы для использования в коде игры
  - [ ] **Файлы:** `src/performance/budgets.ts`
  - [ ] **Логирование:** `DEBUG` для определения пресетов

- [ ] **Task 5.2: Performance Injector**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/performance/injector.ts`
  - [ ] Реализовать метод `applyBudget(code: string, preset: string): string`
  - [ ] Внедрять в TypeScript код игры:
    - [ ] `engine.setHardwareScalingLevel(value)`
    - [ ] Отключение теней при LOW preset
    - [ ] Ограничение частиц и текстур
  - [ ] **Файлы:** `src/performance/injector.ts`
  - [ ] **Логирование:** `INFO` "Applying {preset} performance budget", `DEBUG` для каждой модификации кода
  - [ ] **Тесты:** `tests/performance/injector.test.ts` - проверка трансформации кода
  - [ ] **Зависит от:** Task 5.1

- [ ] **Task 5.3: Runtime Performance Monitor**
  - [ ] Создать `/home/www/yandex-game-html5-factory/templates/babylon-base/src/performance/monitor.ts`
  - [ ] Реализовать FPS-счётчик и отображение на canvas
  - [ ] Добавить автоматическое снижение качества при просадках FPS
  - [ ] Логировать метрики производительности в консоль
  - [ ] **Файлы:** `templates/babylon-base/src/performance/monitor.ts`
  - [ ] **Логирование:** `WARN` "FPS drop detected: {fps}", `INFO` "Auto-adjusting quality to {level}"
  - [ ] **Тесты:** `tests/performance/monitor.test.ts` - симуляция FPS drops
  - [ ] **Зависит от:** Task 5.1

---

### Фаза 6: Browser Testing & Visual Validation

**Задачи:**

- [ ] **Task 6.1: Browser Tester Core**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/browser/tester.ts`
  - [ ] Реализовать запуск Vite dev server программно
  - [ ] Реализовать открытие Puppeteer headless браузера
  - [ ] Захват console.error и pageerror событий
  - [ ] Создание base64 скриншота после рендера
  - [ ] Автоматическое закрытие браузера и Vite после теста
  - [ ] **Файлы:** `src/browser/tester.ts`
  - [ ] **Логирование:** `INFO` "Starting browser test for {project}", `DEBUG` для каждого шага, `ERROR` для сбоев Puppeteer
  - [ ] **Тесты:** `tests/browser/tester.test.ts` - моки Puppeteer

- [ ] **Task 6.2: Visual Reviewer (Vision LLM Analysis)**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/browser/reviewer.ts`
  - [ ] Реализовать анализ скриншота через Vision LLM (Claude Code с vision)
  - [ ] Проверять: пустой экран, чёрный экран, видимость объектов, UI элементы
  - [ ] Возвращать структурированный отчёт: `{ passed: boolean, issues: string[], suggestions: string[] }`
  - [ ] **Файлы:** `src/browser/reviewer.ts`
  - [ ] **Логирование:** `INFO` "Analyzing screenshot", `WARN` для каждой найденной проблемы, `DEBUG` для vision API responses
  - [ ] **Тесты:** `tests/browser/reviewer.test.ts` - моки vision API
  - [ ] **Зависит от:** Task 6.1

- [ ] **Task 6.3: Self-Repair Loop Orchestrator**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/browser/repair-loop.ts`
  - [ ] Реализовать цикл: build → run → capture → analyze → fix (max 5 итераций)
  - [ ] При каждой ошибке вызывать AI provider для генерации исправления
  - [ ] Применять патч к коду и повторять тест
  - [ ] Логировать прогресс каждой итерации
  - [ ] **Файлы:** `src/browser/repair-loop.ts`
  - [ ] **Логирование:** `INFO` "Repair loop iteration {n}/5", `DEBUG` для патчей кода, `ERROR` если цикл исчерпан
  - [ ] **Тесты:** `tests/browser/repair-loop.test.ts` - симуляция ошибок и исправлений
  - [ ] **Зависит от:** Task 6.1, Task 6.2

---

### Фаза 7: Specialized Agents

**Задачи:**

- [ ] **Task 7.1: Game Planner Agent**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/agents/game-planner.ts`
  - [ ] Реализовать метод `analyze(prompt: string, quality: string)` через AI provider
  - [ ] Возвращать структурированный план:
    - [ ] `type: '2d' | '3d'`
    - [ ] `genre: string`
    - [ ] `mechanics: string[]`
    - [ ] `assets: AssetRequest[]`
    - [ ] `quality: 'LOW' | 'MEDIUM' | 'HIGH'`
  - [ ] **Файлы:** `src/agents/game-planner.ts`
  - [ ] **Логирование:** `INFO` "Planning game from prompt", `DEBUG` для распарсенного плана
  - [ ] **Тесты:** `tests/agents/game-planner.test.ts` - валидация структуры плана

- [ ] **Task 7.2: Game Architect Agent**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/agents/game-architect.ts`
  - [ ] Реализовать метод `scaffold(plan: GamePlan)` через scaffolding system
  - [ ] Выбор правильного шаблона (2D / 3D)
  - [ ] Применение performance budget
  - [ ] Возвращать путь к созданному проекту
  - [ ] **Файлы:** `src/agents/game-architect.ts`
  - [ ] **Логирование:** `INFO` "Scaffolding game architecture", `DEBUG` для выбора шаблона
  - [ ] **Тесты:** `tests/agents/game-architect.test.ts` - проверка создания проекта
  - [ ] **Зависит от:** Task 7.1, Task 4.5

- [ ] **Task 7.3: Gameplay Developer Agent**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/agents/gameplay-developer.ts`
  - [ ] Реализовать метод `writeCode(plan: GamePlan, projectPath: string)` через AI provider
  - [ ] Генерация игровой логики, физики, управления
  - [ ] Внедрение кода в `src/game.ts` сгенерированного проекта
  - [ ] **Файлы:** `src/agents/gameplay-developer.ts`
  - [ ] **Логирование:** `INFO` "Generating gameplay code", `DEBUG` для каждого модуля (physics, controls, logic)
  - [ ] **Тесты:** `tests/agents/gameplay-developer.test.ts` - моки AI provider
  - [ ] **Зависит от:** Task 7.2

- [ ] **Task 7.4: Bug Fixer Agent**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/agents/bug-fixer.ts`
  - [ ] Реализовать метод `fix(projectPath: string, issues: string[], consoleErrors: string[])`
  - [ ] Анализ ошибок и генерация патчей через AI provider
  - [ ] Применение патчей к коду игры
  - [ ] **Файлы:** `src/agents/bug-fixer.ts`
  - [ ] **Логирование:** `INFO` "Fixing bugs: {issues}", `DEBUG` для генерируемых патчей, `ERROR` если исправление не удалось
  - [ ] **Тесты:** `tests/agents/bug-fixer.test.ts` - симуляция багов и исправлений
  - [ ] **Зависит от:** Task 7.3

- [ ] **Task 7.5: Build Manager Agent**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/agents/build-manager.ts`
  - [ ] Реализовать метод `buildForYandex(projectPath: string)`
  - [ ] Запуск `npm run build` в проекте игры
  - [ ] Проверка подключения Yandex Games SDK в production сборке
  - [ ] Создание ZIP-архива из `dist/` папки
  - [ ] Перемещение архива в `output/packages/<game-name>.zip`
  - [ ] **Файлы:** `src/agents/build-manager.ts`
  - [ ] **Логирование:** `INFO` "Building production package", `DEBUG` для каждого шага сборки, `ERROR` при сбое build
  - [ ] **Тесты:** `tests/agents/build-manager.test.ts` - проверка создания ZIP
  - [ ] **Зависит от:** Task 7.4

---

### Фаза 8: Main Pipeline Orchestrator

**Задачи:**

- [ ] **Task 8.1: Factory Pipeline Orchestrator**
  - [ ] Создать `/home/www/yandex-game-html5-factory/src/pipeline/orchestrator.ts`
  - [ ] Реализовать метод `run(prompt: string, quality: string, provider: string)`
  - [ ] Последовательный вызов всех агентов:
    1. GamePlanner → GameArchitect → AssetManager
    2. GameplayDeveloper → BrowserTester
    3. Self-repair loop (max 5 итераций)
    4. BuildManager → ZIP package
  - [ ] Обработка ошибок на каждом этапе с откатом
  - [ ] **Файлы:** `src/pipeline/orchestrator.ts`
  - [ ] **Логирование:** `INFO` для каждого этапа, `DEBUG` для передачи контекста между агентами, `ERROR` для критических сбоев
  - [ ] **Тесты:** `tests/pipeline/orchestrator.test.ts` - интеграционный тест полного цикла (моки агентов)
  - [ ] **Зависит от:** Task 7.1, Task 7.2, Task 7.3, Task 7.4, Task 7.5, Task 6.3

- [ ] **Task 8.2: Интеграция Orchestrator в CLI**
  - [ ] Обновить `/home/www/yandex-game-html5-factory/src/cli/index.ts`
  - [ ] После получения пользовательских input вызывать `FactoryPipeline.run()`
  - [ ] Показывать прогресс-бар и статус каждого этапа
  - [ ] Обработка ошибок с user-friendly сообщениями
  - [ ] **Файлы:** `src/cli/index.ts` (обновить)
  - [ ] **Логирование:** `INFO` для прогресса, `ERROR` для ошибок с подсказками пользователю
  - [ ] **Зависит от:** Task 8.1, Task 1.3

---

### Фаза 9: Тестирование и Acceptance Tests

**Задачи:**

- [ ] **Task 9.1: Acceptance Test 1 & 2 - Генерация без API ключей**
  - [ ] Создать `/home/www/yandex-game-html5-factory/tests/acceptance/no-api-keys.test.ts`
  - [ ] Очистить все переменные окружения с API ключами
  - [ ] Запустить генерацию 2D игры через CLI (мок промпт: "Платформер с прыжками")
  - [ ] Запустить генерацию 3D игры через CLI (мок промпт: "Гонка с препятствиями")
  - [ ] Проверить:
    - [ ] Проекты созданы в `output/`
    - [ ] Использованы процедурные ассеты (логи содержат "Using procedural fallback")
    - [ ] Игры успешно собираются (`dist/` папка создана)
    - [ ] ZIP-пакеты созданы
  - [ ] **Файлы:** `tests/acceptance/no-api-keys.test.ts`
  - [ ] **Логирование:** `INFO` для каждой проверки, `ERROR` при сбое теста

- [ ] **Task 9.2: Acceptance Test 3 & 4 - Провайдеры AI**
  - [ ] Создать `/home/www/yandex-game-html5-factory/tests/acceptance/providers.test.ts`
  - [ ] Запустить генерацию с `AI_PROVIDER=claude` (мок Claude API)
  - [ ] Запустить генерацию с `AI_PROVIDER=codex` (заглушка Codex)
  - [ ] Проверить логи использования правильного провайдера
  - [ ] Проверить успешную генерацию кода
  - [ ] **Файлы:** `tests/acceptance/providers.test.ts`
  - [ ] **Логирование:** `INFO` для выбора провайдера, `DEBUG` для вызовов API

- [ ] **Task 9.3: Acceptance Test 5 - LOW Preset Performance**
  - [ ] Создать `/home/www/yandex-game-html5-factory/tests/acceptance/low-preset.test.ts`
  - [ ] Запустить генерацию с `GAME_QUALITY=LOW`
  - [ ] Проверить наличие в коде игры:
    - [ ] `engine.setHardwareScalingLevel(2)`
    - [ ] `shadowsEnabled: false`
    - [ ] `maxParticles: 50`
  - [ ] Запустить browser test и проверить FPS >= 30
  - [ ] **Файлы:** `tests/acceptance/low-preset.test.ts`
  - [ ] **Логирование:** `INFO` для проверки кода, `DEBUG` для FPS метрик

- [ ] **Task 9.4: Acceptance Test 6 - Self-Repair Loop**
  - [ ] Создать `/home/www/yandex-game-html5-factory/tests/acceptance/self-repair.test.ts`
  - [ ] Запустить генерацию с намеренной инъекцией ошибки (камера вне сцены)
  - [ ] Проверить что:
    - [ ] Первый тест провален (чёрный экран в логах)
    - [ ] BugFixer вызван
    - [ ] Повторный тест успешен
    - [ ] Количество итераций <= 5
  - [ ] **Файлы:** `tests/acceptance/self-repair.test.ts`
  - [ ] **Логирование:** `INFO` для каждой итерации repair loop, `DEBUG` для патчей

- [ ] **Task 9.5: Acceptance Test 7 - Yandex Production Package**
  - [ ] Создать `/home/www/yandex-game-html5-factory/tests/acceptance/yandex-package.test.ts`
  - [ ] Запустить полную генерацию игры
  - [ ] Проверить что:
    - [ ] ZIP-архив создан в `output/packages/`
    - [ ] Архив содержит `index.html` с `<script src="https://yandex.ru/games/sdk/v2"></script>`
    - [ ] `dist/` содержит минифицированные JS/CSS файлы
    - [ ] Yandex adapter присутствует в коде
  - [ ] **Файлы:** `tests/acceptance/yandex-package.test.ts`
  - [ ] **Логирование:** `INFO` для проверки архива, `DEBUG` для содержимого файлов

---

### Фаза 10: Документация

**Задачи:**

- [ ] **Task 10.1: README.md - User Guide**
  - [ ] Создать `/home/www/yandex-game-html5-factory/README.md`
  - [ ] Секции:
    - [ ] Описание проекта и возможности
    - [ ] Быстрый старт (запуск через Docker)
    - [ ] Системные требования
    - [ ] Структура проекта
    - [ ] Конфигурация (переменные окружения)
    - [ ] FAQ и troubleshooting
  - [ ] **Файлы:** `README.md`
  - [ ] **Логирование:** N/A

- [ ] **Task 10.2: API Documentation**
  - [ ] Создать `/home/www/yandex-game-html5-factory/docs/api.md`
  - [ ] Документировать публичные методы всех агентов
  - [ ] Документировать интерфейсы AI Providers
  - [ ] Документировать Asset Pipeline API
  - [ ] Примеры кода для кастомизации
  - [ ] **Файлы:** `docs/api.md`
  - [ ] **Логирование:** N/A

- [ ] **Task 10.3: Architecture Deep Dive**
  - [ ] Создать `/home/www/yandex-game-html5-factory/docs/architecture-deep-dive.md`
  - [ ] Диаграммы компонентов (текстовые ASCII или mermaid)
  - [ ] Подробное описание каждой фазы pipeline
  - [ ] Объяснение self-repair loop механики
  - [ ] Сравнение с оригинальным Godogen
  - [ ] **Файлы:** `docs/architecture-deep-dive.md`
  - [ ] **Логирование:** N/A

- [ ] **Task 10.4: Game Templates Guide**
  - [ ] Создать `/home/www/yandex-game-html5-factory/docs/templates-guide.md`
  - [ ] Описание структуры базового шаблона
  - [ ] Как создавать кастомные шаблоны
  - [ ] Особенности 2D vs 3D шаблонов
  - [ ] Интеграция Yandex SDK в шаблонах
  - [ ] **Файлы:** `docs/templates-guide.md`
  - [ ] **Логирование:** N/A

- [ ] **Task 10.5: Performance Optimization Guide**
  - [ ] Создать `/home/www/yandex-game-html5-factory/docs/performance-guide.md`
  - [ ] Объяснение Performance Budgets
  - [ ] Как работает runtime monitoring
  - [ ] Best practices для слабого железа
  - [ ] Профилирование и отладка FPS issues
  - [ ] **Файлы:** `docs/performance-guide.md`
  - [ ] **Логирование:** N/A

---

## План коммитов

Рекомендуемые контрольные точки для коммитов:

1. **После Task 0.2:** `docs: research Godogen architecture and Yandex adaptations`
2. **После Task 1.3:** `feat: setup project structure, Docker, and basic CLI`
3. **После Task 2.4:** `feat: implement AI providers abstraction layer`
4. **После Task 3.4:** `feat: implement Asset Fallback Pipeline (procedural, local, AI)`
5. **После Task 4.5:** `feat: create game templates (2D/3D) and scaffolding system`
6. **После Task 5.3:** `feat: implement performance budgets and optimization`
7. **После Task 6.3:** `feat: implement browser testing and self-repair loop`
8. **После Task 7.5:** `feat: implement specialized agents (Planner, Architect, Developer, Fixer, Builder)`
9. **После Task 8.2:** `feat: integrate pipeline orchestrator with CLI`
10. **После Task 9.5:** `test: add acceptance tests for all 7 scenarios`
11. **После Task 10.5:** `docs: complete all documentation (README, API, guides)`

---

## Критерии завершения

Проект считается завершённым, когда:

1. ✅ Все 7 acceptance tests проходят успешно
2. ✅ Docker-образ собирается и запускается на Windows через `start.bat`
3. ✅ Генерация игры работает без внешних API ключей (offline-first)
4. ✅ Сгенерированная игра проходит визуальную валидацию (proof over claims)
5. ✅ Production ZIP-пакет содержит корректную интеграцию Yandex Games SDK
6. ✅ LOW preset обеспечивает стабильный FPS на слабом железе
7. ✅ Self-repair loop исправляет типичные ошибки генерации (макс 5 итераций)
8. ✅ Вся документация написана и актуальна

---

## Примечания

- [ ] **Архитектурные решения основаны на ARCHITECTURE.md**, который содержит детальный анализ Godogen и адаптации для Yandex Games
- [ ] **Offline-first подход критичен**: фабрика должна работать без единого API ключа
- [ ] **Визуальная валидация обязательна**: успешный build != рабочая игра
- [ ] **Performance budgets не опциональны**: игры должны работать на слабом железе
- [ ] **Docker изолирует окружение**: пользователю не нужно ничего устанавливать вручную
- [ ] **2D != 3D с ограничениями**: отдельные оптимизированные шаблоны и рендер-пути
