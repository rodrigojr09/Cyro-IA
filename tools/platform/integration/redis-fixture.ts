// Test-only RESP fixture. This is explicitly NOT a real Redis 7.2 validation.
import { createServer, Socket } from "node:net";
export async function startRedisFixture() {
  const values = new Map<string, { value: string; expires: number }>();
  const sockets = new Set<Socket>();
  function get(key: string) {
    const item = values.get(key);
    if (item && item.expires < Date.now()) {
      values.delete(key);
      return undefined;
    }
    return item;
  }
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let buffer = Buffer.alloc(0),
      database = "0";
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length) {
        const first = buffer.indexOf("\r\n");
        if (first < 0) return;
        const count = Number(buffer.subarray(1, first).toString());
        const parts: string[] = [];
        let offset = first + 2;
        for (let i = 0; i < count; i++) {
          const end = buffer.indexOf("\r\n", offset);
          if (end < 0) return;
          const length = Number(buffer.subarray(offset + 1, end).toString());
          if (buffer.length < end + 2 + length + 2) return;
          parts.push(buffer.subarray(end + 2, end + 2 + length).toString());
          offset = end + 2 + length + 2;
        }
        buffer = buffer.subarray(offset);
        const command = parts[0]?.toUpperCase();
        const key = database + ":" + parts[1];
        const bulk = (value: string | undefined) =>
          socket.write(
            value === undefined
              ? "$-1\r\n"
              : `$${Buffer.byteLength(value)}\r\n${value}\r\n`,
          );
        switch (command) {
          case "PING":
            socket.write("+PONG\r\n");
            break;
          case "AUTH":
          case "CLIENT":
            socket.write("+OK\r\n");
            break;
          case "SELECT":
            database = parts[1];
            socket.write("+OK\r\n");
            break;
          case "INFO":
            bulk(
              "redis_version:0.0.0-test-fixture\r\nloading:0\r\nrole:master\r\n",
            );
            break;
          case "GET":
            bulk(get(key)?.value);
            break;
          case "SET":
            values.set(key, {
              value: parts[2],
              expires:
                parts[3]?.toUpperCase() === "EX"
                  ? Date.now() + Number(parts[4]) * 1000
                  : Infinity,
            });
            socket.write("+OK\r\n");
            break;
          case "DEL":
            socket.write(`:${values.delete(key) ? 1 : 0}\r\n`);
            break;
          case "EVAL": {
            const actual = database + ":" + parts[3];
            const prior = get(actual);
            const n = Number(prior?.value || "0") + 1;
            values.set(actual, {
              value: String(n),
              expires: prior?.expires || Date.now() + Number(parts[4]) * 1000,
            });
            socket.write(`:${n}\r\n`);
            break;
          }
          case "QUIT":
            socket.end("+OK\r\n");
            break;
          default:
            socket.write("-ERR unsupported fixture command\r\n");
        }
      }
    });
    socket.on("error", () => {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return {
    port,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
