CREATE TABLE "attendance_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"attendance_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "clock_in_photo_id" uuid;--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "clock_out_photo_id" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "require_selfie" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "selfie_retention_days" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_photos" ADD CONSTRAINT "attendance_photos_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_photos" ADD CONSTRAINT "attendance_photos_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_photos" ADD CONSTRAINT "attendance_photos_attendance_id_attendance_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_photos_company_time" ON "attendance_photos" USING btree ("company_id","created_at");