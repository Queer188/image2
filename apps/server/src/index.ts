import { buildServer } from "./app.js";

const server = buildServer();
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";

try {
  await server.listen({ port, host });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
