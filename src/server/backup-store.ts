import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

export interface BackupStore {
  readonly kind: "r2" | "local";
  put(key: string, body: Readable): Promise<number>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  describe(key: string): string;
}

class LocalStore implements BackupStore {
  readonly kind = "local";
  constructor(private dir: string) {}
  private file(key: string) {
    const full = path.resolve(this.dir, key);
    if (!full.startsWith(path.resolve(this.dir) + path.sep)) throw new Error("invalid backup key");
    return full;
  }
  async put(key: string, body: Readable) {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    await pipeline(body, createWriteStream(file, { mode: 0o600 }));
    return (await stat(file)).size;
  }
  async get(key: string) {
    return createReadStream(this.file(key));
  }
  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }
  describe(key: string) {
    return `local://${key}`;
  }
}

class R2Store implements BackupStore {
  readonly kind = "r2";
  private client: S3Client;
  constructor(private bucket: string, endpoint: string, accessKeyId: string, secretAccessKey: string) {
    this.client = new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } });
  }
  async put(key: string, body: Readable) {
    await new Upload({ client: this.client, params: { Bucket: this.bucket, Key: key, Body: body } }).done();
    const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    return head.ContentLength ?? 0;
  }
  async get(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return res.Body as Readable;
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  describe(key: string) {
    return `r2://${this.bucket}/${key}`;
  }
}

let store: BackupStore | undefined;

// R2 when all four variables are set; otherwise a local folder so backups still work in dev.
export function backupStore(): BackupStore {
  if (!store) {
    const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
    store =
      R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET
        ? new R2Store(R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)
        : new LocalStore(process.env.BACKUP_DIR ?? ".data/backups");
  }
  return store;
}
