CREATE TABLE `delivery_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`recorded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_delivery_events_provider` ON `delivery_events` (`provider_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `email_outbox` (
	`subscriber_id` integer NOT NULL,
	`fund_id` text NOT NULL,
	`accession` text NOT NULL,
	`subject` text NOT NULL,
	`html` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`subscriber_id`, `fund_id`, `accession`)
);
--> statement-breakpoint
CREATE TABLE `refresh_locks` (
	`name` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_health` (
	`source_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`checked_at` text NOT NULL,
	`last_success_at` text,
	`latest_article_at` text,
	`article_count` integer DEFAULT 0 NOT NULL,
	`error` text
);
