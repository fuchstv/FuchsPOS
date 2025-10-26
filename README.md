# 🦊 FuchsPOS

FuchsPOS ist ein dockerisiertes POS-Demo-System mit:

- 💳 Unzer-Kartenzahlung (Demo/Mock)
- 🧾 Fiskaly-TSE-Simulation
- ⚡ Echtzeit-Bon (Socket.IO)
- 🖨️ PDF/ESC-POS Drucker-Simulation (Konsole)
- 🗄️ SQLite + Prisma
- 🐳 Docker (Frontend + Backend)

## 🚀 Schnellstart
```bash
# ZIP entpacken und in Ordner wechseln
cp .env.example .env
docker-compose up
```

- Frontend: http://localhost:5173  
- Backend: http://localhost:4000

Im Frontend die Demo-Seite öffnen und „Demo-Zahlung starten“ klicken.

## 📁 Struktur
```
backend/  - Express/Socket.IO + Demo-Payment + Fiskaly-Mock
frontend/ - React/Vite POS-Demo
data/     - SQLite-Datei (persistiert im Volume)
```
