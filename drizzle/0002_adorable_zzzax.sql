CREATE TABLE `refresh_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text DEFAULT 'manual' NOT NULL,
	`scheduled_at` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`status` text DEFAULT 'running' NOT NULL,
	`reason` text,
	`duration_ms` integer,
	`fund_checks` integer DEFAULT 0 NOT NULL,
	`updated_funds` integer DEFAULT 0 NOT NULL,
	`public_signal_count` integer DEFAULT 0 NOT NULL,
	`emails_sent` integer DEFAULT 0 NOT NULL,
	`emails_failed` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_refresh_runs_started_at` ON `refresh_runs` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_refresh_runs_status_started_at` ON `refresh_runs` (`status`,`started_at`);