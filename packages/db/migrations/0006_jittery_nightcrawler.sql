CREATE TABLE "rate_limit" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"windowStart" timestamp NOT NULL,
	"strikes" integer DEFAULT 0 NOT NULL,
	"blockedUntil" timestamp
);
