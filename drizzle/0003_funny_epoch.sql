CREATE TABLE `covers` (
	`owner` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`id` text NOT NULL,
	`request_key` text NOT NULL,
	`provider` text NOT NULL,
	`task_id` text,
	`status` text NOT NULL,
	`art` text NOT NULL,
	`asset_id` text,
	`prompt` text NOT NULL,
	`error` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`checked_at` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner`, `target_type`, `target_id`),
	FOREIGN KEY (`owner`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `covers_id` ON `covers` (`id`);