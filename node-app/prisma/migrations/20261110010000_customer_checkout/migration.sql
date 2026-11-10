ALTER TABLE `orders` MODIFY `createdById` CHAR(36) NULL;
CREATE TABLE `customer_checkouts` (
  `id` CHAR(36) NOT NULL,
  `accountId` CHAR(36) NOT NULL,
  `key` CHAR(36) NOT NULL,
  `hash` CHAR(64) NOT NULL,
  `orderId` CHAR(36) NOT NULL,
  `result` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `customer_checkouts_accountId_key_key` (`accountId`, `key`),
  UNIQUE INDEX `customer_checkouts_orderId_key` (`orderId`),
  CONSTRAINT `customer_checkouts_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `customer_accounts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_checkouts_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
