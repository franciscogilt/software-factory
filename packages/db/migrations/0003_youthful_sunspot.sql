CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organizationId" uuid,
	"actorUserId" text,
	"action" text NOT NULL,
	"targetType" text,
	"targetId" text,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
