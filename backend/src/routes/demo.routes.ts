import express from "express";
import { simulatePayment } from "../modules/payment/demoPayment.service.js";

const router = express.Router();

router.post("/demo/payment", async (req, res) => {
  const { amount, orderId } = req.body;
  const tx = await simulatePayment(amount, orderId);
  res.json(tx);
});

export default router;
