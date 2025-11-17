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

### Order & Delivery APIs

The new fulfillment stack exposes dedicated endpoints that connect online customers, kitchen staff, warehouse operators and drivers. All customer-facing requests must include the `x-pos-api-key` header. The default value is `demo-customer-key` and can be overridden via the `CUSTOMER_API_KEY` environment variable. Additionally, requests are rate limited (defaults: 60 requests/minute, configurable via `CUSTOMER_RATE_LIMIT` and `CUSTOMER_RATE_WINDOW_MS`).

| Endpoint | Description |
| --- | --- |
| `POST /api/orders` | Accepts a new customer order. Validates inventory availability, reserves the requested delivery slot and kicks off kitchen/warehouse tasks. Requires API key + rate limiting. |
| `GET /api/orders?tenantId=...&status=...` | Lists orders for a tenant including slot, fulfillment tasks and driver assignment. |
| `PATCH /api/orders/:id/status` | Confirms status transitions (e.g. `CONFIRMED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED`). Automatically updates kitchen and dispatch workflows. |
| `GET /api/delivery-slots?tenantId=...` | Returns all upcoming slots together with their remaining capacity. |
| `POST /api/delivery-slots/:id/reservations` | Checks/reserves capacity for ad-hoc workflows (internal tooling can use the same service as the order controller). |
| `GET /api/kitchen/tasks?tenantId=...` | Lists kitchen and warehouse pick tasks so the production dashboard stays in sync. |
| `PATCH /api/kitchen/tasks/:id` | Updates a task status or assigns a staff member. |
| `POST /api/dispatch/assignments` | Plans/updates driver assignments for a specific order (preferred driver routing). |
| `PATCH /api/dispatch/assignments/:id/status` | Sets driver progress (`PLANNED`, `EN_ROUTE`, `DELIVERED`, `FAILED`). |

Every state change is fanned out via WebSockets (`orders.created`, `orders.updated`, `kitchen.tasks.updated`, `dispatch.assignments.updated`, `delivery-slots.updated`) and via HTTP webhooks stored in the `ApiWebhook` table. Kitchen screens and the driver app can therefore subscribe either to `/ws/pos` or register a webhook without additional code.

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

## 🔄 Hybrid Setup: Local Code, Containerized Dependencies

For many contributors it is convenient to run PostgreSQL and Redis in Docker while keeping the frontend and backend processes on the host for hot-module reloading.

1. **Start only the infrastructure services**:
   ```bash
   docker compose up postgres redis -d
   ```
   The compose file exposes both services on their default ports (5432 and 6379). Feel free to adjust the ports in `docker-compose.yml` if they conflict with local installations.

2. **Point your `.env` to the containers**:
   ```env
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fuchspos
   REDIS_URL=redis://localhost:6379
   ```

3. **Run backend and frontend locally** following the steps from the "Local Development without Docker" section. Prisma migrations and generators will run against the databases hosted inside Docker.

## 🧪 Ephemeral Preview Environments

When collaborating on larger features, you can spin up disposable preview environments that resemble production but live entirely on your machine.

1. **Create a dedicated `.env.preview`** by copying `.env.example` and overriding any secrets or tenant specific IDs that the review requires.

2. **Use Docker Compose profiles** to start the stack with realistic data seeds:
   ```bash
   docker compose --profile preview up --build
   ```
   The preview profile enables the `seed` service defined in `docker-compose.yml`, which applies extended fixtures for reporting dashboards and fulfillment pipelines.

3. **Share access** by exposing the frontend via a tool such as `cloudflared` or `ngrok`:
   ```bash
   cloudflared tunnel --url http://localhost:5173
   ```
   Reviewers get a public URL while your local backend continues to talk to the private Postgres/Redis containers.

4. **Tear it down** once the review is complete:
   ```bash
   docker compose --profile preview down -v
   ```

## 💻 Windows & WSL 2 Setup

Running Docker inside WSL 2 keeps file system performance high and avoids path translation issues.

1. **Install prerequisites**: Enable WSL 2, install Ubuntu from the Microsoft Store, and install [Docker Desktop](https://www.docker.com/products/docker-desktop/).

2. **Clone the repository inside the Linux file system** (e.g., `~/workspaces/FuchsPOS`) to benefit from native ext4 performance.

3. **Forward ports for mobile testing**:
   ```powershell
   netsh interface portproxy add v4tov4 listenport=5173 listenaddress=0.0.0.0 connectport=5173 connectaddress=<wsl-ip>
   ```
   Replace `<wsl-ip>` with the IP shown by `hostname -I` inside WSL. The same approach works for the backend (port 3000) if you need to reach the API from a device on your LAN.

4. **Memory tuning**: Create or update `C:\Users\<you>\.wslconfig` to constrain background usage when Docker Compose runs many services:
   ```ini
   [wsl2]
  memory=6GB
  processors=4
  ```

## 🖥️ Server deployment guides

Need to run the stack on bare-metal or VM infrastructure? Use the dedicated walkthroughs in the `docs/` folder:

- [Linux server deployment](docs/linux-server-guide.md) – covers hardening, Docker installation, TLS termination, and a `systemd` unit to keep the Compose stack running.
- [Windows Server deployment](docs/windows-server-guide.md) – explains how to run Docker Desktop/WSL on Windows Server, wire up IIS or Caddy for HTTPS, and keep containers alive via Scheduled Tasks or NSSM.

## 🍎 Apple Silicon Notes

All Docker images used by FuchsPOS provide multi-architecture manifests. On Apple Silicon machines:

1. **Update Rosetta** (`softwareupdate --install-rosetta --agree-to-license`) if you plan to run x64-only tooling in the terminal.

2. **Force native builds** to keep `docker compose` fast:
   ```bash
   docker buildx use default
   docker buildx create --use --name fuchspos-arm --driver docker-container --bootstrap
   ```
   The second command enables cross-platform caching so repeated builds reuse previous ARM layers.

3. **Set environment variables** when running Node scripts locally to avoid downloading x64 Prisma engines:
   ```bash
   export PRISMA_CLI_BINARY_TARGETS="native"
   npm run prisma:generate
   ```

4. **Watch mode**: `npm run dev` in the frontend automatically picks the correct Vite binary; no further configuration is necessary.

## ☁️ Azure Deployment

Use the infrastructure-as-code template and GitHub Actions workflow included in this repository whenever you target Azure. The [Azure deployment guide](docs/azure-deployment.md) documents the full topology, required secrets, and CI/CD flow.

### Provision the managed resources

```bash
az deployment group create \
  --resource-group <rg-name> \
  --template-file infra/azure/main.bicep \
  --parameters \
    acrName=<acr> \
    postgresServerName=<pg-server> \
    redisName=<redis> \
    keyVaultName=<kv> \
    keyVaultAdminObjectId=$(az ad signed-in-user show --query id -o tsv) \
    backendImage=<registry>/fuchspos-backend:initial \
    frontendImage=<registry>/fuchspos-frontend:initial \
    backendPublicUrl=https://<backend-host> \
    frontendApiUrl=https://<backend-host>/api \
    customerApiKey=<customer-api-key>
```

### Manage secrets and configuration

```bash
az keyvault secret set --vault-name <kv> --name DATABASE-URL --value "postgresql://..."
az keyvault secret set --vault-name <kv> --name REDIS-URL --value "rediss://..."
az keyvault secret set --vault-name <kv> --name BACKEND-URL --value https://<backend-host>
az keyvault secret set --vault-name <kv> --name VITE-API-URL --value https://<backend-host>/api
az keyvault secret set --vault-name <kv> --name CUSTOMER-API-KEY --value <customer-api-key>
```

### Trigger a rolling update

Once new images are pushed to Azure Container Registry (either manually or through the provided GitHub Actions workflow), roll them out with:

```bash
az containerapp update \
  --name fuchspos-backend \
  --resource-group <rg-name> \
  --image <acr>.azurecr.io/fuchspos-backend:<tag> \
  --revision-suffix hotfix-$(date +%s)

az containerapp update \
  --name fuchspos-frontend \
  --resource-group <rg-name> \
  --image <acr>.azurecr.io/fuchspos-frontend:<tag> \
  --revision-suffix web-$(date +%s)
```
