CREATE TABLE `catalogue_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`venue_id` text NOT NULL,
	`changed_at` text NOT NULL,
	`kind` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`review_required` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `preferences` (
	`venue_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `research_outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`target` text NOT NULL,
	`status` text NOT NULL,
	`message` text,
	`source_url` text,
	`logged_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `research_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`status` text NOT NULL,
	`summary` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `venues` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_key` text NOT NULL,
	`suburb` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `venues_branch_key_unique` ON `venues` (`branch_key`);--> statement-breakpoint
CREATE TABLE `visits` (
	`id` text PRIMARY KEY NOT NULL,
	`visited_at` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
