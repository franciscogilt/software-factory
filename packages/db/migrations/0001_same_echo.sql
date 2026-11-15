CREATE TABLE "mfa_session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"verifiedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_totp" (
	"userId" text PRIMARY KEY NOT NULL,
	"secretEncrypted" text NOT NULL,
	"confirmedAt" timestamp,
	"failedAttempts" integer DEFAULT 0 NOT NULL,
	"lockedUntil" timestamp
);
--> statement-breakpoint
ALTER TABLE "mfa_session" ADD CONSTRAINT "mfa_session_sessionToken_session_sessionToken_fk" FOREIGN KEY ("sessionToken") REFERENCES "public"."session"("sessionToken") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_totp" ADD CONSTRAINT "user_totp_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;