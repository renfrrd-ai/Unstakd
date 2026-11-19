ALTER TABLE "deployments" ADD COLUMN "preview_pr" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "previews_enabled" boolean DEFAULT false NOT NULL;