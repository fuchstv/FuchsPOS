# Linux Server Deployment Guide

This document describes how to deploy the FuchsPOS stack on a standalone Linux server without relying on Azure Container Apps. The steps assume an Ubuntu 22.04 LTS host, but they are compatible with other modern distributions that provide Docker Engine packages.

## 1. Prepare the host

1. **Create a dedicated system user** so the source tree and Docker volumes are not owned by `root`:
   ```bash
   sudo adduser --system --group --home /opt/fuchspos fuchspos
   sudo usermod -aG docker fuchspos
   ```
2. **Harden SSH** (optional but recommended): disable password login (`PasswordAuthentication no`) and enforce key-based access.
3. **Enable the firewall** and open the HTTP(S) ports that will be proxied to the containers:
   ```bash
   sudo ufw allow OpenSSH
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

## 2. Install dependencies

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

> **Tip:** If you plan to run `npm` utilities (e.g., Prisma migrations) directly on the server, install Node.js LTS via the NodeSource repository.

## 3. Retrieve the repository and configure environment

```bash
sudo -u fuchspos -H bash -c '
  cd /opt/fuchspos && \
  git clone https://github.com/fuchstv/FuchsPOS.git repo && \
  cd repo && \
  cp .env.example .env.production
'
```

Edit `/opt/fuchspos/repo/.env.production` and provide production secrets (database password, customer API key, JWT secrets, etc.). When running on a single host, the default PostgreSQL/Redis containers from `docker-compose.yml` are sufficient. Point `BACKEND_URL` and `VITE_API_URL` to the public domain of the server (e.g., `https://pos.example.com`).

## 4. Launch the stack with Docker Compose

Switch to the repository directory and run the production profile:

```bash
cd /opt/fuchspos/repo
sudo -u fuchspos docker compose --profile prod --env-file .env.production up -d --build
```

This starts the backend, frontend, PostgreSQL, Redis, and the worker/seed containers with persistent volumes under `/var/lib/docker/volumes/`.

### SSL termination

Run an edge proxy such as Nginx or Caddy on the host to terminate TLS and forward traffic to the containers:

```nginx
server {
  listen 80;
  server_name pos.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl;
  server_name pos.example.com;

  ssl_certificate /etc/letsencrypt/live/pos.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/pos.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:5173;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3000/;
  }
}
```

Automate certificate renewal with Certbot (`sudo certbot --nginx -d pos.example.com`).

## 5. Create a systemd service

Keep the stack running automatically by adding `/etc/systemd/system/fuchspos.service`:

```ini
[Unit]
Description=FuchsPOS Monorepo
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=/opt/fuchspos/repo
EnvironmentFile=/opt/fuchspos/repo/.env.production
RemainAfterExit=yes
ExecStart=/usr/bin/docker compose --profile prod --env-file .env.production up -d --build
ExecStop=/usr/bin/docker compose --profile prod --env-file .env.production down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Enable the unit:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fuchspos.service
```

## 6. Upgrades and maintenance

- **Pull new commits**:
  ```bash
  cd /opt/fuchspos/repo
  sudo -u fuchspos git fetch origin
  sudo -u fuchspos git checkout main
  sudo -u fuchspos git pull --ff-only
  sudo systemctl restart fuchspos.service
  ```
- **Run Prisma migrations manually** (only when you need to inspect the DB outside of Docker):
  ```bash
  cd backend
  npm install
  npx prisma migrate deploy --schema prisma/schema.prisma
  ```
- **Database backups**: schedule `docker exec postgres pg_dump -U postgres fuchspos > /backups/fuchspos-$(date +%F).sql`. Store the dumps on an encrypted volume or off-site bucket.
- **Monitoring**: `docker compose ps`, `docker compose logs -f backend`, and `systemctl status fuchspos.service` provide quick health checks.

Following these steps results in a reproducible Linux deployment that mirrors the Docker Compose topology used locally, without the need for managed cloud services.
