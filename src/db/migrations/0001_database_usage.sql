ALTER TABLE "databases" ADD COLUMN "usage_bytes" bigint;--> statement-breakpoint
ALTER TABLE "databases" ADD COLUMN "usage_checked_at" timestamp with time zone;