ALTER TABLE `chat_participants`
  ADD COLUMN `hidden` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `clearedThroughMessageId` INTEGER NOT NULL DEFAULT 0;
