CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'dead');--> statement-breakpoint
CREATE TABLE "job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"organizationId" uuid,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"maxAttempts" integer DEFAULT 5 NOT NULL,
	"runAt" timestamp DEFAULT now() NOT NULL,
	"lockedAt" timestamp,
	"lastError" text,
	"idempotencyKey" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"finishedAt" timestamp,
	CONSTRAINT "job_idempotencyKey_unique" UNIQUE("idempotencyKey")
);
