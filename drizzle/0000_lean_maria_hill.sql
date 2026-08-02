CREATE TABLE `alert_deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subscriber_id` integer NOT NULL,
	`fund_id` text NOT NULL,
	`accession` text NOT NULL,
	`provider_id` text,
	`status` text NOT NULL,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_alert_delivery_once` ON `alert_deliveries` (`subscriber_id`,`fund_id`,`accession`);--> statement-breakpoint
CREATE TABLE `fund_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fund_id` text NOT NULL,
	`accession` text NOT NULL,
	`period` text NOT NULL,
	`filed_at` text NOT NULL,
	`data_json` text NOT NULL,
	`change_json` text DEFAULT '{}' NOT NULL,
	`checked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_fund_snapshots_accession` ON `fund_snapshots` (`fund_id`,`accession`);--> statement-breakpoint
CREATE INDEX `idx_fund_snapshots_latest` ON `fund_snapshots` (`fund_id`,`id`);--> statement-breakpoint
CREATE TABLE `subscribers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`fund_ids` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`unsubscribe_token` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_subscribers_email` ON `subscribers` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_subscribers_token` ON `subscribers` (`unsubscribe_token`);--> statement-breakpoint
CREATE INDEX `idx_subscribers_status` ON `subscribers` (`status`);--> statement-breakpoint
CREATE TABLE `system_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
