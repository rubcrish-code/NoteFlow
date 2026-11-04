// Loopback-only synthetic provider for the isolated Phase B native smoke.
import { createServer } from "node:http";
const port = 19999;
createServer(async (request, response) => {
  const buffers = [];
  for await (const buffer of request) buffers.push(buffer);
  response.setHeader("Content-Type", "application/json");
  try {
    const input = JSON.parse(Buffer.concat(buffers).toString() || "{}");
    if (request.url === "/v1/models") {
      response.end(JSON.stringify({ data: [{ id: "qa-chat" }, { id: "qa-embedding" }] }));
    } else if (request.url === "/v1/embeddings") {
      const texts = Array.isArray(input.input) ? input.input : [input.input];
      response.end(JSON.stringify({ data: texts.map((_, index) => ({ index, embedding: [1, 0.5, 0.25] })) }));
    } else if (request.url === "/v1/chat/completions") {
      const prompt = [...(input.messages ?? [])].reverse().find((message) => message.content?.startsWith("CURRENT_SOURCES_JSON ("))?.content;
      const sources = prompt ? JSON.parse(prompt.slice(prompt.indexOf("\n") + 1, prompt.indexOf("\n\nCURRENT_QUESTION:"))) : [];
      response.end(JSON.stringify({ choices: [{ message: { content: sources.length
        ? sources.map((source) => `**${source.title}**: ${source.content} [[${source.id}]]`).join("\n\n")
        : "Тестовое подключение работает." }, finish_reason: "stop" }] }));
    } else { response.statusCode = 404; response.end("{}"); }
  } catch { response.statusCode = 400; response.end("{}"); }
}).listen(port, "127.0.0.1", () => console.log(`Phase B QA provider: http://127.0.0.1:${port}/v1`));
