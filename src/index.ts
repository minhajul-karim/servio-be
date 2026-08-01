import express from "express";
import { env } from "./env";

const app = express();
const port = env.PORT;

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
