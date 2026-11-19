ALTER TABLE "databases" ADD COLUMN "local_port" integer;--> statement-breakpoint
ALTER TABLE "databases" ADD CONSTRAINT "databases_local_port_unique" UNIQUE("local_port");