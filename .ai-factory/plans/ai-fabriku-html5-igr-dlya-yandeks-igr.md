<!-- handoff:task:413f7101-b7c1-4c5e-ab95-1bee5974e0eb -->
# AI-фабрика HTML5-игр для Яндекс Игр

**Ветка:** feature/ai-html5-413f71  
**Создано:** 2026-08-14  
**Статус:** Завершено

---

## Настройки

- [x] **Тестирование:** Да (модульные и интеграционные тесты)
- [x] **Логирование:** Verbose (подробное DEBUG-логирование для разработки)
- [x] **Документация:** Да (обязательная проверка документации при завершении)

---

## Описание проекта

Создание AI-фабрики для генерации HTML5-игр под платформу Яндекс Игры. Система основана на архитектуре Godogen (визуальная валидация, самовосстановление), адаптированная для работы на слабом железе, с поддержкой offline-режима (без внешних API ключей) и Docker-развертыванием для Windows.

**Ключевые технологии:**
- [x] Canvas 2D + Babylon.js 3D
- [x] TypeScript + Vite
- [x] Puppeteer (headless-тестирование)
- [x] Docker (изоляция окружения)
- [x] Yandex Games SDK

**Принципы:**
- [x] Proof over claims: визуальная валидация через скриншоты
- [x] Offline-first: опциональный AI API → локальные ассеты → процедурный fallback
- [x] Performance budgets: LOW/MEDIUM/HIGH пресеты
- [x] Self-repair loop: build → run → capture → analyze → fix
- [x] Engine-agnostic core с Canvas 2D и Babylon.js 3D реализациями

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

- [x] **Task 1.1: Настройка базовой структуры проекта**
  - [x] Создать корневую структуру: `src/`, `templates/`, `output/`, `tests/`, `docs/`
  - [x] Инициализировать TypeScript проект с tsconfig для Node.js
  - [x] Настроить `package.json` с зависимостями: `puppeteer`, `typescript`, `@types/node`
  - [x] Создать `.env.example` с переменными: `GOOGLE_API_KEY`, `XAI_API_KEY`, `TRIPO3D_API_KEY`, `AI_PROVIDER`, `GAME_QUALITY`
  - [x] **Файлы:** `package.json`, `tsconfig.json`, `.env.example`, структура папок
  - [x] **Логирование:** `INFO` при создании каждой директории

- [x] **Task 1.2: Docker-окружение для Windows**
  - [x] Создать `Dockerfile` на базе `node:22-bullseye`
  - [x] Установить Chromium, xvfb и зависимости для headless-режима
  - [x] Настроить переменные `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` и `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`
  - [x] Создать `docker-compose.yml` с монтированием volumes и портами (5173 для Vite)
  - [x] Создать `start.bat` для запуска под Windows одной командой
  - [x] **Файлы:** `Dockerfile`, `docker-compose.yml`, `start.bat`
  - [x] **Логирование:** `DEBUG` при установке каждого пакета в Docker

- [x] **Task 1.3: Базовый CLI интерфейс**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/cli/index.ts` с interactive prompts
  - [x] Реализовать выбор типа игры: 2D / 3D
  - [x] Реализовать выбор quality preset: LOW / MEDIUM / HIGH / AUTO
  - [x] Реализовать ввод описания игры (текстовый промпт)
  - [x] Добавить команду `npm run cli` в `package.json`
  - [x] **Файлы:** `src/cli/index.ts`, обновить `package.json`
  - [x] **Логирование:** `INFO` для каждого пользовательского выбора, `DEBUG` для валидации входных данных
  - [x] **Тесты:** `tests/cli/prompts.test.ts` - проверка валидации inputs

---

### Фаза 2: AI Providers Abstraction

**Задачи:**

- [x] **Task 2.1: Базовый интерфейс AI Provider**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/providers/base.ts` с интерфейсом `IProvider`
  - [x] Определить методы: `generateCode(prompt, context)`, `analyzeScreenshot(imageBase64, context)`, `fixBug(code, error, context)`
  - [x] Добавить типы для ответов: `CodeResponse`, `AnalysisResponse`, `FixResponse`
  - [x] **Файлы:** `src/providers/base.ts`
  - [x] **Логирование:** `DEBUG` для определения интерфейса

- [x] **Task 2.2: Claude Code Provider**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/providers/claude.ts` реализующий `IProvider`
  - [x] Использовать Claude Code SDK для вызова агентов
  - [x] Реализовать retry-логику (3 попытки с экспоненциальным backoff)
  - [x] Добавить обработку rate limits и таймаутов
  - [x] **Файлы:** `src/providers/claude.ts`
  - [x] **Логирование:** `INFO` для каждого запроса, `WARN` при retry, `ERROR` при исчерпании попыток
  - [x] **Тесты:** `tests/providers/claude.test.ts` - моки вызовов API
  - [x] **Зависит от:** Task 2.1

- [x] **Task 2.3: Codex Provider (реальная CLI-интеграция вместо заглушки)**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/providers/codex.ts` реализующий `IProvider`
  - [x] Реализовать базовую структуру с вызовом Codex CLI и JSONL parsing
  - [x] Добавить обработку недоступного CLI без фиктивных production-ответов
  - [x] **Файлы:** `src/providers/codex.ts`
  - [x] **Логирование:** `INFO` для запросов, `WARN` при недоступности, `ERROR` при сбое
  - [x] **Тесты:** `tests/providers/codex.test.ts` - проверка CLI responses
  - [x] **Зависит от:** Task 2.1

- [x] **Task 2.4: Provider Factory и Auto-selection**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/providers/factory.ts`
  - [x] Реализовать `createProvider(type: 'claude' | 'codex' | 'auto')`
  - [x] При `auto` проверять доступность провайдеров (пинг API или проверка переменных окружения)
  - [x] Добавить fallback-цепочку: Claude → Codex → Error
  - [x] **Файлы:** `src/providers/factory.ts`
  - [x] **Логирование:** `INFO` для выбранного провайдера, `DEBUG` для проверок доступности
  - [x] **Тесты:** `tests/providers/factory.test.ts` - сценарии auto-selection
  - [x] **Зависит от:** Task 2.2, Task 2.3

---

### Фаза 3: Asset Pipeline (Offline-First)

**Задачи:**

- [x] **Task 3.1: Asset Manager Core**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/asset-pipeline/manager.ts`
  - [x] Реализовать метод `resolveAssets(assets: AssetRequest[], projectPath: string)`
  - [x] Определить тип `AssetRequest` с полями: `type`, `name`, `description`, `tags`
  - [x] Реализовать 3-уровневый fallback: AI → Local → Procedural
  - [x] **Файлы:** `src/asset-pipeline/manager.ts`, `src/asset-pipeline/types.ts`
  - [x] **Логирование:** `INFO` для каждого ассета, `DEBUG` для каждого уровня fallback

- [x] **Task 3.2: Procedural Generation (Level 1 Fallback)**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/asset-pipeline/procedural.ts`
  - [x] Реализовать генерацию Babylon.js примитивов: Box, Sphere, Cylinder, Plane
  - [x] Реализовать процедурные материалы (цвета, градиенты)
  - [x] Реализовать простые паттерны текстур (шахматная доска, полосы)
  - [x] Генерировать TypeScript код, который создаёт mesh в runtime
  - [x] **Файлы:** `src/asset-pipeline/procedural.ts`
  - [x] **Логирование:** `WARN` "Using procedural fallback for asset: {name}", `DEBUG` для параметров генерации
  - [x] **Тесты:** `tests/asset-pipeline/procedural.test.ts` - валидация генерируемого кода
  - [x] **Зависит от:** Task 3.1

- [x] **Task 3.3: Local Asset Library (Level 2 Fallback)**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/asset-pipeline/local-library.ts`
  - [x] Создать папку `/home/www/yandex-game-html5-factory/assets/library/` с базовыми ассетами
  - [x] Добавить простые 3D модели (.glb): куб, сфера, машина, персонаж (CC0 лицензии)
  - [x] Добавить текстуры: трава, камень, металл, дерево (512x512 PNG)
  - [x] Реализовать поиск по тегам и копирование в проект игры
  - [x] **Файлы:** `src/asset-pipeline/local-library.ts`, `assets/library/*`
  - [x] **Логирование:** `INFO` "Using local asset: {filename}", `DEBUG` для поиска по тегам
  - [x] **Тесты:** `tests/asset-pipeline/local-library.test.ts` - поиск и копирование файлов
  - [x] **Зависит от:** Task 3.1

- [x] **Task 3.4: AI Asset Generation (Level 3 - Optional)**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/asset-pipeline/ai-generator.ts`
  - [x] Реализовать интеграцию с Tripo3D API (для 3D моделей)
  - [x] Реализовать интеграцию с xAI / Google image API (для текстур)
  - [x] Добавить graceful degradation: если API недоступен, вернуть `null`
  - [x] **Файлы:** `src/asset-pipeline/ai-generator.ts`
  - [x] **Логирование:** `INFO` "Requesting AI asset generation", `WARN` если API keys отсутствуют, `ERROR` при сбое API
  - [x] **Тесты:** `tests/asset-pipeline/ai-generator.test.ts` - моки API вызовов
  - [x] **Зависит от:** Task 3.1

---

### Фаза 4: Game Templates и Scaffolding

**Задачи:**

- [x] **Task 4.1: Базовый Babylon.js + Vite шаблон**
  - [x] Создать `/home/www/yandex-game-html5-factory/templates/babylon-base/`
  - [x] Настроить Vite конфигурацию для TypeScript и Babylon.js
  - [x] Создать `index.html` с canvas и загрузкой Yandex Games SDK
  - [x] Создать `src/main.ts` с инициализацией Babylon.Engine
  - [x] Добавить `package.json` с modular `@babylonjs/core`, `vite`, `typescript`
  - [x] **Файлы:** `templates/babylon-base/{vite.config.ts, index.html, src/main.ts, package.json}`
  - [x] **Логирование:** `DEBUG` при инициализации шаблона

- [x] **Task 4.2: Yandex Games Adapter (Mock + Production)**
  - [x] Создать `/home/www/yandex-game-html5-factory/templates/babylon-base/src/yandex/adapter.ts`
  - [x] Реализовать методы: `init()`, `showFullscreenAd()`, `showRewardedAd()`, `getPlayer()`
  - [x] Добавить Mock-режим для локальной разработки (когда SDK недоступен)
  - [x] Логировать все вызовы в консоль браузера
  - [x] **Файлы:** `templates/babylon-base/src/yandex/adapter.ts`
  - [x] **Логирование:** `WARN` "Yandex SDK not found, using mock mode" при локальной разработке
  - [x] **Тесты:** `tests/templates/yandex-adapter.test.ts` - моки SDK вызовов
  - [x] **Зависит от:** Task 4.1

- [x] **Task 4.3: Native Canvas 2D Game Template**
  - [x] Создать отдельный `/home/www/yandex-game-html5-factory/templates/2d/` без Babylon.js dependency
  - [x] Настроить Canvas 2D fixed-resolution rendering с responsive scaling
  - [x] Добавить пять starting presets: platformer, top-down shooter, clicker, idle, puzzle
  - [x] Отключить физический движок (использовать AABB коллизии)
  - [x] Создать пример 2D arcade сцены
  - [x] **Файлы:** `templates/2d/{src/game2d.ts, src/physics2d.ts}`
  - [x] **Логирование:** `INFO` "Initializing native Canvas 2D scene", `DEBUG` для render settings
  - [x] **Зависит от:** Task 4.1

- [x] **Task 4.4: 3D Game Template**
  - [x] Создать `/home/www/yandex-game-html5-factory/templates/3d/` как overlay для `babylon-base`
  - [x] Настроить `ArcRotateCamera`
  - [x] Добавить базовое освещение (`HemisphericLight`, `DirectionalLight`)
  - [x] Интегрировать дешёвую kinematic physics и collision вместо тяжёлого обязательного physics runtime
  - [x] Создать пример 3D endless runner сцены и пять genre presets
  - [x] **Файлы:** `templates/3d/{src/game3d.ts, src/physics3d.ts}`
  - [x] **Логирование:** `INFO` "Initializing 3D scene", `DEBUG` для настроек камеры и света
  - [x] **Зависит от:** Task 4.1

- [x] **Task 4.5: Scaffolding System**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/scaffold/generator.ts`
  - [x] Реализовать копирование standalone source project в `projects/<game-name>/`
  - [x] Реализовать безопасную замену плейсхолдеров в файлах (название игры, настройки)
  - [x] Запускать `npm install --include=dev` в сгенерированном проекте
  - [x] **Файлы:** `src/scaffold/generator.ts`
  - [x] **Логирование:** `INFO` "Scaffolding project: {name}", `DEBUG` для каждого скопированного файла, `WARN` при ошибках npm install
  - [x] **Тесты:** `tests/scaffold/generator.test.ts` - проверка копирования и плейсхолдеров
  - [x] **Зависит от:** Task 4.1, Task 4.3, Task 4.4

---

### Фаза 5: Performance Optimization

**Задачи:**

- [x] **Task 5.1: Performance Budgets Definition**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/performance/budgets.ts`
  - [x] Определить пресеты LOW, MEDIUM, HIGH с параметрами:
    - [x] `targetFPS`, `hardwareScalingLevel`, `shadowsEnabled`, `shadowMapSize`
    - [x] `postProcessing`, `maxParticles`, `textureSize`, `useLOD`
  - [x] Экспортировать константы для использования в коде игры
  - [x] **Файлы:** `src/performance/budgets.ts`
  - [x] **Логирование:** `DEBUG` для определения пресетов

- [x] **Task 5.2: Performance Injector**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/performance/injector.ts`
  - [x] Реализовать метод `applyBudget(code: string, preset: string): string`
  - [x] Внедрять в TypeScript код игры:
    - [x] `engine.setHardwareScalingLevel(value)`
    - [x] Отключение теней при LOW preset
    - [x] Ограничение частиц и текстур
  - [x] **Файлы:** `src/performance/injector.ts`
  - [x] **Логирование:** `INFO` "Applying {preset} performance budget", `DEBUG` для каждой модификации кода
  - [x] **Тесты:** `tests/performance/injector.test.ts` - проверка трансформации кода
  - [x] **Зависит от:** Task 5.1

- [x] **Task 5.3: Runtime Performance Monitor**
  - [x] Создать `/home/www/yandex-game-html5-factory/templates/babylon-base/src/performance/monitor.ts`
  - [x] Реализовать FPS-счётчик и отображение на canvas
  - [x] Добавить автоматическое снижение качества при просадках FPS
  - [x] Логировать метрики производительности в консоль
  - [x] **Файлы:** `templates/babylon-base/src/performance/monitor.ts`
  - [x] **Логирование:** `WARN` "FPS drop detected: {fps}", `INFO` "Auto-adjusting quality to {level}"
  - [x] **Тесты:** `tests/performance/monitor.test.ts` - симуляция FPS drops
  - [x] **Зависит от:** Task 5.1

---

### Фаза 6: Browser Testing & Visual Validation

**Задачи:**

- [x] **Task 6.1: Browser Tester Core**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/browser/tester.ts`
  - [x] Реализовать запуск Vite dev server программно
  - [x] Реализовать открытие Puppeteer headless браузера
  - [x] Захват console.error и pageerror событий
  - [x] Создание base64 скриншота после рендера
  - [x] Автоматическое закрытие браузера и Vite после теста
  - [x] **Файлы:** `src/browser/tester.ts`
  - [x] **Логирование:** `INFO` "Starting browser test for {project}", `DEBUG` для каждого шага, `ERROR` для сбоев Puppeteer
  - [x] **Тесты:** `tests/browser/tester.test.ts` - моки Puppeteer

- [x] **Task 6.2: Visual Reviewer (Vision LLM Analysis)**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/browser/reviewer.ts`
  - [x] Реализовать анализ скриншота через Vision LLM (Claude Code с vision)
  - [x] Проверять: пустой экран, чёрный экран, видимость объектов, UI элементы
  - [x] Возвращать структурированный отчёт: `{ passed: boolean, issues: string[], suggestions: string[] }`
  - [x] **Файлы:** `src/browser/reviewer.ts`
  - [x] **Логирование:** `INFO` "Analyzing screenshot", `WARN` для каждой найденной проблемы, `DEBUG` для vision API responses
  - [x] **Тесты:** `tests/browser/reviewer.test.ts` - моки vision API
  - [x] **Зависит от:** Task 6.1

- [x] **Task 6.3: Self-Repair Loop Orchestrator**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/browser/repair-loop.ts`
  - [x] Реализовать цикл: build → run → capture → analyze → fix (max 5 итераций)
  - [x] При каждой ошибке вызывать AI provider для генерации исправления
  - [x] Применять патч к коду и повторять тест
  - [x] Логировать прогресс каждой итерации
  - [x] **Файлы:** `src/browser/repair-loop.ts`
  - [x] **Логирование:** `INFO` "Repair loop iteration {n}/5", `DEBUG` для патчей кода, `ERROR` если цикл исчерпан
  - [x] **Тесты:** `tests/browser/repair-loop.test.ts` - симуляция ошибок и исправлений
  - [x] **Зависит от:** Task 6.1, Task 6.2

---

### Фаза 7: Specialized Agents

**Задачи:**

- [x] **Task 7.1: Game Planner Agent**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/agents/game-planner.ts`
  - [x] Реализовать метод `analyze(prompt: string, quality: string)` через AI provider
  - [x] Возвращать структурированный план:
    - [x] `type: '2d' | '3d'`
    - [x] `genre: string`
    - [x] `mechanics: string[]`
    - [x] `assets: AssetRequest[]`
    - [x] `quality: 'LOW' | 'MEDIUM' | 'HIGH'`
  - [x] **Файлы:** `src/agents/game-planner.ts`
  - [x] **Логирование:** `INFO` "Planning game from prompt", `DEBUG` для распарсенного плана
  - [x] **Тесты:** `tests/agents/game-planner.test.ts` - валидация структуры плана

- [x] **Task 7.2: Game Architect Agent**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/agents/game-architect.ts`
  - [x] Реализовать метод `scaffold(plan: GamePlan)` через scaffolding system
  - [x] Выбор правильного шаблона (2D / 3D)
  - [x] Применение performance budget
  - [x] Возвращать путь к созданному проекту
  - [x] **Файлы:** `src/agents/game-architect.ts`
  - [x] **Логирование:** `INFO` "Scaffolding game architecture", `DEBUG` для выбора шаблона
  - [x] **Тесты:** `tests/agents/game-architect.test.ts` - проверка создания проекта
  - [x] **Зависит от:** Task 7.1, Task 4.5

- [x] **Task 7.3: Gameplay Developer Agent**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/agents/gameplay-developer.ts`
  - [x] Реализовать метод `writeCode(plan: GamePlan, projectPath: string)` через AI provider
  - [x] Генерация игровой логики, физики, управления
  - [x] Внедрение кода в `src/game.ts` сгенерированного проекта
  - [x] **Файлы:** `src/agents/gameplay-developer.ts`
  - [x] **Логирование:** `INFO` "Generating gameplay code", `DEBUG` для каждого модуля (physics, controls, logic)
  - [x] **Тесты:** `tests/agents/gameplay-developer.test.ts` - моки AI provider
  - [x] **Зависит от:** Task 7.2

- [x] **Task 7.4: Bug Fixer Agent**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/agents/bug-fixer.ts`
  - [x] Реализовать метод `fix(projectPath: string, issues: string[], consoleErrors: string[])`
  - [x] Анализ ошибок и генерация патчей через AI provider
  - [x] Применение патчей к коду игры
  - [x] **Файлы:** `src/agents/bug-fixer.ts`
  - [x] **Логирование:** `INFO` "Fixing bugs: {issues}", `DEBUG` для генерируемых патчей, `ERROR` если исправление не удалось
  - [x] **Тесты:** `tests/agents/bug-fixer.test.ts` - симуляция багов и исправлений
  - [x] **Зависит от:** Task 7.3

- [x] **Task 7.5: Build Manager Agent**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/agents/build-manager.ts`
  - [x] Реализовать метод `buildForYandex(projectPath: string)`
  - [x] Запуск `npm run build` в проекте игры
  - [x] Проверка подключения Yandex Games SDK в production сборке
  - [x] Создание ZIP-архива из `dist/` папки
  - [x] Перемещение архива в `output/packages/<game-name>.zip`
  - [x] **Файлы:** `src/agents/build-manager.ts`
  - [x] **Логирование:** `INFO` "Building production package", `DEBUG` для каждого шага сборки, `ERROR` при сбое build
  - [x] **Тесты:** `tests/agents/build-manager.test.ts` - проверка создания ZIP
  - [x] **Зависит от:** Task 7.4

---

### Фаза 8: Main Pipeline Orchestrator

**Задачи:**

- [x] **Task 8.1: Factory Pipeline Orchestrator**
  - [x] Создать `/home/www/yandex-game-html5-factory/src/pipeline/orchestrator.ts`
  - [x] Реализовать метод `run(prompt: string, quality: string, provider: string)`
  - [x] Последовательный вызов всех агентов:
    1. GamePlanner → GameArchitect → AssetManager
    2. GameplayDeveloper → BrowserTester
    3. Self-repair loop (max 5 итераций)
    4. BuildManager → ZIP package
  - [x] Обработка ошибок на каждом этапе с откатом
  - [x] **Файлы:** `src/pipeline/orchestrator.ts`
  - [x] **Логирование:** `INFO` для каждого этапа, `DEBUG` для передачи контекста между агентами, `ERROR` для критических сбоев
  - [x] **Тесты:** `tests/pipeline/orchestrator.test.ts` - интеграционный тест полного цикла (моки агентов)
  - [x] **Зависит от:** Task 7.1, Task 7.2, Task 7.3, Task 7.4, Task 7.5, Task 6.3

- [x] **Task 8.2: Интеграция Orchestrator в CLI**
  - [x] Обновить `/home/www/yandex-game-html5-factory/src/cli/index.ts`
  - [x] После получения пользовательских input вызывать `FactoryPipeline.run()`
  - [x] Показывать прогресс-бар и статус каждого этапа
  - [x] Обработка ошибок с user-friendly сообщениями
  - [x] **Файлы:** `src/cli/index.ts` (обновить)
  - [x] **Логирование:** `INFO` для прогресса, `ERROR` для ошибок с подсказками пользователю
  - [x] **Зависит от:** Task 8.1, Task 1.3

---

### Фаза 9: Тестирование и Acceptance Tests

**Задачи:**

- [x] **Task 9.1: Acceptance Test 1 & 2 - Генерация без API ключей**
  - [x] Создать `/home/www/yandex-game-html5-factory/tests/acceptance/no-api-keys.test.ts`
  - [x] Очистить все переменные окружения с API ключами
  - [x] Запустить генерацию 2D игры через CLI (мок промпт: "Платформер с прыжками")
  - [x] Запустить генерацию 3D игры через CLI (мок промпт: "Гонка с препятствиями")
  - [x] Проверить:
    - [x] Проекты созданы в `output/`
    - [x] Использованы процедурные ассеты (логи содержат "Using procedural fallback")
    - [x] Игры успешно собираются (`dist/` папка создана)
    - [x] ZIP-пакеты созданы
  - [x] **Файлы:** `tests/acceptance/no-api-keys.test.ts`
  - [x] **Логирование:** `INFO` для каждой проверки, `ERROR` при сбое теста

- [x] **Task 9.2: Acceptance Test 3 & 4 - Провайдеры AI**
  - [x] Создать `/home/www/yandex-game-html5-factory/tests/acceptance/providers.test.ts`
  - [x] Запустить генерацию с `AI_PROVIDER=claude` (мок Claude API)
  - [x] Запустить генерацию с `AI_PROVIDER=codex` (заглушка Codex)
  - [x] Проверить логи использования правильного провайдера
  - [x] Проверить успешную генерацию кода
  - [x] **Файлы:** `tests/acceptance/providers.test.ts`
  - [x] **Логирование:** `INFO` для выбора провайдера, `DEBUG` для вызовов API

- [x] **Task 9.3: Acceptance Test 5 - LOW Preset Performance**
  - [x] Создать `/home/www/yandex-game-html5-factory/tests/acceptance/low-preset.test.ts`
  - [x] Запустить генерацию с `GAME_QUALITY=LOW`
  - [x] Проверить наличие в коде игры:
    - [x] `engine.setHardwareScalingLevel(2)`
    - [x] `shadowsEnabled: false`
    - [x] `maxParticles: 50`
  - [x] Запустить browser test и проверить FPS >= 30
  - [x] **Файлы:** `tests/acceptance/low-preset.test.ts`
  - [x] **Логирование:** `INFO` для проверки кода, `DEBUG` для FPS метрик

- [x] **Task 9.4: Acceptance Test 6 - Self-Repair Loop**
  - [x] Создать `/home/www/yandex-game-html5-factory/tests/acceptance/self-repair.test.ts`
  - [x] Запустить генерацию с намеренной инъекцией ошибки (камера вне сцены)
  - [x] Проверить что:
    - [x] Первый тест провален (чёрный экран в логах)
    - [x] BugFixer вызван
    - [x] Повторный тест успешен
    - [x] Количество итераций <= 5
  - [x] **Файлы:** `tests/acceptance/self-repair.test.ts`
  - [x] **Логирование:** `INFO` для каждой итерации repair loop, `DEBUG` для патчей

- [x] **Task 9.5: Acceptance Test 7 - Yandex Production Package**
  - [x] Создать `/home/www/yandex-game-html5-factory/tests/acceptance/yandex-package.test.ts`
  - [x] Запустить полную генерацию игры
  - [x] Проверить что:
    - [x] ZIP-архив создан в `output/packages/`
    - [x] Архив содержит `index.html` с `<script src="https://yandex.ru/games/sdk/v2"></script>`
    - [x] `dist/` содержит минифицированные JS/CSS файлы
    - [x] Yandex adapter присутствует в коде
  - [x] **Файлы:** `tests/acceptance/yandex-package.test.ts`
  - [x] **Логирование:** `INFO` для проверки архива, `DEBUG` для содержимого файлов

---

### Фаза 10: Документация

**Задачи:**

- [x] **Task 10.1: README.md - User Guide**
  - [x] Создать `/home/www/yandex-game-html5-factory/README.md`
  - [x] Секции:
    - [x] Описание проекта и возможности
    - [x] Быстрый старт (запуск через Docker)
    - [x] Системные требования
    - [x] Структура проекта
    - [x] Конфигурация (переменные окружения)
    - [x] FAQ и troubleshooting
  - [x] **Файлы:** `README.md`
  - [x] **Логирование:** N/A

- [x] **Task 10.2: API Documentation**
  - [x] Создать `/home/www/yandex-game-html5-factory/docs/api.md`
  - [x] Документировать публичные методы всех агентов
  - [x] Документировать интерфейсы AI Providers
  - [x] Документировать Asset Pipeline API
  - [x] Примеры кода для кастомизации
  - [x] **Файлы:** `docs/api.md`
  - [x] **Логирование:** N/A

- [x] **Task 10.3: Architecture Deep Dive**
  - [x] Создать `/home/www/yandex-game-html5-factory/docs/architecture-deep-dive.md`
  - [x] Диаграммы компонентов (текстовые ASCII или mermaid)
  - [x] Подробное описание каждой фазы pipeline
  - [x] Объяснение self-repair loop механики
  - [x] Сравнение с оригинальным Godogen
  - [x] **Файлы:** `docs/architecture-deep-dive.md`
  - [x] **Логирование:** N/A

- [x] **Task 10.4: Game Templates Guide**
  - [x] Создать `/home/www/yandex-game-html5-factory/docs/templates-guide.md`
  - [x] Описание структуры базового шаблона
  - [x] Как создавать кастомные шаблоны
  - [x] Особенности 2D vs 3D шаблонов
  - [x] Интеграция Yandex SDK в шаблонах
  - [x] **Файлы:** `docs/templates-guide.md`
  - [x] **Логирование:** N/A

- [x] **Task 10.5: Performance Optimization Guide**
  - [x] Создать `/home/www/yandex-game-html5-factory/docs/performance-guide.md`
  - [x] Объяснение Performance Budgets
  - [x] Как работает runtime monitoring
  - [x] Best practices для слабого железа
  - [x] Профилирование и отладка FPS issues
  - [x] **Файлы:** `docs/performance-guide.md`
  - [x] **Логирование:** N/A

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

- [x] **Архитектурные решения основаны на ARCHITECTURE.md**, который содержит детальный анализ Godogen и адаптации для Yandex Games
- [x] **Offline-first подход критичен**: фабрика должна работать без единого API ключа
- [x] **Визуальная валидация обязательна**: успешный build != рабочая игра
- [x] **Performance budgets не опциональны**: игры должны работать на слабом железе
- [x] **Docker изолирует окружение**: пользователю не нужно ничего устанавливать вручную
- [x] **2D != 3D с ограничениями**: отдельные оптимизированные шаблоны и рендер-пути
