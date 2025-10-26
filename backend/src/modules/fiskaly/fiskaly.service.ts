export async function createFiskalyTransaction(data: any) {
  console.log("🧾 [DEMO] Fiskaly-Signatur simuliert:", data);
  return {
    tse_serial_number: "DEMO-TSE",
    number: Date.now(),
    time_start: new Date().toISOString(),
    time_end: new Date().toISOString(),
    total_amount: data.amount,
    signature_value: "DEMO_SIGNATURE"
  };
}
