import { Request } from "express";

type Params = Record<string, string>;

export type BodyRequest<TBody> = Request<Params, unknown, TBody>;

export type QueryRequest<TQuery> = Request<Params, unknown, unknown, TQuery>;
