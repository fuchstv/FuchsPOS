import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import demoRoutes from "./routes/demo.routes.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", demoRoutes);

const server = http.createServer(app);
export const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", socket => {
  console.log("🔌 POS verbunden:", socket.id);
  socket.on("disconnect", () => console.log("❌ POS getrennt:", socket.id));
});

server.listen(4000, () => console.log("✅ Backend läuft auf Port 4000"));
