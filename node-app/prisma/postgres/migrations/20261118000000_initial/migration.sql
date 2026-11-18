-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "bitebrew";

-- CreateEnum
CREATE TYPE "bitebrew"."Role" AS ENUM ('OWNER', 'CASHIER', 'KITCHEN');

-- CreateEnum
CREATE TYPE "bitebrew"."OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "bitebrew"."OrderType" AS ENUM ('DINE_IN', 'TAKEAWAY', 'PICKUP');

-- CreateEnum
CREATE TYPE "bitebrew"."PaymentMethod" AS ENUM ('CASH', 'GCASH');

-- CreateEnum
CREATE TYPE "bitebrew"."PaymentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "bitebrew"."RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "bitebrew"."users" (
    "id" CHAR(36) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(190) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "role" "bitebrew"."Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "registrationPending" BOOLEAN NOT NULL DEFAULT false,
    "authVersion" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "archivedById" CHAR(36),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."customer_verifications" (
    "id" CHAR(36) NOT NULL,
    "email" VARCHAR(190) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "contact" VARCHAR(40) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."sessions" (
    "id" VARCHAR(128) NOT NULL,
    "data" JSONB NOT NULL,
    "userId" CHAR(36),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."categories" (
    "id" CHAR(36) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "archivedById" CHAR(36),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."menu_items" (
    "id" CHAR(36) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "categoryId" CHAR(36) NOT NULL,
    "description" TEXT,
    "image" VARCHAR(255),
    "imageFrame" JSONB,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "archivedAt" TIMESTAMP(3),
    "archivedById" CHAR(36),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."variants" (
    "id" CHAR(36) NOT NULL,
    "menuItemId" CHAR(36) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."addons" (
    "id" CHAR(36) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."addon_variants" (
    "addonId" CHAR(36) NOT NULL,
    "variantId" CHAR(36) NOT NULL,

    CONSTRAINT "addon_variants_pkey" PRIMARY KEY ("addonId","variantId")
);

-- CreateTable
CREATE TABLE "bitebrew"."discounts" (
    "id" CHAR(36) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."customers" (
    "id" CHAR(36) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "contact" VARCHAR(40),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "archivedById" CHAR(36),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."customer_accounts" (
    "id" CHAR(36) NOT NULL,
    "customerId" CHAR(36) NOT NULL,
    "email" VARCHAR(190) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."customer_checkouts" (
    "id" CHAR(36) NOT NULL,
    "accountId" CHAR(36) NOT NULL,
    "key" CHAR(36) NOT NULL,
    "hash" CHAR(64) NOT NULL,
    "orderId" CHAR(36) NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."orders" (
    "id" CHAR(36) NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "type" "bitebrew"."OrderType" NOT NULL,
    "customerId" CHAR(36),
    "customerName" VARCHAR(120),
    "contact" VARCHAR(40),
    "tableNumber" VARCHAR(20),
    "pickupAt" TIMESTAMP(3),
    "instructions" TEXT,
    "status" "bitebrew"."OrderStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL,
    "charges" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refunded" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pricingSnapshot" JSONB NOT NULL,
    "businessSnapshot" JSONB NOT NULL,
    "createdById" CHAR(36),
    "createdByName" VARCHAR(120) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "preparingAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."order_items" (
    "id" CHAR(36) NOT NULL,
    "orderId" CHAR(36) NOT NULL,
    "variantId" CHAR(36) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "variantName" VARCHAR(80) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "basePrice" DECIMAL(12,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "addons" JSONB NOT NULL,
    "instructions" VARCHAR(500),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."order_history" (
    "id" CHAR(36) NOT NULL,
    "orderId" CHAR(36) NOT NULL,
    "actorId" CHAR(36) NOT NULL,
    "from" "bitebrew"."OrderStatus",
    "to" "bitebrew"."OrderStatus" NOT NULL,
    "reason" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."payments" (
    "id" CHAR(36) NOT NULL,
    "orderId" CHAR(36) NOT NULL,
    "recordedById" CHAR(36) NOT NULL,
    "verifiedById" CHAR(36),
    "method" "bitebrew"."PaymentMethod" NOT NULL,
    "status" "bitebrew"."PaymentStatus" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "tendered" DECIMAL(12,2),
    "change" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reference" VARCHAR(100),
    "referenceKey" CHAR(64),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."refunds" (
    "id" CHAR(36) NOT NULL,
    "paymentId" CHAR(36) NOT NULL,
    "orderId" CHAR(36) NOT NULL,
    "actorId" CHAR(36) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "bitebrew"."PaymentMethod" NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "recognizedSale" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."action_requests" (
    "id" CHAR(36) NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "orderId" CHAR(36) NOT NULL,
    "paymentId" CHAR(36),
    "requestedById" CHAR(36) NOT NULL,
    "reviewedById" CHAR(36),
    "status" "bitebrew"."RequestStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2),
    "reason" VARCHAR(1000) NOT NULL,
    "decisionNote" VARCHAR(1000),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."idempotency_records" (
    "id" CHAR(36) NOT NULL,
    "userId" CHAR(36) NOT NULL,
    "operation" VARCHAR(120) NOT NULL,
    "key" CHAR(36) NOT NULL,
    "hash" CHAR(64) NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."audit_logs" (
    "id" SERIAL NOT NULL,
    "actorId" CHAR(36) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "recordType" VARCHAR(40) NOT NULL,
    "recordId" VARCHAR(64),
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."business_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."notifications" (
    "id" CHAR(36) NOT NULL,
    "userId" CHAR(36) NOT NULL,
    "eventKey" VARCHAR(120) NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(255) NOT NULL,
    "url" VARCHAR(255) NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."push_subscriptions" (
    "id" CHAR(36) NOT NULL,
    "userId" CHAR(36) NOT NULL,
    "endpointKey" CHAR(64) NOT NULL,
    "subscription" JSONB NOT NULL,
    "preferences" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."push_deliveries" (
    "id" CHAR(36) NOT NULL,
    "notificationId" CHAR(36) NOT NULL,
    "subscriptionId" CHAR(36) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "push_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."support_conversations" (
    "id" CHAR(36) NOT NULL,
    "accountId" CHAR(36) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."support_messages" (
    "id" SERIAL NOT NULL,
    "conversationId" CHAR(36) NOT NULL,
    "staffId" CHAR(36),
    "senderKey" VARCHAR(45) NOT NULL,
    "senderName" VARCHAR(120) NOT NULL,
    "senderRole" VARCHAR(20) NOT NULL,
    "clientId" CHAR(36) NOT NULL,
    "text" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."chat_rooms" (
    "id" CHAR(36) NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "orderId" CHAR(36),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."chat_participants" (
    "roomId" CHAR(36) NOT NULL,
    "userId" CHAR(36) NOT NULL,
    "lastReadMessageId" INTEGER NOT NULL DEFAULT 0,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "clearedThroughMessageId" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_participants_pkey" PRIMARY KEY ("roomId","userId")
);

-- CreateTable
CREATE TABLE "bitebrew"."chat_messages" (
    "id" SERIAL NOT NULL,
    "roomId" CHAR(36) NOT NULL,
    "senderId" CHAR(36) NOT NULL,
    "senderName" VARCHAR(120) NOT NULL,
    "senderRole" "bitebrew"."Role" NOT NULL,
    "clientId" CHAR(36) NOT NULL,
    "text" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitebrew"."import_ledger" (
    "key" VARCHAR(120) NOT NULL,
    "targetId" CHAR(36) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_ledger_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "bitebrew"."socket_io_attachments" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" BYTEA NOT NULL,

    CONSTRAINT "socket_io_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "bitebrew"."users"("email");

-- CreateIndex
CREATE INDEX "users_role_active_archivedAt_idx" ON "bitebrew"."users"("role", "active", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_verifications_email_key" ON "bitebrew"."customer_verifications"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customer_verifications_tokenHash_key" ON "bitebrew"."customer_verifications"("tokenHash");

-- CreateIndex
CREATE INDEX "customer_verifications_expiresAt_idx" ON "bitebrew"."customer_verifications"("expiresAt");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "bitebrew"."sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "bitebrew"."sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "bitebrew"."categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_code_key" ON "bitebrew"."menu_items"("code");

-- CreateIndex
CREATE INDEX "menu_items_categoryId_archivedAt_active_idx" ON "bitebrew"."menu_items"("categoryId", "archivedAt", "active");

-- CreateIndex
CREATE UNIQUE INDEX "variants_menuItemId_name_key" ON "bitebrew"."variants"("menuItemId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "addons_code_key" ON "bitebrew"."addons"("code");

-- CreateIndex
CREATE INDEX "addon_variants_variantId_idx" ON "bitebrew"."addon_variants"("variantId");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "bitebrew"."customers"("name");

-- CreateIndex
CREATE INDEX "customers_contact_idx" ON "bitebrew"."customers"("contact");

-- CreateIndex
CREATE UNIQUE INDEX "customer_accounts_customerId_key" ON "bitebrew"."customer_accounts"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_accounts_email_key" ON "bitebrew"."customer_accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customer_checkouts_orderId_key" ON "bitebrew"."customer_checkouts"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_checkouts_accountId_key_key" ON "bitebrew"."customer_checkouts"("accountId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "bitebrew"."orders"("number");

-- CreateIndex
CREATE INDEX "orders_status_createdAt_idx" ON "bitebrew"."orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_completedAt_createdById_idx" ON "bitebrew"."orders"("completedAt", "createdById");

-- CreateIndex
CREATE INDEX "orders_customerId_createdAt_idx" ON "bitebrew"."orders"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_pickupAt_idx" ON "bitebrew"."orders"("pickupAt");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "bitebrew"."order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_variantId_idx" ON "bitebrew"."order_items"("variantId");

-- CreateIndex
CREATE INDEX "order_history_orderId_createdAt_idx" ON "bitebrew"."order_history"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_referenceKey_key" ON "bitebrew"."payments"("referenceKey");

-- CreateIndex
CREATE INDEX "payments_orderId_status_idx" ON "bitebrew"."payments"("orderId", "status");

-- CreateIndex
CREATE INDEX "payments_verifiedAt_recordedById_idx" ON "bitebrew"."payments"("verifiedAt", "recordedById");

-- CreateIndex
CREATE INDEX "refunds_orderId_idx" ON "bitebrew"."refunds"("orderId");

-- CreateIndex
CREATE INDEX "refunds_paymentId_idx" ON "bitebrew"."refunds"("paymentId");

-- CreateIndex
CREATE INDEX "refunds_createdAt_recognizedSale_idx" ON "bitebrew"."refunds"("createdAt", "recognizedSale");

-- CreateIndex
CREATE INDEX "action_requests_status_kind_idx" ON "bitebrew"."action_requests"("status", "kind");

-- CreateIndex
CREATE INDEX "action_requests_orderId_idx" ON "bitebrew"."action_requests"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_userId_operation_key_key" ON "bitebrew"."idempotency_records"("userId", "operation", "key");

-- CreateIndex
CREATE INDEX "audit_logs_recordType_recordId_idx" ON "bitebrew"."audit_logs"("recordType", "recordId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_actorId_idx" ON "bitebrew"."audit_logs"("createdAt", "actorId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "bitebrew"."notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_eventKey_key" ON "bitebrew"."notifications"("userId", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpointKey_key" ON "bitebrew"."push_subscriptions"("endpointKey");

-- CreateIndex
CREATE INDEX "push_subscriptions_userId_idx" ON "bitebrew"."push_subscriptions"("userId");

-- CreateIndex
CREATE INDEX "push_deliveries_status_nextAttemptAt_idx" ON "bitebrew"."push_deliveries"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "push_deliveries_notificationId_subscriptionId_key" ON "bitebrew"."push_deliveries"("notificationId", "subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "support_conversations_accountId_key" ON "bitebrew"."support_conversations"("accountId");

-- CreateIndex
CREATE INDEX "support_messages_conversationId_id_idx" ON "bitebrew"."support_messages"("conversationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "support_messages_conversationId_senderKey_clientId_key" ON "bitebrew"."support_messages"("conversationId", "senderKey", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_rooms_key_key" ON "bitebrew"."chat_rooms"("key");

-- CreateIndex
CREATE UNIQUE INDEX "chat_rooms_orderId_key" ON "bitebrew"."chat_rooms"("orderId");

-- CreateIndex
CREATE INDEX "chat_participants_userId_idx" ON "bitebrew"."chat_participants"("userId");

-- CreateIndex
CREATE INDEX "chat_messages_roomId_id_idx" ON "bitebrew"."chat_messages"("roomId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_senderId_clientId_key" ON "bitebrew"."chat_messages"("senderId", "clientId");

-- AddForeignKey
ALTER TABLE "bitebrew"."sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "bitebrew"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."menu_items" ADD CONSTRAINT "menu_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "bitebrew"."categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."variants" ADD CONSTRAINT "variants_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "bitebrew"."menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."addon_variants" ADD CONSTRAINT "addon_variants_addonId_fkey" FOREIGN KEY ("addonId") REFERENCES "bitebrew"."addons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."addon_variants" ADD CONSTRAINT "addon_variants_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "bitebrew"."variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."customer_accounts" ADD CONSTRAINT "customer_accounts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "bitebrew"."customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."customer_checkouts" ADD CONSTRAINT "customer_checkouts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "bitebrew"."customer_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."customer_checkouts" ADD CONSTRAINT "customer_checkouts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "bitebrew"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "bitebrew"."customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."orders" ADD CONSTRAINT "orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "bitebrew"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "bitebrew"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."order_items" ADD CONSTRAINT "order_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "bitebrew"."variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."order_history" ADD CONSTRAINT "order_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "bitebrew"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."order_history" ADD CONSTRAINT "order_history_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "bitebrew"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "bitebrew"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."payments" ADD CONSTRAINT "payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "bitebrew"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."payments" ADD CONSTRAINT "payments_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "bitebrew"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "bitebrew"."payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."refunds" ADD CONSTRAINT "refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "bitebrew"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."refunds" ADD CONSTRAINT "refunds_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "bitebrew"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."action_requests" ADD CONSTRAINT "action_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "bitebrew"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."action_requests" ADD CONSTRAINT "action_requests_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "bitebrew"."payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."action_requests" ADD CONSTRAINT "action_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "bitebrew"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."action_requests" ADD CONSTRAINT "action_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "bitebrew"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."idempotency_records" ADD CONSTRAINT "idempotency_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "bitebrew"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "bitebrew"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "bitebrew"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "bitebrew"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."push_deliveries" ADD CONSTRAINT "push_deliveries_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "bitebrew"."notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."push_deliveries" ADD CONSTRAINT "push_deliveries_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "bitebrew"."push_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."support_conversations" ADD CONSTRAINT "support_conversations_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "bitebrew"."customer_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."support_messages" ADD CONSTRAINT "support_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "bitebrew"."support_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."support_messages" ADD CONSTRAINT "support_messages_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "bitebrew"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."chat_rooms" ADD CONSTRAINT "chat_rooms_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "bitebrew"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."chat_participants" ADD CONSTRAINT "chat_participants_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "bitebrew"."chat_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."chat_participants" ADD CONSTRAINT "chat_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "bitebrew"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."chat_messages" ADD CONSTRAINT "chat_messages_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "bitebrew"."chat_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitebrew"."chat_messages" ADD CONSTRAINT "chat_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "bitebrew"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


REVOKE ALL ON SCHEMA "bitebrew" FROM PUBLIC;
