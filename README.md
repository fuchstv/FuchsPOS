# 🦊 FuchsPOS Monorepo

FuchsPOS ist ein modernes Monorepo für eine progressive Point-of-Sale-Experience:

- ⚛️ React-basierte POS-PWA mit Tailwind CSS und Zustand-Store
- 🚀 NestJS-Backend mit Health-Check- und Demo-Payment-Endpunkt
- 🗃️ PostgreSQL inklusive Prisma-Migrations-Setup
- 🚦 Redis als Event-/Cache-Layer
- 🐳 Vollständig docker-compose-fähig für lokales Development

## 🚀 Schnellstart

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000/api
- Health Check: http://localhost:3000/api/health

Die Services installieren automatisch ihre Abhängigkeiten, führen Prisma-Migrationen aus und starten anschließend den Entwicklungsmodus.

## 📁 Struktur

```
backend/   NestJS + Prisma + Redis Integration
frontend/  React + Vite + Tailwind POS-PWA
```

## 🧭 Prisma Migrations

Prisma nutzt PostgreSQL als Datenbank. Die initiale Migration befindet sich unter `backend/prisma/migrations/` und wird beim Start via `prisma migrate deploy` angewendet.

Manuelle Migrationen können lokal wie folgt erzeugt werden:

```bash
cd backend
npm install
npm run prisma:migrate -- --name <migration-name>
```

Der `DATABASE_URL` wird aus `.env` gelesen. Nach Änderungen am Schema nicht vergessen, den Prisma-Client neu zu generieren (`npm run prisma:generate`).

## 🧪 Health Check

Der Endpoint `GET /api/health` liefert Statusinformationen zu Backend, Datenbank und Redis und eignet sich zur Überwachung in Docker oder in Deployment-Pipelines.

## 🛠️ Entwicklung ohne Docker

```bash
# Backend
cd backend
npm install
npm run prisma:generate
npm run start:dev

# Frontend
cd frontend
npm install
npm run dev
```

Stelle sicher, dass PostgreSQL sowie Redis lokal laufen und die Umgebungsvariablen mit `.env` konfiguriert wurden.
