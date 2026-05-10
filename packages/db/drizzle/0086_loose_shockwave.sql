CREATE TABLE `asyncMediaDownloads` (
	`id` text PRIMARY KEY NOT NULL,
	`bookmarkId` text NOT NULL,
	`userId` text NOT NULL,
	`sourceUrl` text NOT NULL,
	`referer` text,
	`target` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`assetId` text,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`modifiedAt` integer,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `asyncMediaDownloads_bookmarkId_idx` ON `asyncMediaDownloads` (`bookmarkId`);--> statement-breakpoint
CREATE INDEX `asyncMediaDownloads_user_status_idx` ON `asyncMediaDownloads` (`userId`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `asyncMediaDownloads_bookmarkId_sourceUrl_target_unique` ON `asyncMediaDownloads` (`bookmarkId`,`sourceUrl`,`target`);--> statement-breakpoint
CREATE TABLE `bookmarkChunks` (
	`id` text PRIMARY KEY NOT NULL,
	`bookmarkId` text NOT NULL,
	`userId` text NOT NULL,
	`idx` integer NOT NULL,
	`content` text NOT NULL,
	`tokenCount` integer NOT NULL,
	`contentHash` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmarkChunks_bookmarkId_idx` ON `bookmarkChunks` (`bookmarkId`);--> statement-breakpoint
CREATE INDEX `bookmarkChunks_userId_idx` ON `bookmarkChunks` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarkChunks_bookmarkId_idx_unique` ON `bookmarkChunks` (`bookmarkId`,`idx`);--> statement-breakpoint
CREATE TABLE `bookmarkEmbeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`chunkId` text NOT NULL,
	`bookmarkId` text NOT NULL,
	`userId` text NOT NULL,
	`model` text NOT NULL,
	`dim` integer NOT NULL,
	`embedding` blob NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`chunkId`) REFERENCES `bookmarkChunks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmarkEmbeddings_bookmarkId_idx` ON `bookmarkEmbeddings` (`bookmarkId`);--> statement-breakpoint
CREATE INDEX `bookmarkEmbeddings_user_model_idx` ON `bookmarkEmbeddings` (`userId`,`model`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarkEmbeddings_chunkId_model_unique` ON `bookmarkEmbeddings` (`chunkId`,`model`);--> statement-breakpoint
CREATE TABLE `platformCredentials` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`platform` text NOT NULL,
	`credentialType` text NOT NULL,
	`encryptedValue` text NOT NULL,
	`createdAt` integer NOT NULL,
	`modifiedAt` integer,
	`lastUsedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `platformCredentials_userId_idx` ON `platformCredentials` (`userId`);--> statement-breakpoint
CREATE INDEX `platformCredentials_platform_idx` ON `platformCredentials` (`platform`);--> statement-breakpoint
CREATE UNIQUE INDEX `platformCredentials_userId_platform_credentialType_unique` ON `platformCredentials` (`userId`,`platform`,`credentialType`);