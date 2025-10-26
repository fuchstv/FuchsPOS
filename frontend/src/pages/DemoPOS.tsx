import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import api from "../api/client";

const socket = io("http://localhost:4000");

export default function DemoPOS() {
  const [status, setStatus] = useState("");
  const [receipt, setReceipt] = useState<any | null>(null);

  useEffect(() => {
    socket.on("payment_update", msg => {
      if (msg.state === "STARTED") setStatus("💳 Zahlung läuft …");
      if (msg.state === "SUCCESS") setStatus("✅ Zahlung erfolgreich!");
    });

    socket.on("receipt_ready", data => {
      setStatus("🧾 Bon erstellt!");
      setReceipt(data);
    });

    return () => {
      socket.off("payment_update");
      socket.off("receipt_ready");
    };
  }, []);

  async function startDemoPayment() {
    setStatus("Starte Demo-Zahlung …");
    await api.post("/demo/payment", { amount: 9.99, orderId: `R-${Date.now()}` });
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>FuchsPOS Demo</h1>
      <button onClick={startDemoPayment} style={{ background: "#16a34a", color: "#fff", padding: "10px 14px", borderRadius: 8, border: 0 }}>
        Demo-Zahlung starten (€ 9,99)
      </button>
      <p style={{ marginTop: 16, fontSize: 18 }}>{status}</p>
      {receipt && (
        <div style={{ marginTop: 16, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
          <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Bon erstellt</h3>
          <div>Sale ID: {receipt.saleId}</div>
          <div>Beleg: {receipt.receiptNo}</div>
          <div>PDF: {receipt.pdfUrl}</div>
        </div>
      )}
    </div>
  );
}
