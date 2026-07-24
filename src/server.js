const http = require("node:http");
const { createApp } = require("./app");

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 39387);

const app = createApp();
const server = http.createServer(app);

server.listen(port, host, () => {
  console.log(`IMA workflow listening on http://${host}:${port}`);
  console.log("Webhook path: /webhook");
});
