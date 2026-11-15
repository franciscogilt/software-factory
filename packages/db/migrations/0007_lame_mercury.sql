CREATE TABLE "alert_state" (
	"key" text PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"firedAt" timestamp,
	"lastNotifiedAt" timestamp,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "flow_metric" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"flow" text NOT NULL,
	"outcome" text NOT NULL,
	"durationMs" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "flow_metric_created_idx" ON "flow_metric" USING btree ("createdAt");