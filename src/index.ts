import 'dotenv/config';
import { handler } from "./handler.js";
import { mockSQSEvent } from "./simulator.js";

console.log("Iniciando simulación de consumo SQS...");

handler(mockSQSEvent)
  .then(() => {
    console.log("Simulación finalizada");
  })
  .catch((err) => {
    console.error("Error procesando mensajes:", err);
    process.exit(1);
  });