import { createReadStream } from "node:fs";
import type {
  HistoryListResponse,
  ImportHistoryRequest,
  ImportHistoryResponse
} from "@image2/shared";
import type { FastifyInstance } from "fastify";
import { AppError } from "./errors.js";
import {
  clearHistoryRecords,
  deleteHistoryRecord,
  getHistoryImageAsset,
  importHistoryRecords,
  listHistoryRecords
} from "./history-store.js";

const MAX_IMPORT_RECORDS = 200;

function getIdParam(params: unknown): string {
  if (
    typeof params === "object" &&
    params !== null &&
    "id" in params &&
    typeof params.id === "string" &&
    params.id.trim()
  ) {
    return params.id.trim();
  }

  throw new AppError("BAD_REQUEST", "History id is required.", 400);
}

export async function registerHistoryRoutes(server: FastifyInstance) {
  server.get("/api/history", async (): Promise<HistoryListResponse> => ({
    records: listHistoryRecords()
  }));

  server.post("/api/history/import", async (request): Promise<ImportHistoryResponse> => {
    const body = (request.body ?? {}) as Partial<ImportHistoryRequest>;

    if (!Array.isArray(body.records)) {
      throw new AppError("BAD_REQUEST", "History records are required.", 400);
    }

    if (body.records.length > MAX_IMPORT_RECORDS) {
      throw new AppError(
        "BAD_REQUEST",
        `Import is limited to ${MAX_IMPORT_RECORDS} history records.`,
        400
      );
    }

    return importHistoryRecords(body.records);
  });

  server.get("/api/history/images/:id/file", async (request, reply) => {
    const id = getIdParam(request.params);
    const asset = getHistoryImageAsset(id);

    if (!asset) {
      throw new AppError("HISTORY_NOT_FOUND", "History image was not found.", 404);
    }

    return reply.type(asset.mimeType).send(createReadStream(asset.absolutePath));
  });

  server.delete("/api/history/:id", async (request, reply) => {
    const id = getIdParam(request.params);
    const deleted = deleteHistoryRecord(id);

    if (!deleted) {
      throw new AppError("HISTORY_NOT_FOUND", "History item was not found.", 404);
    }

    return reply.code(204).send();
  });

  server.delete("/api/history", async (_request, reply) => {
    clearHistoryRecords();
    return reply.code(204).send();
  });
}
