import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const buildMode = pgEnum("build_mode", ["railpack", "dockerfile", "static"]);
export const projectState = pgEnum("project_state", ["active", "standby"]);
export const deploymentStatus = pgEnum("deployment_status", [
  "queued",
  "building",
  "deploying",
  "live",
  "failed",
  "superseded",
  "cancelled",
]);
export const deploymentTrigger = pgEnum("deployment_trigger", ["create", "push", "manual", "rollback", "preview"]);
export const domainStatus = pgEnum("domain_status", ["pending", "verified", "active", "misconfigured"]);
export const dbEngine = pgEnum("db_engine", ["postgres", "redis"]);
export const dbStatus = pgEnum("db_status", ["provisioning", "running", "stopped", "failed"]);
export const backupStatus = pgEnum("backup_status", ["running", "done", "failed"]);

export const projects = pgTable("projects", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  repo: text("repo").notNull(),
  branch: text("branch").notNull().default("main"),
  installationId: bigint("installation_id", { mode: "number" }),
  buildMode: buildMode("build_mode").notNull().default("railpack"),
  framework: text("framework"),
  port: integer("port").notNull().default(3000),
  healthPath: text("health_path").notNull().default("/"),
  cpuLimit: real("cpu_limit").notNull().default(1),
  memoryMb: integer("memory_mb").notNull().default(512),
  state: projectState("state").notNull().default("active"),
  previewsEnabled: boolean("previews_enabled").notNull().default(false),
  liveDeploymentId: uuid("live_deployment_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type DeployStep = {
  name: "clone" | "build" | "push" | "start" | "health" | "switch";
  status: "pending" | "running" | "done" | "failed" | "skipped";
  startedAt?: string;
  durationMs?: number;
  note?: string;
};

export const deployments = pgTable(
  "deployments",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    trigger: deploymentTrigger("trigger").notNull(),
    status: deploymentStatus("status").notNull().default("queued"),
    branch: text("branch").notNull(),
    commitSha: text("commit_sha"),
    commitMessage: text("commit_message"),
    imageTag: text("image_tag"),
    containerName: text("container_name"),
    rollbackOf: uuid("rollback_of"),
    // Set for pull-request previews; those never touch the project's live deploy or route.
    previewPr: integer("preview_pr"),
    steps: jsonb("steps").$type<DeployStep[]>().notNull().default(sql`'[]'::jsonb`),
    error: text("error"),
    notified: text("notified"),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [unique().on(t.projectId, t.number)],
);

export const envVars = pgTable(
  "env_vars",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    valueEnc: text("value_enc").notNull(),
    secret: boolean("secret").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.projectId, t.key)],
);

export const domains = pgTable("domains", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  hostname: text("hostname").notNull().unique(),
  isPrimary: boolean("is_primary").notNull().default(false),
  status: domainStatus("status").notNull().default("pending"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const databases = pgTable("databases", {
  id: id(),
  name: text("name").notNull().unique(),
  engine: dbEngine("engine").notNull(),
  version: text("version").notNull(),
  status: dbStatus("status").notNull().default("provisioning"),
  containerName: text("container_name").notNull(),
  volumeName: text("volume_name").notNull(),
  credentialsEnc: text("credentials_enc").notNull(),
  backupsEnabled: boolean("backups_enabled").notNull().default(true),
  // Published on the server's loopback only, for SSH tunnels from tools like TablePlus.
  localPort: integer("local_port").unique(),
  usageBytes: bigint("usage_bytes", { mode: "number" }),
  usageCheckedAt: timestamp("usage_checked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const databaseLinks = pgTable(
  "database_links",
  {
    id: id(),
    databaseId: uuid("database_id")
      .notNull()
      .references(() => databases.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    envKey: text("env_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.databaseId, t.projectId), unique().on(t.projectId, t.envKey)],
);

export const backups = pgTable("backups", {
  id: id(),
  databaseId: uuid("database_id")
    .notNull()
    .references(() => databases.id, { onDelete: "cascade" }),
  objectKey: text("object_key"),
  storage: text("storage").notNull().default("local"),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  status: backupStatus("status").notNull().default("running"),
  error: text("error"),
  createdAt: createdAt(),
});

export const auditEvents = pgTable("audit_events", {
  id: id(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>(),
  createdAt: createdAt(),
});

export type Project = typeof projects.$inferSelect;
export type Deployment = typeof deployments.$inferSelect;
export type EnvVar = typeof envVars.$inferSelect;
export type Domain = typeof domains.$inferSelect;
export type Database = typeof databases.$inferSelect;
export type Backup = typeof backups.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;

// Small key/value store for platform settings (alert targets, etc.). Values are encrypted.
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  valueEnc: text("value_enc").notNull(),
  updatedAt: updatedAt(),
});

// One sample per live app per minute, kept 7 days.
export const appMetrics = pgTable(
  "app_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    cpuPct: real("cpu_pct").notNull(),
    memBytes: bigint("mem_bytes", { mode: "number" }).notNull(),
    restarts: integer("restarts").notNull(),
  },
  (t) => [index("app_metrics_project_at").on(t.projectId, t.at)],
);
export type AppMetric = typeof appMetrics.$inferSelect;

// CLI/API tokens. Only a SHA-256 hash is stored; the token is shown once at creation.
export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  createdAt: createdAt(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});
