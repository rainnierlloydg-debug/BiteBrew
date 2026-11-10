-- CreateTable
CREATE TABLE `support_conversations` (
    `id` CHAR(36) NOT NULL,
    `accountId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `support_conversations_accountId_key`(`accountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `support_messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversationId` CHAR(36) NOT NULL,
    `staffId` CHAR(36) NULL,
    `senderKey` VARCHAR(45) NOT NULL,
    `senderName` VARCHAR(120) NOT NULL,
    `senderRole` VARCHAR(20) NOT NULL,
    `clientId` CHAR(36) NOT NULL,
    `text` VARCHAR(2000) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `support_messages_conversationId_id_idx`(`conversationId`, `id`),
    UNIQUE INDEX `support_messages_conversationId_senderKey_clientId_key`(`conversationId`, `senderKey`, `clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `support_conversations` ADD CONSTRAINT `support_conversations_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `customer_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_messages` ADD CONSTRAINT `support_messages_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `support_conversations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_messages` ADD CONSTRAINT `support_messages_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

