# Azure Deployment Guide

This guide explains how to provision, configure, and continuously deploy the FuchsPOS monorepo on Azure using Azure Container Apps (ACA), Azure Database for PostgreSQL Flexible Server, Azure Cache for Redis, Azure Key Vault, and Azure Container Registry (ACR).

## Resource topology

```
┌──────────────────────────────────────────────────────────────────────┐
│ Azure Subscription                                                   │
│  ┌───────────────────────┐       ┌───────────────────────┐           │
│  │ Azure Container       │       │ Azure Container       │           │
│  │ Apps - Backend API    │◄──────┤ Apps - Frontend PWA   │           │
│  │ • image: backend      │       │ • image: frontend      │           │
│  │ • secrets via Key Vault│      │ • env VITE_API_URL     │           │
│  └────────────┬──────────┘       └────────────┬──────────┘           │
│               │                             │                        │
│          ┌────▼─────┐                 ┌──────▼──────┐                │
│          │ Azure    │                 │ Azure Cache │                │
│          │ Database │                 │ for Redis   │                │
│          │ for PostgreSQL             │ (session, pub/sub)           │
│          └────┬─────┘                 └──────┬──────┘                │
│               │                             │                        │
│          ┌────▼────────────────────────────────────────────────────┐ │
│          │ Azure Key Vault                                          │ │
│          │ • DATABASE_URL, REDIS_URL, BACKEND_URL, VITE_API_URL,    │ │
│          │   CUSTOMER_API_KEY                                       │ │
│          └──────────┬──────────────────────────────────────────────┘ │
│                     │                                                │
│               ┌─────▼──────┐                                         │
│               │ Azure      │                                        │
│               │ Container   │                                        │
│               │ Registry    │ (stores backend + frontend images)     │
│               └────────────┘                                        │
└──────────────────────────────────────────────────────────────────────┘
```

Key characteristics:

- **Container Apps** host the frontend and backend independently so you can scale or roll them out individually.
- **Azure Database for PostgreSQL Flexible Server** stores all transactional data. The Bicep template configures SSL-only connectivity.
- **Azure Cache for Redis** delivers caching and pub/sub for the NestJS backend.
- **Azure Key Vault** is the single source of truth for application secrets and connection strings. Managed identities on both container apps retrieve these secrets without storing credentials in code.
- **Azure Container Registry** receives images built by GitHub Actions before each deployment.

## Infrastructure as Code

The repository ships with a Bicep template at [`infra/azure/main.bicep`](../infra/azure/main.bicep) that provisions every resource in the topology. Parameters allow you to reuse the template across environments.

### Required parameters

| Parameter | Description |
| --- | --- |
| `acrName` | Globally unique name for the Azure Container Registry. |
| `postgresServerName` | Globally unique PostgreSQL flexible server name. |
| `redisName` | Azure Cache for Redis name. |
| `keyVaultName` | Key Vault name. |
| `keyVaultAdminObjectId` | Azure AD object ID that should have admin access to the vault. |
| `backendImage` / `frontendImage` | Container image references that should be deployed (e.g., `myacr.azurecr.io/fuchspos-backend:latest`). |
| `customerApiKey`, `backendPublicUrl`, `frontendApiUrl` | Secret values written into Key Vault during deployment. |

> **Tip:** Provide additional parameters (Postgres size, Redis SKU, target ports) when you need to override defaults. Review inline comments in the Bicep file for the full list.

### Provisioning command

Use an existing resource group and run the deployment with the Azure CLI:

```bash
az deployment group create \ \
  --resource-group <rg-name> \ \
  --template-file infra/azure/main.bicep \ \
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

The template outputs the ACR login server together with the URLs you just supplied so downstream tooling can reuse them.

## Secret management

Application configuration is stored in Azure Key Vault and injected into the containers as managed secrets.

1. **Write connection strings and API keys** (you can rerun this any time values change):
   ```bash
   az keyvault secret set \
     --vault-name <kv> \
     --name DATABASE-URL \
     --value "postgresql://<user>:<password>@<server>.postgres.database.azure.com:5432/fuchspos?schema=public&sslmode=require"

   az keyvault secret set \
     --vault-name <kv> \
     --name REDIS-URL \
     --value "rediss://<redis-name>.redis.cache.windows.net:6380"

   az keyvault secret set --vault-name <kv> --name BACKEND-URL --value https://<backend-host>
   az keyvault secret set --vault-name <kv> --name VITE-API-URL --value https://<backend-host>/api
   az keyvault secret set --vault-name <kv> --name CUSTOMER-API-KEY --value <customer-api-key>
   ```

2. **Verify container apps can access the vault**:
   ```bash
   az containerapp secret list --name fuchspos-backend --resource-group <rg>
   az containerapp secret list --name fuchspos-frontend --resource-group <rg>
   ```

Managed identities and role assignments created by the Bicep template allow both applications to fetch the configured secrets.

## GitHub Actions deployment workflow

The repository includes [`/.github/workflows/azure-deploy.yml`](../.github/workflows/azure-deploy.yml). The workflow performs the following steps on each push to `main` (and supports manual triggers):

1. Authenticate to Azure using the federated `AZURE_CREDENTIALS` service principal.
2. Log in to ACR.
3. Build the frontend and backend Docker images with BuildKit and push them to `<acr>.azurecr.io` with two tags: the commit SHA and `latest`.
4. Update the Container Apps with the freshly pushed images and point environment variables to Key Vault secrets via `secretref:` syntax.
5. Force a new revision per deployment so rolling updates happen gracefully without downtime.

### Required repository secrets

| Secret | Description |
| --- | --- |
| `AZURE_CREDENTIALS` | JSON output from `az ad sp create-for-rbac --sdk-auth`. |
| `AZURE_RESOURCE_GROUP` | Resource group that hosts Container Apps. |
| `AZURE_BACKEND_CONTAINERAPP` / `AZURE_FRONTEND_CONTAINERAPP` | ACA names created by the Bicep template. |
| `ACR_NAME` / `ACR_LOGIN_SERVER` | Registry name and login server (e.g., `fuchsposregistry.azurecr.io`). |

When the workflow runs, each container app receives the following environment variables:

| App | Variable | Source |
| --- | --- | --- |
| Backend | `PORT` | Static value (`3000`). |
| Backend | `DATABASE_URL`, `REDIS_URL`, `BACKEND_URL`, `CUSTOMER_API_KEY` | Key Vault secrets injected as `secretref`. |
| Frontend | `VITE_API_URL` | Key Vault secret referencing the backend public endpoint. |

## Rolling updates and operations

- **Manual image update** (e.g., during hotfix investigations):
  ```bash
  az containerapp update \ \
    --name fuchspos-backend \ \
    --resource-group <rg> \ \
    --image <acr>.azurecr.io/fuchspos-backend:<tag> \ \
    --revision-suffix hotfix-$(date +%Y%m%d%H%M)
  ```
  Repeat for the frontend when needed.

- **Scale adjustments**:
  ```bash
  az containerapp update --name fuchspos-backend --resource-group <rg> --min-replicas 2 --max-replicas 6
  ```

- **Revision cleanup**: retain only the newest two revisions per app to avoid hitting limits:
  ```bash
  az containerapp revision list --name fuchspos-backend --resource-group <rg> --output table
  az containerapp revision deactivate --name fuchspos-backend --resource-group <rg> --revision <old-revision>
  ```

## Troubleshooting tips

- **Container is stuck in `ImagePull`** – confirm the GitHub Action pushed the tag to ACR and that the registry credentials in the container app are valid (`az containerapp show ... --query properties.configuration.registries`).
- **HTTP 500 with database errors** – check the Key Vault connection string and ensure the PostgreSQL firewall allows Azure services or the Container Apps outbound addresses.
- **Secrets not updating** – after changing a Key Vault secret, run `az containerapp revision restart` so the latest value is mounted.

With the template, workflow, and commands above you can recreate the entire POS stack in a repeatable, auditable way and keep secrets outside of the codebase.
