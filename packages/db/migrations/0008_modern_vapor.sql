CREATE TABLE "consent" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"category" text NOT NULL,
	"granted" boolean NOT NULL,
	"policyVersion" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terms_acceptance" (
	"userId" text NOT NULL,
	"version" text NOT NULL,
	"acceptedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "terms_acceptance_userId_version_pk" PRIMARY KEY("userId","version")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "deletionRequestedAt" timestamp;--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_acceptance" ADD CONSTRAINT "terms_acceptance_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;