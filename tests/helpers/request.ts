import supertest from "supertest";
import app from "../../src/app";

export function api() {
  return supertest(app);
}

export function bodyOf<T = Record<string, unknown>>(res: { body: unknown }): T {
  return res.body as T;
}
