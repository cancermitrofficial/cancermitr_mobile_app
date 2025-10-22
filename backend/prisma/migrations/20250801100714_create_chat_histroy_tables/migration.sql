-- CreateTable
CREATE TABLE `ChatSession` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL DEFAULT 'New Chat',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `ChatSession_sessionId_key`(`sessionId`),
    INDEX `ChatSession_userId_idx`(`userId`),
    INDEX `ChatSession_sessionId_idx`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatMessage` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `messageType` ENUM('USER', 'ORCHESTRATOR', 'AGENT', 'SYSTEM', 'ERROR') NOT NULL,
    `agentType` ENUM('RAG_AGENT', 'SEARCH_AGENT', 'SUMMARY_AGENT', 'PRODUCT_AGENT', 'DOCUMENT_AGENT') NULL,
    `content` TEXT NOT NULL,
    `metadata` JSON NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `parentId` VARCHAR(191) NULL,

    INDEX `ChatMessage_sessionId_timestamp_idx`(`sessionId`, `timestamp`),
    INDEX `ChatMessage_messageType_idx`(`messageType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `ChatSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `ChatMessage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
