# Windows Server Deployment Guide

This guide walks through hosting the Docker-based FuchsPOS stack on Windows Server 2022. The steps are oriented toward operators who prefer Windows tooling but still want a reproducible deployment using Docker Compose.

## 1. Prerequisites

1. **Install all updates** via Windows Update and reboot.
2. **Enable the Containers and Hyper-V features**:
   ```powershell
   Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All -NoRestart
   Enable-WindowsOptionalFeature -Online -FeatureName Containers -All -NoRestart
   Restart-Computer
   ```
3. **Install Docker Desktop for Windows** and enable the "Use WSL 2 based engine" option during onboarding.
4. **Install Windows Terminal, Git, and Node.js LTS** (Node is optional but useful for Prisma tooling).
5. **Create a dedicated service account** (e.g., `fuchspos-svc`) and add it to the local "docker-users" group so scheduled tasks can start containers without elevated rights.

## 2. Clone the repository inside WSL 2 or a Linux VM

Running Docker Desktop with WSL 2 provides the best I/O performance. Open Ubuntu (or another distribution) inside WSL and run:

```bash
sudo apt update && sudo apt install -y git
mkdir -p ~/apps && cd ~/apps
git clone https://github.com/fuchstv/FuchsPOS.git
cd FuchsPOS
cp .env.example .env.production
```

Edit `.env.production` with production values (database credentials, customer API key, public URLs). When the containers run via Docker Desktop, the ports `3000` and `5173` will be exposed on `localhost` of the Windows host.

If you prefer to keep the working tree on NTFS instead of WSL, store it under `C:\Apps\FuchsPOS` and run commands through PowerShell. Docker Desktop will automatically mount the folder into the Linux VM.

## 3. Start the stack

### Using WSL

```bash
docker compose --profile prod --env-file .env.production up -d --build
```

### Using PowerShell on Windows

```powershell
cd C:\Apps\FuchsPOS
Copy-Item .env.example .env.production -Force
# Update .env.production with secrets
$env:DOCKER_DEFAULT_PLATFORM="linux/amd64" # optional when building on Intel hosts
& "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe" compose --profile prod --env-file .env.production up -d --build
```

## 4. Reverse proxy and TLS

Expose the application securely using IIS or an external reverse proxy:

1. Install the **IIS Web Server** role and the **URL Rewrite** + **Application Request Routing (ARR)** modules.
2. Create a site bound to `https://pos.example.com` with a certificate managed by **Certify The Web** or **Let’s Encrypt Win-ACME**.
3. Configure rewrite rules to forward traffic:
   - `/` → `http://localhost:5173/`
   - `/api/*` → `http://localhost:3000/`

Alternatively, run **Caddy** or **Traefik** in a separate Docker container and terminate TLS there.

## 5. Keep the containers running

### Option A: Scheduled Task

Create a scheduled task that runs at startup under the `fuchspos-svc` account:

1. Trigger: "At startup".
2. Action: `Program/script: powershell.exe`
   ```powershell
   -File C:\Apps\FuchsPOS\scripts\start.ps1
   ```

Create `scripts/start.ps1` with:
```powershell
cd C:\Apps\FuchsPOS
& "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe" compose --profile prod --env-file .env.production up -d
```

### Option B: NSSM service

Install [NSSM](https://nssm.cc/download) and register a Windows service that launches the same command. This is useful when you need automatic restarts if the Docker daemon becomes available later in the boot process.

## 6. Logs, updates, and maintenance

- **Logs**:
  ```powershell
  docker compose logs backend
  docker compose logs frontend
  ```
- **Updating the code** (inside WSL or PowerShell):
  ```bash
  git pull --ff-only origin main
  docker compose --profile prod --env-file .env.production up -d --build
  ```
- **Database backups**: run `docker exec postgres pg_dump -U postgres fuchspos > C:\Backups\fuchspos-%date:~-4,4%%date:~-10,2%%date:~-7,2%.sql` and store the files on resilient storage.
- **Health checks**: monitor `http://localhost:3000/api/health` and container status via Docker Desktop or `docker ps`.

With these steps, Windows Server operators can host FuchsPOS with the same Docker Compose topology used for local development while integrating with familiar Windows administration tooling.
