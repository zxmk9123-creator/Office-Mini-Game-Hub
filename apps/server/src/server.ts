import { createApp } from "./app";
import { getDb } from "./db";
import { getGameRegistry } from "./gameRegistry";
import { syncGamesTable } from "./syncGamesTable";

const port = process.env.PORT ? Number(process.env.PORT) : 4000;

async function main() {
  await syncGamesTable(getDb(), getGameRegistry());
  const app = createApp();
  app.listen(port, () => {
    console.log(`server listening on :${port}`);
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
