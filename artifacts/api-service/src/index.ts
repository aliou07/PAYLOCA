import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "La variable d’environnement PORT est obligatoire mais absente.",
  );
}

const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Valeur PORT invalide : « ${rawPort} »`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Erreur lors de l’écoute du port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
