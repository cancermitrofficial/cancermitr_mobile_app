/*
  Warnings:

  - You are about to alter the column `userId` on the `chatsession` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.

*/
-- DropForeignKey
ALTER TABLE `health_reports` DROP FOREIGN KEY `health_reports_sessionId_fkey`;

-- AlterTable
ALTER TABLE `chatmessage` ADD COLUMN `messageIndex` INTEGER NULL;

-- AlterTable
ALTER TABLE `chatsession` MODIFY `userId` INTEGER NULL;

-- CreateTable
CREATE TABLE `ConversationSummary` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `segmentFrom` INTEGER NOT NULL,
    `segmentTo` INTEGER NOT NULL,
    `summary` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ConversationSummary_sessionId_segmentTo_idx`(`sessionId`, `segmentTo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PersistentMemory` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PersistentMemory_userId_scope_kind_idx`(`userId`, `scope`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ChatMessage_agentType_idx` ON `ChatMessage`(`agentType`);

-- AddForeignKey
ALTER TABLE `ChatSession` ADD CONSTRAINT `ChatSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `health_reports` ADD CONSTRAINT `health_reports_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `ChatSession`(`sessionId`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConversationSummary` ADD CONSTRAINT `ConversationSummary_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `ChatSession`(`sessionId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PersistentMemory` ADD CONSTRAINT `PersistentMemory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
