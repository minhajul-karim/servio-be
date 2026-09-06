import express from "express";
import authRoutes from "./modules/auth/auth.routes";
import { notFoundHandler } from "./common/middlewares/not-found";
import { errorHandler } from "./common/middlewares/error-handler";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
