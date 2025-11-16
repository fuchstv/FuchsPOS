# 🦊 FuchsPOS Monorepo

FuchsPOS is a modern, full-stack monorepo that provides a comprehensive Point-of-Sale (POS) solution. It is designed to be a progressive web application (PWA) that can be used on any device with a web browser. The project is built with a focus on developer experience, featuring a complete Docker-based setup for easy local development.

## ✨ Features

- **Modern Frontend**: A responsive and intuitive React-based PWA built with Vite, Tailwind CSS, and Zustand for state management.
- **Robust Backend**: A powerful NestJS backend with a clear modular architecture, leveraging Prisma for database access and Redis for caching and real-time events.
- **Offline-First Functionality**: The frontend is designed to work offline, queuing payments and syncing with the backend when a connection is available.
- **Real-time Updates**: The POS dashboard updates in real-time with new sales, preorders, and cash events from other terminals.
- **Digitale Belege**: Einheitliche Renderer erzeugen HTML- sowie PDF-Belege, die direkt aus dem POS heruntergeladen werden können.
- **Barcode-fähiger Produktkatalog**: Produkte können neben SKU nun auch eine optionale EAN/GTIN erhalten und werden in allen Import-, Such- und POS-Flows automatisch darüber gefunden.
- **Comprehensive Reporting**: A dedicated reporting dashboard provides insights into sales, employee performance, and product categories.
- **Developer-Friendly**: The entire stack can be run locally with a single `docker compose up` command, and the repository is structured to be easy to navigate and contribute to.

## 🚀 Getting Started

This project is designed to be run with Docker Compose, which simplifies the setup process by managing all the necessary services.

### Prerequisites

- **Docker**: Ensure that you have Docker and Docker Compose installed on your system. You can find installation instructions for your operating system on the [official Docker website](https://docs.docker.com/get-docker/).
- **Node.js and npm**: While not strictly required for the Docker-based setup, it is recommended to have Node.js and npm installed for running commands locally (e.g., for database migrations).

### Local Development with Docker

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/fuchstv/FuchsPOS
    cd fuchspos
    ```

2.  **Create an environment file**:
    Copy the example `.env` file to create your local configuration:
    ```bash
    cp .env.example .env
    ```
    You can customize the variables in this file if needed, but the defaults are suitable for local development.

3.  **Build and run the services**:
    ```bash
    docker compose up --build
    ```
    This command will build the Docker images for the frontend and backend, start all the services (including PostgreSQL and Redis), and automatically apply any pending database migrations.

4.  **Access the applications**:
    -   **Frontend**: [http://localhost:5173](http://localhost:5173)
    -   **Backend API**: [http://localhost:3000/api](http://localhost:3000/api)
    -   **Health Check**: [http://localhost:3000/api/health](http://localhost:3000/api/health)

##  architecture

This repository is a monorepo containing two main projects:

-   `backend/`: A [NestJS](https://nestjs.com/) application that serves as the API for the POS system. It handles business logic, data persistence, and real-time communication.
-   `frontend/`: A [React](https://reactjs.org/) application built with [Vite](https://vitejs.dev/) that provides the user interface for the POS.

### Technology Stack

-   **Frontend**:
    -   [React](https://reactjs.org/) with [Vite](https://vitejs.dev/) for a fast development experience.
    -   [Tailwind CSS](https://tailwindcss.com/) for styling.
    -   [Zustand](https://github.com/pmndrs/zustand) for state management.
    -   [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) for offline storage.
-   **Backend**:
    -   [NestJS](https://nestjs.com/) for a modular and scalable server-side architecture.
    -   [Prisma](https://www.prisma.io/) as the ORM for interacting with the PostgreSQL database.
    -   [Redis](https://redis.io/) for caching and as a message broker for real-time events.
-   **Database**:
    -   [PostgreSQL](https://www.postgresql.org/) as the primary relational database.
-   **DevOps**:
    -   [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/) for containerization and local development.

## Database Migrations

Database migrations are managed using [Prisma Migrate](https://www.prisma.io/docs/concepts/components/prisma-migrate). When the application starts, the `backend` service automatically applies any pending migrations to the PostgreSQL database.

To create a new migration, you can run the following commands from the root of the repository:

1.  **Navigate to the backend directory**:
    ```bash
    cd backend
    ```

2.  **Run the migration command**:
    ```bash
    npm run prisma:migrate -- --name <your-migration-name>
    ```
    This will create a new SQL migration file in the `backend/prisma/migrations` directory.

After making changes to the Prisma schema (`backend/prisma/schema.prisma`), you should also regenerate the Prisma Client:
```bash
npm run prisma:generate
```

## 📦 Barcode / EAN Workflows

FuchsPOS unterstützt vollständig getrennte SKU- und EAN-Verwaltung:

- Das Prisma-Modell `Product` besitzt ein optionales `ean`-Feld inklusive Tenant-bezogenem Unique-Index (`backend/prisma/schema.prisma`).
- Backend-DTOs, Importe sowie der `InventoryService` normalisieren eingegebene Codes, schreiben sie ins neue Feld und verwenden sie bei Lookups (z. B. CSV-Importe, Lagerkorrekturen, Wareneingänge).
- Die Verwaltungs- und Import-Formulare im Frontend zeigen ein eigenes EAN-Eingabefeld an, validieren GTINs beim Upload und listen den Wert in Tabellen auf.
- Der POS-Store priorisiert beim Scannen von Barcodes den EAN-Abgleich und fällt erst anschließend auf SKUs zurück; Seeds und Mock-Katalogeinträge enthalten entsprechende Codes.

Damit lassen sich Hardware-Scanner ohne zusätzliche Konfiguration verwenden, während bestehende SKU-basierte Abläufe unverändert bleiben.

## API Endpoints

The backend API provides several endpoints for interacting with the POS system. Here are some of the key endpoints:

-   `GET /api/health`: Returns the health status of the backend and its dependencies (database and cache).
-   `GET /api/pos/catalog`: Retrieves the product catalog.
-   `POST /api/pos/payments`: Processes a new payment.
-   `GET /api/pos/cart?terminalId=TERMINAL`: Returns the last persisted cart for the given terminal if it is still valid.
-   `GET /api/pos/payments/latest`: Returns the most recent sale so a terminal can restore its context after a reload.
-   `GET /api/pos/receipts/:id/download?format=pdf|html`: Streams the rendered receipt as HTML or PDF for download.
-   `POST /api/pos/cart/sync`: Syncs the local cart with the server.
-   `GET /api/reporting/dashboard`: Retrieves data for the reporting dashboard.
-   `POST /api/reporting/exports`: Requests a new report export.

For a complete list of all available endpoints and their parameters, please refer to the backend source code and the NestJS controllers.

## Local Development without Docker

If you prefer to run the services locally without Docker, you will need to have PostgreSQL and Redis installed and running on your machine.

1.  **Configure environment variables**:
    Ensure that you have a `.env` file in the root of the repository with the correct `DATABASE_URL` and `REDIS_URL` values for your local setup.

2.  **Run the backend**:
    ```bash
    cd backend
    npm install
    npm run prisma:generate
    npm run start:dev
    ```

3.  **Run the frontend**:
    ```bash
    cd frontend
    npm install
    npm run dev
    ```
