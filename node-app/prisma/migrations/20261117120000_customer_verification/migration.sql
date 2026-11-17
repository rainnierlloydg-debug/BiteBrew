CREATE TABLE `customer_verifications` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(190) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `contact` VARCHAR(40) NOT NULL,
  `passwordHash` VARCHAR(255) NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `codeHash` CHAR(64) NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `sentAt` DATETIME(3) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `customer_verifications_email_key` (`email`),
  UNIQUE INDEX `customer_verifications_tokenHash_key` (`tokenHash`),
  INDEX `customer_verifications_expiresAt_idx` (`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
