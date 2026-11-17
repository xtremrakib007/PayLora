ALTER TABLE "attendance" ADD COLUMN "late_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "late_waived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "late_deduction" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "late_grace_minutes" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "late_round_minutes" integer DEFAULT 1 NOT NULL;