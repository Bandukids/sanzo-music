CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`request_key` text NOT NULL,
	`provider` text NOT NULL,
	`input` text NOT NULL,
	`task_id` text,
	`status` text NOT NULL,
	`asset_id` text,
	`error` text,
	`usage` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`checked_at` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generations_owner_request` ON `generations` (`owner`,`request_key`);--> statement-breakpoint
CREATE INDEX `generations_owner_created` ON `generations` (`owner`,`created_at`);