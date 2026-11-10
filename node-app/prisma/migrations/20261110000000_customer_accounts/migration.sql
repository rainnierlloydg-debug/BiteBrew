CREATE TABLE `customer_accounts` (
  `id` CHAR(36) NOT NULL,
  `customerId` CHAR(36) NOT NULL,
  `email` VARCHAR(190) NOT NULL,
  `passwordHash` VARCHAR(255) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `customer_accounts_customerId_key` (`customerId`),
  UNIQUE INDEX `customer_accounts_email_key` (`email`),
  PRIMARY KEY (`id`),
  CONSTRAINT `customer_accounts_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
