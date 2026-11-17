ALTER TABLE "attendance" ADD COLUMN "early_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "early_waived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "work_end" text DEFAULT '18:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "early_leave_deduction" boolean DEFAULT false NOT NULL;