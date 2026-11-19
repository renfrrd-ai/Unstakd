CREATE TABLE "app_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"cpu_pct" real NOT NULL,
	"mem_bytes" bigint NOT NULL,
	"restarts" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_metrics" ADD CONSTRAINT "app_metrics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_metrics_project_at" ON "app_metrics" USING btree ("project_id","at");