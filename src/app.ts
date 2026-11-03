import express from "express";
import cors from "cors";
import authRoutes from "./modules/auth/auth.routes";
import { notFoundHandler } from "./common/middlewares/not-found";
import { errorHandler } from "./common/middlewares/error-handler";
import { env } from "./env";

const app = express();

app.set("trust proxy", env.TRUST_PROXY);

app.use(cors({ origin: [new URL(env.FRONTEND_URL).origin] }));

app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
