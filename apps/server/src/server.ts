import { createApp } from "./app";
import { closeDb, getDb } from "./db";
import { getGameRegistry } from "./gameRegistry";
import { syncGamesTable } from "./syncGamesTable";

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const host = "0.0.0.0";

async function main() {
  await syncGamesTable(getDb(), getGameRegistry());
  const app = createApp();
  const server = app.listen(port, host, () => {
    console.log(`server listening on ${host}:${port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close(() => {
      closeDb()
        .catch((error) => console.error("Error closing database connection:", error))
        .finally(() => process.exit(0));
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
