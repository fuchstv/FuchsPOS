import { io } from "../../app.js";
import { triggerAutoReceipt } from "../sales/autoReceipt.service.js";

export async function simulatePayment(amount: number, orderId: string) {
  const txId = `demo-${Date.now()}`;
  console.log("💳 [DEMO] Zahlung simuliert:", txId, amount);
  io.emit("payment_update", { txId, state: "STARTED", orderId });

  setTimeout(async () => {
    io.emit("payment_update", { txId, state: "SUCCESS", orderId });
    await triggerAutoReceipt(txId);
  }, 3000);

  return { id: txId, state: "STARTED", amount, orderId };
}
