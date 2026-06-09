import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  GeneratedImage,
  GenerationHistoryInputImage,
  GenerationHistoryRecord
} from "@image2/shared";

type HistoryCreateInput = {
  id?: string;
  createdAt: string;
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  mode: GenerationHistoryRecord["parameters"]["mode"];
  prompt: string;
  negativePrompt?: string;
  ratio?: string;
  quality?: string;
  count?: number;
  seed?: number;
  strength?: number;
  inputImage?: GenerationHistoryInputImage;
  images: GeneratedImage[];
};

type HistoryRow = {
  id: string;
  created_at: string;
  provider_id: string;
  provider_name: string;
  model_id: string;
  model_name: string;
  mode: GenerationHistoryRecord["parameters"]["mode"];
  prompt: string;
  negative_prompt: string | null;
  ratio: string | null;
  quality: string | null;
  count: number | null;
  seed: number | null;
  strength: number | null;
  input_image_json: string | null;
};

type ImageRow = {
  id: string;
  history_id: string;
  remote_url: string | null;
  local_asset_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  seed: number | null;
  metadata_json: string;
};

type DataUrlParts = {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  extension: "png" | "jpg" | "webp";
  bytes: Buffer;
};

let database: DatabaseSync | undefined;
let openedDatabasePath: string | undefined;

export function getDataDir(): string {
  return resolve(process.env.IMAGE2_DATA_DIR ?? join(process.cwd(), ".image2-data"));
}

function getDatabasePath(): string {
  return join(getDataDir(), "image2.sqlite");
}

function generatedAssetUrl(imageId: string): string {
  return `/api/history/images/${encodeURIComponent(imageId)}/file`;
}

function isInsideDataDir(absolutePath: string): boolean {
  const dataDir = getDataDir();
  return absolutePath === dataDir || absolutePath.startsWith(`${dataDir}\\`) || absolutePath.startsWith(`${dataDir}/`);
}

function ensureDatabase(): DatabaseSync {
  const databasePath = getDatabasePath();
  if (database && openedDatabasePath === databasePath) {
    return database;
  }

  if (database) {
    database.close();
  }

  mkdirSync(dirname(databasePath), { recursive: true });
  database = new DatabaseSync(databasePath);
  openedDatabasePath = databasePath;
  database.exec("PRAGMA foreign_keys = ON;");
  runMigrations(database);
  return database;
}

function runMigrations(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generation_history (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      provider_name TEXT NOT NULL,
      model_id TEXT NOT NULL,
      model_name TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('text-to-image', 'image-to-image')),
      prompt TEXT NOT NULL,
      negative_prompt TEXT,
      ratio TEXT,
      quality TEXT,
      count INTEGER,
      seed INTEGER,
      strength REAL,
      input_image_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generation_images (
      id TEXT PRIMARY KEY,
      history_id TEXT NOT NULL REFERENCES generation_history(id) ON DELETE CASCADE,
      remote_url TEXT,
      local_asset_path TEXT,
      mime_type TEXT,
      size_bytes INTEGER,
      width INTEGER,
      height INTEGER,
      seed INTEGER,
      checksum TEXT,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_generation_history_created_at
      ON generation_history(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_generation_images_history_id
      ON generation_images(history_id);
  `);
  db.prepare(
    "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)"
  ).run(1, new Date().toISOString());
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isSensitiveKey(key: string): boolean {
  return /api[_-]?key|authorization|token|secret|dataurl|data_url/i.test(key);
}

function sanitizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeJson);
  }

  if (typeof value === "string") {
    return value.replace(
      /data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+/gi,
      "data:image/[redacted];base64,[redacted]"
    );
  }

  if (typeof value === "object" && value !== null) {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (!isSensitiveKey(key)) {
        output[key] = sanitizeJson(nested);
      }
    }

    return output;
  }

  return value;
}

function jsonString(value: unknown): string {
  return JSON.stringify(sanitizeJson(value ?? {}));
}

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseInputImage(value: string | null): GenerationHistoryInputImage | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as Partial<GenerationHistoryInputImage>;
    if (
      parsed &&
      (parsed.mimeType === "image/png" ||
        parsed.mimeType === "image/jpeg" ||
        parsed.mimeType === "image/webp") &&
      typeof parsed.sizeBytes === "number"
    ) {
      return {
        fileName: optionalString(parsed.fileName),
        mimeType: parsed.mimeType,
        sizeBytes: parsed.sizeBytes
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function parseDataUrl(value: string | undefined): DataUrlParts | undefined {
  const match = value?.match(
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i
  );
  if (!match) {
    return undefined;
  }

  const mimeType = match[1].toLowerCase() as DataUrlParts["mimeType"];
  return {
    mimeType,
    extension: mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] as "png" | "webp",
    bytes: Buffer.from(match[2].replace(/\s/g, ""), "base64")
  };
}

function isRemoteOrRelativeUrl(value: string | undefined): value is string {
  if (!value) {
    return false;
  }

  return /^https?:\/\//i.test(value) || value.startsWith("/");
}

function writeGeneratedAsset(imageId: string, dataUrl: DataUrlParts, createdAt: string) {
  const date = new Date(createdAt);
  const year = Number.isNaN(date.getTime())
    ? "unknown"
    : String(date.getUTCFullYear());
  const month = Number.isNaN(date.getTime())
    ? "unknown"
    : String(date.getUTCMonth() + 1).padStart(2, "0");
  const relativePath = join(
    "assets",
    "generated",
    year,
    month,
    `${imageId}.${dataUrl.extension}`
  );
  const absolutePath = join(getDataDir(), relativePath);

  mkdirSync(dirname(absolutePath), { recursive: true });
  rmSync(absolutePath, { force: true });
  writeFileSync(absolutePath, dataUrl.bytes);

  return {
    relativePath,
    mimeType: dataUrl.mimeType,
    sizeBytes: dataUrl.bytes.byteLength,
    checksum: createHash("sha256").update(dataUrl.bytes).digest("hex")
  };
}

function insertImage(
  db: DatabaseSync,
  historyId: string,
  image: GeneratedImage,
  createdAt: string
): GeneratedImage {
  const imageId = randomUUID();
  const dataUrl = parseDataUrl(image.url);
  const asset = dataUrl ? writeGeneratedAsset(imageId, dataUrl, createdAt) : undefined;
  const remoteUrl = asset ? undefined : isRemoteOrRelativeUrl(image.url) ? image.url : undefined;
  const metadata = parseJsonObject(jsonString(image.metadata));

  db.prepare(`
    INSERT INTO generation_images (
      id, history_id, remote_url, local_asset_path, mime_type, size_bytes,
      width, height, seed, checksum, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    imageId,
    historyId,
    remoteUrl ?? null,
    asset?.relativePath ?? null,
    asset?.mimeType ?? null,
    asset?.sizeBytes ?? null,
    image.width ?? null,
    image.height ?? null,
    image.seed ?? null,
    asset?.checksum ?? null,
    jsonString(metadata),
    createdAt
  );

  return {
    id: imageId,
    url: remoteUrl,
    localPath: asset ? generatedAssetUrl(imageId) : image.localPath,
    width: image.width,
    height: image.height,
    seed: image.seed,
    metadata
  };
}

function historyExists(db: DatabaseSync, id: string): boolean {
  const row = db.prepare("SELECT id FROM generation_history WHERE id = ?").get(id);
  return typeof row === "object" && row !== null;
}

export function saveHistoryRecord(input: HistoryCreateInput): GenerationHistoryRecord {
  const db = ensureDatabase();
  const id = input.id ?? randomUUID();

  if (historyExists(db, id)) {
    const existing = getHistoryRecord(id);
    if (existing) {
      return existing;
    }
  }

  db.prepare(`
    INSERT INTO generation_history (
      id, provider_id, provider_name, model_id, model_name, mode, prompt,
      negative_prompt, ratio, quality, count, seed, strength, input_image_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.providerId,
    input.providerName,
    input.modelId,
    input.modelName,
    input.mode,
    input.prompt,
    input.negativePrompt ?? null,
    input.ratio ?? null,
    input.quality ?? null,
    input.count ?? null,
    input.seed ?? null,
    input.strength ?? null,
    input.inputImage ? jsonString(input.inputImage) : null,
    input.createdAt
  );

  const images = input.images.map((image) => insertImage(db, id, image, input.createdAt));

  return {
    id,
    createdAt: input.createdAt,
    providerId: input.providerId,
    providerName: input.providerName,
    modelId: input.modelId,
    modelName: input.modelName,
    parameters: {
      mode: input.mode,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      ratio: input.ratio,
      quality: input.quality,
      count: input.count,
      seed: input.seed,
      strength: input.strength,
      inputImage: input.inputImage
    },
    images
  };
}

function recordFromRows(row: HistoryRow, images: ImageRow[]): GenerationHistoryRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    providerId: row.provider_id,
    providerName: row.provider_name,
    modelId: row.model_id,
    modelName: row.model_name,
    parameters: {
      mode: row.mode,
      prompt: row.prompt,
      negativePrompt: row.negative_prompt ?? undefined,
      ratio: row.ratio ?? undefined,
      quality: row.quality ?? undefined,
      count: row.count ?? undefined,
      seed: row.seed ?? undefined,
      strength: row.strength ?? undefined,
      inputImage: parseInputImage(row.input_image_json)
    },
    images: images.map((image) => ({
      id: image.id,
      url: image.remote_url ?? undefined,
      localPath: image.local_asset_path ? generatedAssetUrl(image.id) : undefined,
      width: image.width ?? undefined,
      height: image.height ?? undefined,
      seed: image.seed ?? undefined,
      metadata: parseJsonObject(image.metadata_json)
    }))
  };
}

export function listHistoryRecords(): GenerationHistoryRecord[] {
  const db = ensureDatabase();
  const historyRows = db.prepare(`
    SELECT id, created_at, provider_id, provider_name, model_id, model_name,
      mode, prompt, negative_prompt, ratio, quality, count, seed, strength,
      input_image_json
    FROM generation_history
    ORDER BY created_at DESC
  `).all() as HistoryRow[];
  const imageRows = db.prepare(`
    SELECT id, history_id, remote_url, local_asset_path, mime_type, size_bytes,
      width, height, seed, metadata_json
    FROM generation_images
    ORDER BY created_at ASC
  `).all() as ImageRow[];
  const imagesByHistory = new Map<string, ImageRow[]>();

  for (const image of imageRows) {
    const existing = imagesByHistory.get(image.history_id) ?? [];
    existing.push(image);
    imagesByHistory.set(image.history_id, existing);
  }

  return historyRows.map((row) => recordFromRows(row, imagesByHistory.get(row.id) ?? []));
}

export function getHistoryRecord(id: string): GenerationHistoryRecord | undefined {
  const db = ensureDatabase();
  const row = db.prepare(`
    SELECT id, created_at, provider_id, provider_name, model_id, model_name,
      mode, prompt, negative_prompt, ratio, quality, count, seed, strength,
      input_image_json
    FROM generation_history
    WHERE id = ?
  `).get(id) as HistoryRow | undefined;

  if (!row) {
    return undefined;
  }

  const images = db.prepare(`
    SELECT id, history_id, remote_url, local_asset_path, mime_type, size_bytes,
      width, height, seed, metadata_json
    FROM generation_images
    WHERE history_id = ?
    ORDER BY created_at ASC
  `).all(id) as ImageRow[];

  return recordFromRows(row, images);
}

function deleteAsset(relativePath: string | null) {
  if (!relativePath) {
    return;
  }

  const dataDir = getDataDir();
  const absolutePath = resolve(dataDir, relativePath);
  if (!isInsideDataDir(absolutePath) || isAbsolute(relativePath)) {
    return;
  }

  rmSync(absolutePath, { force: true });
}

function imageRowsForHistory(db: DatabaseSync, historyId: string): ImageRow[] {
  return db.prepare(`
    SELECT id, history_id, remote_url, local_asset_path, mime_type, size_bytes,
      width, height, seed, metadata_json
    FROM generation_images
    WHERE history_id = ?
  `).all(historyId) as ImageRow[];
}

export function deleteHistoryRecord(id: string): boolean {
  const db = ensureDatabase();
  const images = imageRowsForHistory(db, id);
  const result = db.prepare("DELETE FROM generation_history WHERE id = ?").run(id);

  if (result.changes > 0) {
    for (const image of images) {
      deleteAsset(image.local_asset_path);
    }
  }

  return result.changes > 0;
}

export function clearHistoryRecords(): void {
  const db = ensureDatabase();
  const images = db.prepare(`
    SELECT id, history_id, remote_url, local_asset_path, mime_type, size_bytes,
      width, height, seed, metadata_json
    FROM generation_images
  `).all() as ImageRow[];

  db.prepare("DELETE FROM generation_history").run();
  for (const image of images) {
    deleteAsset(image.local_asset_path);
  }
}

export function getHistoryImageAsset(id: string): { absolutePath: string; mimeType: string } | undefined {
  const db = ensureDatabase();
  const row = db.prepare(
    "SELECT local_asset_path, mime_type FROM generation_images WHERE id = ?"
  ).get(id) as Pick<ImageRow, "local_asset_path" | "mime_type"> | undefined;

  if (!row?.local_asset_path || !row.mime_type) {
    return undefined;
  }

  const dataDir = getDataDir();
  const absolutePath = resolve(dataDir, row.local_asset_path);
  if (!isInsideDataDir(absolutePath) || isAbsolute(row.local_asset_path)) {
    return undefined;
  }

  if (!existsSync(absolutePath)) {
    return undefined;
  }

  return {
    absolutePath,
    mimeType: row.mime_type
  };
}

export function importHistoryRecords(records: GenerationHistoryRecord[]): {
  imported: number;
  records: GenerationHistoryRecord[];
} {
  let imported = 0;

  for (const record of records) {
    const input = historyInputFromRecord(record);
    if (!input) {
      continue;
    }

    const alreadyExists = getHistoryRecord(input.id ?? "");
    saveHistoryRecord(input);
    if (!alreadyExists) {
      imported += 1;
    }
  }

  return {
    imported,
    records: listHistoryRecords()
  };
}

function historyInputFromRecord(
  record: GenerationHistoryRecord
): HistoryCreateInput | undefined {
  if (
    !record ||
    typeof record.id !== "string" ||
    typeof record.createdAt !== "string" ||
    typeof record.providerId !== "string" ||
    typeof record.modelId !== "string" ||
    !record.parameters ||
    !Array.isArray(record.images)
  ) {
    return undefined;
  }

  const mode = record.parameters.mode;
  if (mode !== "text-to-image" && mode !== "image-to-image") {
    return undefined;
  }

  const prompt = optionalString(record.parameters.prompt);
  if (!prompt) {
    return undefined;
  }

  return {
    id: record.id,
    createdAt: record.createdAt,
    providerId: record.providerId,
    providerName: optionalString(record.providerName) ?? record.providerId,
    modelId: record.modelId,
    modelName: optionalString(record.modelName) ?? record.modelId,
    mode,
    prompt,
    negativePrompt: optionalString(record.parameters.negativePrompt),
    ratio: optionalString(record.parameters.ratio),
    quality: optionalString(record.parameters.quality),
    count: optionalNumber(record.parameters.count),
    seed: optionalNumber(record.parameters.seed),
    strength: optionalNumber(record.parameters.strength),
    inputImage: record.parameters.inputImage
      ? {
          fileName: optionalString(record.parameters.inputImage.fileName),
          mimeType: record.parameters.inputImage.mimeType,
          sizeBytes: record.parameters.inputImage.sizeBytes
        }
      : undefined,
    images: record.images
      .filter((image) => image && typeof image.id === "string")
      .map((image) => ({
        id: image.id,
        url: optionalString(image.url),
        width: optionalNumber(image.width),
        height: optionalNumber(image.height),
        seed: optionalNumber(image.seed),
        metadata: parseJsonObject(jsonString(image.metadata))
      }))
  };
}

export function closeHistoryStoreForTests(options: { removeDataDir?: boolean } = {}) {
  if (database) {
    database.close();
    database = undefined;
    openedDatabasePath = undefined;
  }

  if (options.removeDataDir) {
    rmSync(getDataDir(), { recursive: true, force: true });
  }
}
