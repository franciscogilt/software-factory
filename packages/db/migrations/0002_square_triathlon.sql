CREATE TABLE "recovery_code" (
	"userId" text NOT NULL,
	"codeHash" text NOT NULL,
	"usedAt" timestamp,
	CONSTRAINT "recovery_code_userId_codeHash_pk" PRIMARY KEY("userId","codeHash")
);
--> statement-breakpoint
ALTER TABLE "user_totp" ADD COLUMN "lastUsedStep" bigint;--> statement-breakpoint
ALTER TABLE "recovery_code" ADD CONSTRAINT "recovery_code_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;