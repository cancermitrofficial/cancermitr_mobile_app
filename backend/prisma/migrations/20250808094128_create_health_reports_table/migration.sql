-- AlterTable
ALTER TABLE `chatmessage` ADD COLUMN `reportId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `health_reports` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `sessionId` VARCHAR(191) NULL,
    `category` ENUM('INSURANCE_DOCUMENT', 'INVESTIGATIONS_REPORTS', 'PRESCRIPTIONS_PROTOCOLS', 'COST_ESTIMATE', 'DISCHARGE_SUMMARY', 'OTHERS') NOT NULL,
    `originalName` VARCHAR(191) NOT NULL,
    `storedName` VARCHAR(191) NOT NULL,
    `filePath` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `checksum` VARCHAR(191) NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `analysisStatus` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `summary` VARCHAR(191) NULL,
    `keyFindings` JSON NULL,
    `recommendations` JSON NULL,
    `labValues` JSON NULL,
    `abnormalFindings` JSON NULL,
    `tempUrlExpiry` DATETIME(3) NULL,

    INDEX `health_reports_userId_category_uploadedAt_idx`(`userId`, `category`, `uploadedAt`),
    INDEX `health_reports_sessionId_idx`(`sessionId`),
    UNIQUE INDEX `health_reports_userId_filePath_key`(`userId`, `filePath`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `health_reports`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `health_reports` ADD CONSTRAINT `health_reports_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `health_reports` ADD CONSTRAINT `health_reports_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `ChatSession`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
