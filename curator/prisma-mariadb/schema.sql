-- Generated from schema.prisma by `npm run prisma:sql` (scripts/generate-schema-sql.mjs). Do not edit.
-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `googleId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_googleId_key`(`googleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Project` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `existent` BOOLEAN NULL DEFAULT true,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Project_userId_existent_idx`(`userId`, `existent`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tool` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `version` VARCHAR(191) NULL,
    `accessLevel` VARCHAR(191) NOT NULL DEFAULT 'safe_write',
    `requiredRole` VARCHAR(191) NULL,
    `requiresConfirmation` BOOLEAN NOT NULL DEFAULT false,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `existent` BOOLEAN NULL DEFAULT true,
    `origin` VARCHAR(191) NOT NULL DEFAULT 'local',
    `mcpServerId` INTEGER NULL,
    `remoteName` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `inputSchema` JSON NULL,
    `annotations` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Tool_name_key`(`name`),
    INDEX `Tool_existent_idx`(`existent`),
    INDEX `Tool_origin_idx`(`origin`),
    INDEX `Tool_projectId_idx`(`projectId`),
    UNIQUE INDEX `Tool_mcpServerId_remoteName_key`(`mcpServerId`, `remoteName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `McpServer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `url` TEXT NOT NULL,
    `transport` VARCHAR(191) NOT NULL DEFAULT 'streamable-http',
    `authService` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'registered',
    `lastError` TEXT NULL,
    `serverInfo` JSON NULL,
    `instructions` TEXT NULL,
    `expectations` JSON NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `lastSyncedAt` DATETIME(3) NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `createdBy` VARCHAR(191) NULL,
    `existent` BOOLEAN NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `McpServer_projectId_existent_idx`(`projectId`, `existent`),
    UNIQUE INDEX `McpServer_projectId_name_key`(`projectId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `McpResource` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mcpServerId` INTEGER NOT NULL,
    `uri` VARCHAR(512) NOT NULL,
    `isTemplate` BOOLEAN NOT NULL DEFAULT false,
    `name` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `mimeType` VARCHAR(191) NULL,
    `size` INTEGER NULL,
    `annotations` JSON NULL,
    `existent` BOOLEAN NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `McpResource_mcpServerId_existent_idx`(`mcpServerId`, `existent`),
    UNIQUE INDEX `McpResource_mcpServerId_uri_key`(`mcpServerId`, `uri`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `McpPrompt` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mcpServerId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `arguments` JSON NULL,
    `existent` BOOLEAN NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `McpPrompt_mcpServerId_existent_idx`(`mcpServerId`, `existent`),
    UNIQUE INDEX `McpPrompt_mcpServerId_name_key`(`mcpServerId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Resource` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `uri` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `existent` BOOLEAN NULL DEFAULT true,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Resource_uri_existent_idx`(`uri`, `existent`),
    INDEX `Resource_existent_idx`(`existent`),
    INDEX `Resource_deletedAt_idx`(`deletedAt`),
    INDEX `Resource_projectId_idx`(`projectId`),
    UNIQUE INDEX `Resource_uri_key`(`uri`),
    UNIQUE INDEX `Resource_id_existent_key`(`id`, `existent`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Text` (
    `resourceId` INTEGER NULL,
    `id` VARCHAR(191) NOT NULL,
    `content` LONGTEXT NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'MAIN',
    `mimeType` VARCHAR(191) NULL DEFAULT 'text/plain',
    `extension` VARCHAR(191) NULL DEFAULT 'txt',
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `existent` BOOLEAN NULL DEFAULT true,
    `deletedAt` DATETIME(3) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Text_resourceId_existent_idx`(`resourceId`, `existent`),
    INDEX `Text_existent_idx`(`existent`),
    UNIQUE INDEX `Text_resourceId_role_key`(`resourceId`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Relation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subjectId` INTEGER NOT NULL,
    `predicateId` INTEGER NOT NULL,
    `objectId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `aiModelId` INTEGER NULL,
    `literalValue` DOUBLE NULL,
    `literalString` TEXT NULL,
    `literalDate` DATETIME(3) NULL,
    `literalBoolean` BOOLEAN NULL,
    `literalDatatype` VARCHAR(191) NULL,
    `selectionStart` INTEGER NULL,
    `selectionEnd` INTEGER NULL,
    `justification` TEXT NULL,
    `projectId` VARCHAR(191) NULL,
    `existent` BOOLEAN NULL DEFAULT true,

    INDEX `Relation_subjectId_existent_idx`(`subjectId`, `existent`),
    INDEX `Relation_predicateId_existent_idx`(`predicateId`, `existent`),
    INDEX `Relation_objectId_existent_idx`(`objectId`, `existent`),
    INDEX `Relation_existent_idx`(`existent`),
    INDEX `Relation_projectId_idx`(`projectId`),
    UNIQUE INDEX `Relation_subjectId_predicateId_objectId_key`(`subjectId`, `predicateId`, `objectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attachment` (
    `resourceId` INTEGER NULL,
    `id` VARCHAR(191) NOT NULL,
    `uri` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `mimetype` VARCHAR(191) NOT NULL,
    `url` TEXT NOT NULL,
    `size` INTEGER NOT NULL,
    `existent` BOOLEAN NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Attachment_uri_key`(`uri`),
    INDEX `Attachment_existent_idx`(`existent`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIModel` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shortName` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `version` VARCHAR(191) NULL,
    `url` TEXT NULL,
    `deletedAt` DATETIME(3) NULL,
    `existent` BOOLEAN NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AIModel_shortName_key`(`shortName`),
    UNIQUE INDEX `AIModel_name_key`(`name`),
    INDEX `AIModel_existent_idx`(`existent`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Script` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `body` LONGTEXT NULL,
    `toolCalls` JSON NULL,
    `ast` JSON NULL,
    `userId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `currentVersion` INTEGER NOT NULL DEFAULT 0,
    `existent` BOOLEAN NULL DEFAULT true,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Script_existent_idx`(`existent`),
    UNIQUE INDEX `Script_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScriptVersion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `scriptId` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `hash` VARCHAR(191) NOT NULL,
    `ast` JSON NULL,
    `body` LONGTEXT NULL,
    `createdBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ScriptVersion_scriptId_version_key`(`scriptId`, `version`),
    UNIQUE INDEX `ScriptVersion_scriptId_hash_key`(`scriptId`, `hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Request` (
    `scriptVersion` INTEGER NULL,
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `status` ENUM('NEW', 'WAITING', 'WAITING_FOR_USER', 'WAITING_FOR_EVENT', 'COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED', 'SKIPPED') NOT NULL DEFAULT 'NEW',
    `toolName` VARCHAR(191) NULL,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `scriptId` INTEGER NULL,
    `aiModelId` INTEGER NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `ast` JSON NULL,
    `context` JSON NULL,
    `output` LONGTEXT NULL,
    `conversationId` INTEGER NOT NULL,
    `agentId` VARCHAR(191) NULL,
    `scheduledAt` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `executionScheduled` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `priority` INTEGER NOT NULL DEFAULT 0,
    `notifyId` INTEGER NULL,
    `pendingDependencies` INTEGER NOT NULL DEFAULT 0,
    `eventCursor` INTEGER NULL,
    `lockedBy` VARCHAR(191) NULL,
    `lockedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `parentId` INTEGER NULL,
    `existent` BOOLEAN NULL DEFAULT true,

    INDEX `Request_status_existent_idx`(`status`, `existent`),
    INDEX `Request_existent_idx`(`existent`),
    INDEX `Request_conversationId_status_idx`(`conversationId`, `status`),
    INDEX `Request_conversationId_updatedAt_idx`(`conversationId`, `updatedAt`),
    INDEX `Request_parentId_idx`(`parentId`),
    INDEX `Request_notifyId_idx`(`notifyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Response` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `requestId` INTEGER NOT NULL,
    `conversationId` INTEGER NOT NULL,
    `content` LONGTEXT NOT NULL,
    `aiModelId` INTEGER NULL,
    `projectId` VARCHAR(191) NULL,
    `existent` BOOLEAN NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Response_existent_idx`(`existent`),
    INDEX `Response_requestId_idx`(`requestId`),
    INDEX `Response_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Conversation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `externalId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `existent` BOOLEAN NULL DEFAULT true,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Conversation_externalId_key`(`externalId`),
    INDEX `Conversation_existent_idx`(`existent`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ResourceTree` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `treeName` VARCHAR(191) NOT NULL,
    `resourceId` INTEGER NOT NULL,
    `parentId` INTEGER NULL,
    `treeStart` DOUBLE NOT NULL,
    `treeEnd` DOUBLE NOT NULL,
    `depth` INTEGER NOT NULL DEFAULT 0,
    `projectId` VARCHAR(191) NULL,
    `deletedAt` DATETIME(3) NULL,
    `existent` BOOLEAN NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ResourceTree_treeName_treeStart_treeEnd_existent_idx`(`treeName`, `treeStart`, `treeEnd`, `existent`),
    INDEX `ResourceTree_existent_idx`(`existent`),
    INDEX `ResourceTree_deletedAt_idx`(`deletedAt`),
    UNIQUE INDEX `ResourceTree_treeName_resourceId_key`(`treeName`, `resourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventSubscription` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `eventName` VARCHAR(191) NOT NULL,
    `scriptId` INTEGER NOT NULL,
    `agentId` VARCHAR(191) NULL,
    `conversationId` INTEGER NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `entry` VARCHAR(191) NULL,
    `when` TEXT NULL,
    `payloadAs` VARCHAR(191) NULL,

    INDEX `EventSubscription_eventName_isActive_idx`(`eventName`, `isActive`),
    UNIQUE INDEX `EventSubscription_scriptId_entry_eventName_conversationId_key`(`scriptId`, `entry`, `eventName`, `conversationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversationId` INTEGER NOT NULL,
    `eventName` VARCHAR(191) NOT NULL,
    `payload` JSON NULL,
    `target` VARCHAR(191) NULL,
    `source` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EventLog_conversationId_eventName_id_idx`(`conversationId`, `eventName`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConversationLease` (
    `conversationId` INTEGER NOT NULL,
    `owner` VARCHAR(191) NOT NULL,
    `leaseUntil` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ConversationLease_owner_idx`(`owner`),
    PRIMARY KEY (`conversationId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Agent` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `scriptId` INTEGER NULL,
    `schedule` VARCHAR(191) NOT NULL DEFAULT 'every 10 minutes',
    `lastPolledAt` DATETIME(3) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `existent` BOOLEAN NULL DEFAULT true,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Agent_existent_idx`(`existent`),
    UNIQUE INDEX `Agent_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Permission` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `toolName` VARCHAR(191) NULL,
    `accessLevel` VARCHAR(191) NULL,
    `requiresConfirmation` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Permission_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `projectId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Role_projectId_idx`(`projectId`),
    UNIQUE INDEX `Role_projectId_name_key`(`projectId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ToolRole` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `toolId` INTEGER NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ToolRole_toolId_idx`(`toolId`),
    INDEX `ToolRole_roleId_idx`(`roleId`),
    UNIQUE INDEX `ToolRole_toolId_roleId_key`(`toolId`, `roleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RoleInheritance` (
    `parentId` VARCHAR(191) NOT NULL,
    `subRoleId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`parentId`, `subRoleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermission` (
    `roleId` VARCHAR(191) NOT NULL,
    `permissionId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`roleId`, `permissionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectRole` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProjectRole_projectId_idx`(`projectId`),
    INDEX `ProjectRole_roleId_idx`(`roleId`),
    UNIQUE INDEX `ProjectRole_projectId_roleId_key`(`projectId`, `roleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserRole` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserRole_userId_idx`(`userId`),
    INDEX `UserRole_roleId_idx`(`roleId`),
    INDEX `UserRole_projectId_idx`(`projectId`),
    UNIQUE INDEX `UserRole_userId_roleId_projectId_key`(`userId`, `roleId`, `projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentRole` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `agentId` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,

    INDEX `AgentRole_agentId_idx`(`agentId`),
    INDEX `AgentRole_roleId_idx`(`roleId`),
    UNIQUE INDEX `AgentRole_agentId_roleId_key`(`agentId`, `roleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StepTrace` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `conversationId` INTEGER NOT NULL,
    `requestId` INTEGER NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `nodeType` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL,
    `output` LONGTEXT NULL,
    `startedAt` DATETIME(3) NULL,
    `worker` VARCHAR(191) NULL,

    INDEX `StepTrace_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    INDEX `StepTrace_requestId_idx`(`requestId`),
    PRIMARY KEY (`id`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_RequestResources` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_RequestResources_AB_unique`(`A`, `B`),
    INDEX `_RequestResources_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_ConversationResources` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_ConversationResources_AB_unique`(`A`, `B`),
    INDEX `_ConversationResources_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Tool` ADD CONSTRAINT `Tool_mcpServerId_fkey` FOREIGN KEY (`mcpServerId`) REFERENCES `McpServer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Tool` ADD CONSTRAINT `Tool_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `McpServer` ADD CONSTRAINT `McpServer_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `McpResource` ADD CONSTRAINT `McpResource_mcpServerId_fkey` FOREIGN KEY (`mcpServerId`) REFERENCES `McpServer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `McpPrompt` ADD CONSTRAINT `McpPrompt_mcpServerId_fkey` FOREIGN KEY (`mcpServerId`) REFERENCES `McpServer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Resource` ADD CONSTRAINT `Resource_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Text` ADD CONSTRAINT `Text_resourceId_fkey` FOREIGN KEY (`resourceId`) REFERENCES `Resource`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Relation` ADD CONSTRAINT `Relation_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `Resource`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Relation` ADD CONSTRAINT `Relation_predicateId_fkey` FOREIGN KEY (`predicateId`) REFERENCES `Resource`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Relation` ADD CONSTRAINT `Relation_objectId_fkey` FOREIGN KEY (`objectId`) REFERENCES `Resource`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Relation` ADD CONSTRAINT `Relation_aiModelId_fkey` FOREIGN KEY (`aiModelId`) REFERENCES `AIModel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Relation` ADD CONSTRAINT `Relation_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_resourceId_fkey` FOREIGN KEY (`resourceId`) REFERENCES `Resource`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Script` ADD CONSTRAINT `Script_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScriptVersion` ADD CONSTRAINT `ScriptVersion_scriptId_fkey` FOREIGN KEY (`scriptId`) REFERENCES `Script`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Request` ADD CONSTRAINT `Request_scriptId_fkey` FOREIGN KEY (`scriptId`) REFERENCES `Script`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Request` ADD CONSTRAINT `Request_aiModelId_fkey` FOREIGN KEY (`aiModelId`) REFERENCES `AIModel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Request` ADD CONSTRAINT `Request_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Request` ADD CONSTRAINT `Request_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Request` ADD CONSTRAINT `Request_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Request` ADD CONSTRAINT `Request_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Request` ADD CONSTRAINT `Request_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Request`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Response` ADD CONSTRAINT `Response_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `Request`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Response` ADD CONSTRAINT `Response_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Response` ADD CONSTRAINT `Response_aiModelId_fkey` FOREIGN KEY (`aiModelId`) REFERENCES `AIModel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Response` ADD CONSTRAINT `Response_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResourceTree` ADD CONSTRAINT `ResourceTree_resourceId_fkey` FOREIGN KEY (`resourceId`) REFERENCES `Resource`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResourceTree` ADD CONSTRAINT `ResourceTree_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `ResourceTree`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResourceTree` ADD CONSTRAINT `ResourceTree_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventSubscription` ADD CONSTRAINT `EventSubscription_scriptId_fkey` FOREIGN KEY (`scriptId`) REFERENCES `Script`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventSubscription` ADD CONSTRAINT `EventSubscription_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Agent` ADD CONSTRAINT `Agent_scriptId_fkey` FOREIGN KEY (`scriptId`) REFERENCES `Script`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Agent` ADD CONSTRAINT `Agent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Agent` ADD CONSTRAINT `Agent_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Permission` ADD CONSTRAINT `Permission_toolName_fkey` FOREIGN KEY (`toolName`) REFERENCES `Tool`(`name`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Role` ADD CONSTRAINT `Role_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ToolRole` ADD CONSTRAINT `ToolRole_toolId_fkey` FOREIGN KEY (`toolId`) REFERENCES `Tool`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ToolRole` ADD CONSTRAINT `ToolRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoleInheritance` ADD CONSTRAINT `RoleInheritance_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoleInheritance` ADD CONSTRAINT `RoleInheritance_subRoleId_fkey` FOREIGN KEY (`subRoleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `Permission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectRole` ADD CONSTRAINT `ProjectRole_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectRole` ADD CONSTRAINT `ProjectRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentRole` ADD CONSTRAINT `AgentRole_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentRole` ADD CONSTRAINT `AgentRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_RequestResources` ADD CONSTRAINT `_RequestResources_A_fkey` FOREIGN KEY (`A`) REFERENCES `Request`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_RequestResources` ADD CONSTRAINT `_RequestResources_B_fkey` FOREIGN KEY (`B`) REFERENCES `Resource`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_ConversationResources` ADD CONSTRAINT `_ConversationResources_A_fkey` FOREIGN KEY (`A`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_ConversationResources` ADD CONSTRAINT `_ConversationResources_B_fkey` FOREIGN KEY (`B`) REFERENCES `Resource`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

