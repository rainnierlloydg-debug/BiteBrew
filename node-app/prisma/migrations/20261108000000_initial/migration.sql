-- Initial Node.js / Prisma MySQL schema. MySQL 8+, UTC server timezone.

CREATE TABLE `users` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `email` VARCHAR(190) NOT NULL,
  `passwordHash` VARCHAR(255) NOT NULL,
  `role` ENUM('OWNER', 'CASHIER', 'KITCHEN') NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT 1,
  `authVersion` INTEGER NOT NULL DEFAULT 1,
  `archivedAt` DATETIME(3) NULL,
  `archivedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `users_email_key` (`email`),
  INDEX `users_role_active_archivedAt_idx` (`role`, `active`, `archivedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `sessions` (
  `id` VARCHAR(128) NOT NULL,
  `data` JSON NOT NULL,
  `userId` CHAR(36) NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `sessions_userId_idx` (`userId`),
  INDEX `sessions_expiresAt_idx` (`expiresAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `categories` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT 1,
  `archivedAt` DATETIME(3) NULL,
  `archivedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `categories_name_key` (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `menu_items` (
  `id` CHAR(36) NOT NULL,
  `code` VARCHAR(40) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `categoryId` CHAR(36) NOT NULL,
  `description` TEXT NULL,
  `image` VARCHAR(255) NULL,
  `imageFrame` JSON NULL,
  `demo` BOOLEAN NOT NULL DEFAULT 0,
  `active` BOOLEAN NOT NULL DEFAULT 1,
  `sortOrder` INTEGER NOT NULL DEFAULT 100,
  `archivedAt` DATETIME(3) NULL,
  `archivedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `menu_items_code_key` (`code`),
  INDEX `menu_items_categoryId_archivedAt_active_idx` (`categoryId`, `archivedAt`, `active`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `variants` (
  `id` CHAR(36) NOT NULL,
  `menuItemId` CHAR(36) NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  `price` DECIMAL(12,2) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `variants_menuItemId_name_key` (`menuItemId`, `name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `addons` (
  `id` CHAR(36) NOT NULL,
  `code` VARCHAR(40) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `price` DECIMAL(12,2) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `addons_code_key` (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `addon_variants` (
  `addonId` CHAR(36) NOT NULL,
  `variantId` CHAR(36) NOT NULL,
  PRIMARY KEY (`addonId`, `variantId`),
  INDEX `addon_variants_variantId_idx` (`variantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `discounts` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `kind` VARCHAR(12) NOT NULL,
  `value` DECIMAL(12,2) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT 1,
  `startsAt` DATETIME(3) NULL,
  `endsAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `customers` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `contact` VARCHAR(40) NULL,
  `active` BOOLEAN NOT NULL DEFAULT 1,
  `archivedAt` DATETIME(3) NULL,
  `archivedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `customers_name_idx` (`name`),
  INDEX `customers_contact_idx` (`contact`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `orders` (
  `id` CHAR(36) NOT NULL,
  `number` VARCHAR(40) NOT NULL,
  `type` ENUM('DINE_IN', 'TAKEAWAY', 'PICKUP') NOT NULL,
  `customerId` CHAR(36) NULL,
  `customerName` VARCHAR(120) NULL,
  `contact` VARCHAR(40) NULL,
  `tableNumber` VARCHAR(20) NULL,
  `pickupAt` DATETIME(3) NULL,
  `instructions` TEXT NULL,
  `status` ENUM('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `version` INTEGER NOT NULL DEFAULT 1,
  `subtotal` DECIMAL(12,2) NOT NULL,
  `discount` DECIMAL(12,2) NOT NULL,
  `charges` DECIMAL(12,2) NOT NULL,
  `total` DECIMAL(12,2) NOT NULL,
  `paid` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `refunded` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `pricingSnapshot` JSON NOT NULL,
  `businessSnapshot` JSON NOT NULL,
  `createdById` CHAR(36) NOT NULL,
  `createdByName` VARCHAR(120) NOT NULL,
  `confirmedAt` DATETIME(3) NULL,
  `preparingAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `cancelledAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `orders_number_key` (`number`),
  INDEX `orders_status_createdAt_idx` (`status`, `createdAt`),
  INDEX `orders_completedAt_createdById_idx` (`completedAt`, `createdById`),
  INDEX `orders_customerId_createdAt_idx` (`customerId`, `createdAt`),
  INDEX `orders_pickupAt_idx` (`pickupAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `order_items` (
  `id` CHAR(36) NOT NULL,
  `orderId` CHAR(36) NOT NULL,
  `variantId` CHAR(36) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `variantName` VARCHAR(80) NOT NULL,
  `quantity` INTEGER NOT NULL,
  `basePrice` DECIMAL(12,2) NOT NULL,
  `unitPrice` DECIMAL(12,2) NOT NULL,
  `subtotal` DECIMAL(12,2) NOT NULL,
  `addons` JSON NOT NULL,
  `instructions` VARCHAR(500) NULL,
  `removedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `order_items_orderId_idx` (`orderId`),
  INDEX `order_items_variantId_idx` (`variantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `order_history` (
  `id` CHAR(36) NOT NULL,
  `orderId` CHAR(36) NOT NULL,
  `actorId` CHAR(36) NOT NULL,
  `from` ENUM('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED') NULL,
  `to` ENUM('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED') NOT NULL,
  `reason` VARCHAR(1000) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `order_history_orderId_createdAt_idx` (`orderId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `payments` (
  `id` CHAR(36) NOT NULL,
  `orderId` CHAR(36) NOT NULL,
  `recordedById` CHAR(36) NOT NULL,
  `verifiedById` CHAR(36) NULL,
  `method` ENUM('CASH', 'GCASH') NOT NULL,
  `status` ENUM('PENDING', 'VERIFIED', 'REJECTED') NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `tendered` DECIMAL(12,2) NULL,
  `change` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `reference` VARCHAR(100) NULL,
  `referenceKey` CHAR(64) NULL,
  `verifiedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `payments_referenceKey_key` (`referenceKey`),
  INDEX `payments_orderId_status_idx` (`orderId`, `status`),
  INDEX `payments_verifiedAt_recordedById_idx` (`verifiedAt`, `recordedById`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `refunds` (
  `id` CHAR(36) NOT NULL,
  `paymentId` CHAR(36) NOT NULL,
  `orderId` CHAR(36) NOT NULL,
  `actorId` CHAR(36) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `method` ENUM('CASH', 'GCASH') NOT NULL,
  `reason` VARCHAR(1000) NOT NULL,
  `recognizedSale` BOOLEAN NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `refunds_orderId_idx` (`orderId`),
  INDEX `refunds_paymentId_idx` (`paymentId`),
  INDEX `refunds_createdAt_recognizedSale_idx` (`createdAt`, `recognizedSale`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `action_requests` (
  `id` CHAR(36) NOT NULL,
  `kind` VARCHAR(12) NOT NULL,
  `orderId` CHAR(36) NOT NULL,
  `paymentId` CHAR(36) NULL,
  `requestedById` CHAR(36) NOT NULL,
  `reviewedById` CHAR(36) NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `amount` DECIMAL(12,2) NULL,
  `reason` VARCHAR(1000) NOT NULL,
  `decisionNote` VARCHAR(1000) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `action_requests_status_kind_idx` (`status`, `kind`),
  INDEX `action_requests_orderId_idx` (`orderId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `idempotency_records` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `operation` VARCHAR(120) NOT NULL,
  `key` CHAR(36) NOT NULL,
  `hash` CHAR(64) NOT NULL,
  `result` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `idempotency_records_userId_operation_key_key` (`userId`, `operation`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `audit_logs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `actorId` CHAR(36) NOT NULL,
  `action` VARCHAR(80) NOT NULL,
  `recordType` VARCHAR(40) NOT NULL,
  `recordId` VARCHAR(64) NULL,
  `before` JSON NULL,
  `after` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `audit_logs_recordType_recordId_idx` (`recordType`, `recordId`),
  INDEX `audit_logs_createdAt_actorId_idx` (`createdAt`, `actorId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `business_settings` (
  `id` INTEGER NOT NULL DEFAULT 1,
  `data` JSON NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `notifications` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `eventKey` VARCHAR(120) NOT NULL,
  `kind` VARCHAR(30) NOT NULL,
  `title` VARCHAR(120) NOT NULL,
  `body` VARCHAR(255) NOT NULL,
  `url` VARCHAR(255) NOT NULL,
  `readAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `notifications_userId_eventKey_key` (`userId`, `eventKey`),
  INDEX `notifications_userId_readAt_createdAt_idx` (`userId`, `readAt`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `push_subscriptions` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `endpointKey` CHAR(64) NOT NULL,
  `subscription` JSON NOT NULL,
  `preferences` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `push_subscriptions_endpointKey_key` (`endpointKey`),
  INDEX `push_subscriptions_userId_idx` (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `push_deliveries` (
  `id` CHAR(36) NOT NULL,
  `notificationId` CHAR(36) NOT NULL,
  `subscriptionId` CHAR(36) NOT NULL,
  `status` VARCHAR(12) NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `sentAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `push_deliveries_notificationId_subscriptionId_key` (`notificationId`, `subscriptionId`),
  INDEX `push_deliveries_status_nextAttemptAt_idx` (`status`, `nextAttemptAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `chat_rooms` (
  `id` CHAR(36) NOT NULL,
  `key` VARCHAR(80) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `orderId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `chat_rooms_key_key` (`key`),
  UNIQUE INDEX `chat_rooms_orderId_key` (`orderId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `chat_participants` (
  `roomId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `lastReadMessageId` INTEGER NOT NULL DEFAULT 0,
  `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`roomId`, `userId`),
  INDEX `chat_participants_userId_idx` (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `chat_messages` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `roomId` CHAR(36) NOT NULL,
  `senderId` CHAR(36) NOT NULL,
  `senderName` VARCHAR(120) NOT NULL,
  `senderRole` ENUM('OWNER', 'CASHIER', 'KITCHEN') NOT NULL,
  `clientId` CHAR(36) NOT NULL,
  `text` VARCHAR(2000) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `chat_messages_senderId_clientId_key` (`senderId`, `clientId`),
  INDEX `chat_messages_roomId_id_idx` (`roomId`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `import_ledger` (
  `key` VARCHAR(120) NOT NULL,
  `targetId` CHAR(36) NOT NULL,
  `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

ALTER TABLE `sessions` ADD CONSTRAINT `sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `menu_items` ADD CONSTRAINT `menu_items_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `variants` ADD CONSTRAINT `variants_menuItemId_fkey` FOREIGN KEY (`menuItemId`) REFERENCES `menu_items` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `addon_variants` ADD CONSTRAINT `addon_variants_addonId_fkey` FOREIGN KEY (`addonId`) REFERENCES `addons` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `addon_variants` ADD CONSTRAINT `addon_variants_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `variants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `orders` ADD CONSTRAINT `orders_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `orders` ADD CONSTRAINT `orders_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `variants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_history` ADD CONSTRAINT `order_history_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_history` ADD CONSTRAINT `order_history_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `payments` ADD CONSTRAINT `payments_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `payments` ADD CONSTRAINT `payments_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `payments` ADD CONSTRAINT `payments_verifiedById_fkey` FOREIGN KEY (`verifiedById`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `payments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `action_requests` ADD CONSTRAINT `action_requests_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `action_requests` ADD CONSTRAINT `action_requests_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `payments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `action_requests` ADD CONSTRAINT `action_requests_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `action_requests` ADD CONSTRAINT `action_requests_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `idempotency_records` ADD CONSTRAINT `idempotency_records_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `push_deliveries` ADD CONSTRAINT `push_deliveries_notificationId_fkey` FOREIGN KEY (`notificationId`) REFERENCES `notifications` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `push_deliveries` ADD CONSTRAINT `push_deliveries_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `push_subscriptions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `chat_rooms` ADD CONSTRAINT `chat_rooms_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `chat_participants` ADD CONSTRAINT `chat_participants_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `chat_rooms` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `chat_participants` ADD CONSTRAINT `chat_participants_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `chat_rooms` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
