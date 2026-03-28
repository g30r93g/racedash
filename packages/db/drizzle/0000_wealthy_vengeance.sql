CREATE TYPE "public"."job_status" AS ENUM('uploading', 'queued', 'rendering', 'compositing', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."license_status" AS ENUM('active', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."license_tier" AS ENUM('plus', 'pro');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('reserved', 'consumed', 'released');--> statement-breakpoint
CREATE TYPE "public"."social_upload_status" AS ENUM('queued', 'uploading', 'processing', 'live', 'failed');--> statement-breakpoint
CREATE TABLE "connected_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"account_name" text,
	"account_id" text,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "connected_accounts_user_platform_uniq" UNIQUE("user_id","platform")
);
--> statement-breakpoint
CREATE TABLE "credit_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pack_name" text NOT NULL,
	"rc_total" integer NOT NULL,
	"rc_remaining" integer NOT NULL,
	"price_gbp" numeric(10, 2) NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"stripe_payment_intent_id" text,
	CONSTRAINT "credit_packs_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id"),
	CONSTRAINT "rc_remaining_non_negative" CHECK (rc_remaining >= 0)
);
--> statement-breakpoint
CREATE TABLE "credit_reservation_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"pack_id" uuid NOT NULL,
	"rc_deducted" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"rc_amount" integer NOT NULL,
	"status" "reservation_status" DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "credit_reservations_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'uploading' NOT NULL,
	"config" jsonb NOT NULL,
	"input_s3_keys" text[] NOT NULL,
	"upload_ids" jsonb,
	"output_s3_key" text,
	"download_expires_at" timestamp with time zone,
	"slot_task_token" text,
	"render_task_token" text,
	"remotion_render_id" text,
	"rc_cost" integer,
	"sfn_execution_arn" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tier" "license_tier" NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" "license_status" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "licenses_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "social_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"status" "social_upload_status" DEFAULT 'queued' NOT NULL,
	"metadata" jsonb,
	"rc_cost" integer DEFAULT 10 NOT NULL,
	"credit_reservation_id" uuid,
	"platform_url" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"billing_country" text,
	"stripe_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_packs" ADD CONSTRAINT "credit_packs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_reservation_packs" ADD CONSTRAINT "credit_reservation_packs_reservation_id_credit_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."credit_reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_reservation_packs" ADD CONSTRAINT "credit_reservation_packs_pack_id_credit_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."credit_packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_uploads" ADD CONSTRAINT "social_uploads_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_uploads" ADD CONSTRAINT "social_uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_uploads" ADD CONSTRAINT "social_uploads_credit_reservation_id_credit_reservations_id_fk" FOREIGN KEY ("credit_reservation_id") REFERENCES "public"."credit_reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_packs_user_fifo_idx" ON "credit_packs" USING btree ("user_id","expires_at") WHERE rc_remaining > 0;--> statement-breakpoint
CREATE INDEX "credit_reservation_packs_reservation_id_idx" ON "credit_reservation_packs" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "jobs_user_id_status_idx" ON "jobs" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "jobs_user_queued_slot_idx" ON "jobs" USING btree ("user_id","created_at") WHERE status = 'queued' AND slot_task_token IS NOT NULL;--> statement-breakpoint
CREATE INDEX "licenses_user_id_idx" ON "licenses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "social_uploads_job_id_idx" ON "social_uploads" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "social_uploads_user_id_idx" ON "social_uploads" USING btree ("user_id");