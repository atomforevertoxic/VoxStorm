# VoxStorm

Веб-сервис автоматизации мозговых штормов: участники говорят, браузер расшифровывает речь,
LLM превращает сказанное в структурированные идеи и интеллект-карту, готовую к экспорту.

## Возможности

- **Сессии** — создание, участники, активная сессия с реплеем, завершённые сессии и статистика.
- **Голосовой ввод** прямо в браузере (Web Speech API) + ручная фиксация сказанного.
- **AI-обработка** — LLM разбирает расшифровку на отдельные идеи (`POST /api/ideas/process-raw`)
  и категоризирует их (`POST /api/ideas/categorize`); для идей без AI-анализа есть категория
  «Общее» (fallback при голосовом вводе).
- **Интеллект-карта** — узлы-идеи с позициями, выбор/удаление узла, перемещение центра карты.
- **Рекап и экспорт** — итоги сессии в DOCX (`docx`) и PDF (`jspdf` + `html2canvas`).
- Открытый API — OpenAPI/Swagger (`MapOpenApi`).

## Стек

| Часть | Технологии |
|---|---|
| Backend | .NET 10, ASP.NET Core Web API, Entity Framework Core (**SQLite**, авто-миграции при старте) |
| LLM | **Groq** (`llama-3.1-8b-instant`) по умолчанию, **Ollama** (`llama3.2`) локально — выбор через `LlmSettings:Provider` |
| Frontend | React 18, React Router 6, Tailwind CSS 4 (CRA), docx / jspdf / html2canvas |
| Тесты | xUnit — **68 тестов**: контроллеры, интеграционные, Groq- и Ollama-сервисы |
| Лицензия | MIT |

## Структура

```
backend/VoxStorm.Api/
  Controllers/     # Sessions, Ideas, Participants
  Services/        # ILlmService + GroqLlmService, OllamaLlmService, LlmServiceFactory
  Data/, Models/, Migrations/
backend/VoxStorm.Api.Tests/   # xUnit (unit + интеграционные + LLM)
frontend/src/
  pages/           # ActiveSession (голос, карта), Recap (итоги, экспорт)
  App.js           # маршрутизация
Plan.txt           # план проекта
```

## Запуск

Требуется: **.NET 10 SDK**, **Node.js 18+**; ключ **Groq** *или* локальный **Ollama**.

```bash
# 1. Backend → http://localhost:5021 (схема в launchSettings; БД создаётся и мигрирует сама)
cd backend/VoxStorm.Api
dotnet run

# 2. Frontend → http://localhost:3000 (CORS backend'а разрешён на этот порт)
cd frontend
npm install
npm start
```

**LLM-провайдер** — `backend/VoxStorm.Api/appsettings.json`, секция `LlmSettings`:

```json
"LlmSettings": {
  "Provider": "Groq",            // или "Ollama"
  "GroqApiKey": "<ключ>",
  "GroqModel": "llama-3.1-8b-instant",
  "OllamaUrl": "http://localhost:11434",
  "OllamaModel": "llama3.2:latest"
}
```

## API (кратко)

| Ресурс | Эндпоинты |
|---|---|
| `Sessions` | `GET/POST /api/sessions`, `GET /completed`, `GET/{id}`, `GET/{id}/stats`, `PUT/{id}`, `PUT/{id}/resume`, `PUT/{id}/center-position`, `DELETE/{id}` |
| `Ideas` | `GET/POST /api/ideas`, `GET/{id}`, `PUT/{id}`, `PUT/{id}/position`, `DELETE/{id}`, `POST process-raw`, `POST categorize` |
| `Participants` | CRUD: `GET/POST /api/participants`, `GET/{id}`, `PUT/{id}`, `DELETE/{id}` |

## Тесты

```bash
dotnet test backend/VoxStorm.Api.Tests
```
