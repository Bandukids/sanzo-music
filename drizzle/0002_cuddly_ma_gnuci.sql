CREATE TABLE `releases` (
	`generation_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`metadata` text NOT NULL,
	`published_at` text NOT NULL,
	FOREIGN KEY (`generation_id`) REFERENCES `generations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `releases_published` ON `releases` (`published_at`);