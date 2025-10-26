import { io } from "../../app.js";

export async function triggerAutoReceipt(txId: string) {
  console.log("🧾 [DEMO] Auto-Receipt für", txId);

  const saleId = Math.floor(Math.random() * 10000);
  const receiptNo = `R-${saleId}`;
  const pdfUrl = `/api/sales/${saleId}/receipt/pdf`;

  // Fake Druck
  console.log("🖨️ [DEMO] Bon gedruckt:", receiptNo);

  io.emit("receipt_ready", { saleId, receiptNo, pdfUrl });
}
