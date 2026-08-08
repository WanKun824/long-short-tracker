CREATE TABLE `public_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`fund_id` text NOT NULL,
	`kind` text NOT NULL,
	`source_name` text NOT NULL,
	`source_url` text NOT NULL,
	`title` text NOT NULL,
	`published_at` text NOT NULL,
	`discovered_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_public_signals_fund_url` ON `public_signals` (`fund_id`,`source_url`);--> statement-breakpoint
CREATE INDEX `idx_public_signals_latest` ON `public_signals` (`fund_id`,`published_at`);