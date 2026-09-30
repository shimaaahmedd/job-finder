import "dotenv/config";
import { createServer } from "./api/server";

/**
 * Application entry point. Starts the HTTP server.
 */
const port = Number(process.env.PORT) || 3000;
const app = createServer();

app.listen(port, () => {
    console.log(`Job-finder API listening on http://localhost:${port}`);
});
