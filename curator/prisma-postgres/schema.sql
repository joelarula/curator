-- Generated from schema.prisma by `npm run prisma:sql` (scripts/generate-schema-sql.mjs). Do not edit.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('NEW', 'WAITING', 'WAITING_FOR_USER', 'WAITING_FOR_EVENT', 'COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED', 'SKIPPED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "googleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "existent" BOOLEAN DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tool" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT,
    "accessLevel" TEXT NOT NULL DEFAULT 'safe_write',
    "requiredRole" TEXT,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "existent" BOOLEAN DEFAULT true,
    "origin" TEXT NOT NULL DEFAULT 'local',
    "mcpServerId" INTEGER,
    "remoteName" TEXT,
    "projectId" TEXT,
    "inputSchema" JSONB,
    "annotations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpServer" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "transport" TEXT NOT NULL DEFAULT 'streamable-http',
    "authService" TEXT,
    "status" TEXT NOT NULL DEFAULT 'registered',
    "lastError" TEXT,
    "serverInfo" JSONB,
    "instructions" TEXT,
    "expectations" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "projectId" TEXT NOT NULL,
    "createdBy" TEXT,
    "existent" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpResource" (
    "id" SERIAL NOT NULL,
    "mcpServerId" INTEGER NOT NULL,
    "uri" VARCHAR(512) NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "annotations" JSONB,
    "existent" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpPrompt" (
    "id" SERIAL NOT NULL,
    "mcpServerId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "arguments" JSONB,
    "existent" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" SERIAL NOT NULL,
    "uri" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "metadata" JSONB,
    "existent" BOOLEAN DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Text" (
    "resourceId" INTEGER,
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MAIN',
    "mimeType" TEXT DEFAULT 'text/plain',
    "extension" TEXT DEFAULT 'txt',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "existent" BOOLEAN DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Text_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relation" (
    "id" SERIAL NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "predicateId" INTEGER NOT NULL,
    "objectId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aiModelId" INTEGER,
    "literalValue" DOUBLE PRECISION,
    "literalString" TEXT,
    "literalDate" TIMESTAMP(3),
    "literalBoolean" BOOLEAN,
    "literalDatatype" TEXT,
    "selectionStart" INTEGER,
    "selectionEnd" INTEGER,
    "justification" TEXT,
    "projectId" TEXT,
    "existent" BOOLEAN DEFAULT true,

    CONSTRAINT "Relation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "resourceId" INTEGER,
    "id" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "slug" TEXT,
    "projectId" TEXT,
    "mimetype" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "existent" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIModel" (
    "id" SERIAL NOT NULL,
    "shortName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" TEXT,
    "url" TEXT,
    "deletedAt" TIMESTAMP(3),
    "existent" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Script" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT,
    "toolCalls" JSONB,
    "ast" JSONB,
    "userId" TEXT,
    "projectId" TEXT,
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "existent" BOOLEAN DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Script_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScriptVersion" (
    "id" SERIAL NOT NULL,
    "scriptId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "ast" JSONB,
    "body" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScriptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Request" (
    "scriptVersion" INTEGER,
    "id" SERIAL NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'NEW',
    "toolName" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "scriptId" INTEGER,
    "aiModelId" INTEGER,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "ast" JSONB,
    "context" JSONB,
    "output" TEXT,
    "conversationId" INTEGER NOT NULL,
    "agentId" TEXT,
    "scheduledAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "executionScheduled" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "notifyId" INTEGER,
    "pendingDependencies" INTEGER NOT NULL DEFAULT 0,
    "eventCursor" INTEGER,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "parentId" INTEGER,
    "createdBy" INTEGER,
    "existent" BOOLEAN DEFAULT true,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Response" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "aiModelId" INTEGER,
    "projectId" TEXT,
    "userId" TEXT,
    "existent" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" SERIAL NOT NULL,
    "externalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "metadata" JSONB,
    "title" TEXT,
    "pinnedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "existent" BOOLEAN DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceTree" (
    "id" SERIAL NOT NULL,
    "treeName" TEXT NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "treeStart" DOUBLE PRECISION NOT NULL,
    "treeEnd" DOUBLE PRECISION NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "existent" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceTree_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSubscription" (
    "id" SERIAL NOT NULL,
    "eventName" TEXT NOT NULL,
    "scriptId" INTEGER NOT NULL,
    "agentId" TEXT,
    "conversationId" INTEGER,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "entry" TEXT,
    "when" TEXT,
    "payloadAs" TEXT,

    CONSTRAINT "EventSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventLog" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "eventName" TEXT NOT NULL,
    "payload" JSONB,
    "target" TEXT,
    "source" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusEvent" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "eventName" TEXT NOT NULL,
    "payload" JSONB,
    "target" TEXT,
    "source" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusEvent_pkey" PRIMARY KEY ("id","createdAt")
);

-- CreateTable
CREATE TABLE "ConversationLease" (
    "conversationId" INTEGER NOT NULL,
    "owner" TEXT NOT NULL,
    "leaseUntil" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationLease_pkey" PRIMARY KEY ("conversationId")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scriptId" INTEGER,
    "schedule" TEXT NOT NULL DEFAULT 'every 10 minutes',
    "lastPolledAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "parentAgentId" TEXT,
    "existent" BOOLEAN DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolRole" (
    "id" SERIAL NOT NULL,
    "toolId" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleInheritance" (
    "parentId" TEXT NOT NULL,
    "subRoleId" TEXT NOT NULL,

    CONSTRAINT "RoleInheritance_pkey" PRIMARY KEY ("parentId","subRoleId")
);

-- CreateTable
CREATE TABLE "ProjectRole" (
    "id" SERIAL NOT NULL,
    "projectId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRole" (
    "id" SERIAL NOT NULL,
    "agentId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "AgentRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepTrace" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" INTEGER NOT NULL,
    "requestId" INTEGER NOT NULL,
    "projectId" TEXT,
    "nodeType" TEXT,
    "status" TEXT NOT NULL,
    "output" TEXT,
    "astHash" TEXT,
    "context" JSONB,
    "startedAt" TIMESTAMP(3),
    "worker" TEXT,

    CONSTRAINT "StepTrace_pkey" PRIMARY KEY ("id","createdAt")
);

-- CreateTable
CREATE TABLE "LlmCall" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" INTEGER NOT NULL,
    "requestId" INTEGER NOT NULL,
    "projectId" TEXT,
    "turn" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "request" JSONB NOT NULL,
    "response" JSONB,
    "error" TEXT,
    "ms" INTEGER,

    CONSTRAINT "LlmCall_pkey" PRIMARY KEY ("id","createdAt")
);

-- CreateTable
CREATE TABLE "LlmTelemetry" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL DEFAULT 'system',
    "userId" TEXT,
    "conversationId" INTEGER NOT NULL,
    "requestId" INTEGER NOT NULL,
    "turn" INTEGER NOT NULL DEFAULT 1,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "finishReason" TEXT,
    "requestChars" INTEGER NOT NULL,
    "responseChars" INTEGER NOT NULL,
    "estimatedTokens" INTEGER,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "cachedTokens" INTEGER,
    "totalTokens" INTEGER,
    "latencyMs" INTEGER NOT NULL,

    CONSTRAINT "LlmTelemetry_pkey" PRIMARY KEY ("id","createdAt")
);

-- CreateTable
CREATE TABLE "PluginConfigValue" (
    "id" SERIAL NOT NULL,
    "namespace" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "projectId" TEXT NOT NULL DEFAULT 'system',
    "userId" TEXT NOT NULL DEFAULT '',
    "value" JSONB,
    "updatedBy" TEXT,
    "existent" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluginConfigValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedPrompt" (
    "id" SERIAL NOT NULL,
    "projectId" TEXT NOT NULL DEFAULT 'system',
    "name" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "text" TEXT NOT NULL,
    "arguments" JSONB,
    "createdBy" TEXT,
    "existent" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_RequestResources" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_RequestResources_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ConversationResources" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_ConversationResources_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "Project_userId_existent_idx" ON "Project"("userId", "existent");

-- CreateIndex
CREATE INDEX "Project_parentId_idx" ON "Project"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Tool_name_key" ON "Tool"("name");

-- CreateIndex
CREATE INDEX "Tool_existent_idx" ON "Tool"("existent");

-- CreateIndex
CREATE INDEX "Tool_origin_idx" ON "Tool"("origin");

-- CreateIndex
CREATE INDEX "Tool_projectId_idx" ON "Tool"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Tool_mcpServerId_remoteName_key" ON "Tool"("mcpServerId", "remoteName");

-- CreateIndex
CREATE INDEX "McpServer_projectId_existent_idx" ON "McpServer"("projectId", "existent");

-- CreateIndex
CREATE UNIQUE INDEX "McpServer_projectId_name_key" ON "McpServer"("projectId", "name");

-- CreateIndex
CREATE INDEX "McpResource_mcpServerId_existent_idx" ON "McpResource"("mcpServerId", "existent");

-- CreateIndex
CREATE UNIQUE INDEX "McpResource_mcpServerId_uri_key" ON "McpResource"("mcpServerId", "uri");

-- CreateIndex
CREATE INDEX "McpPrompt_mcpServerId_existent_idx" ON "McpPrompt"("mcpServerId", "existent");

-- CreateIndex
CREATE UNIQUE INDEX "McpPrompt_mcpServerId_name_key" ON "McpPrompt"("mcpServerId", "name");

-- CreateIndex
CREATE INDEX "Resource_uri_existent_idx" ON "Resource"("uri", "existent");

-- CreateIndex
CREATE INDEX "Resource_existent_idx" ON "Resource"("existent");

-- CreateIndex
CREATE INDEX "Resource_deletedAt_idx" ON "Resource"("deletedAt");

-- CreateIndex
CREATE INDEX "Resource_projectId_idx" ON "Resource"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_uri_key" ON "Resource"("uri");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_id_existent_key" ON "Resource"("id", "existent");

-- CreateIndex
CREATE INDEX "Text_resourceId_existent_idx" ON "Text"("resourceId", "existent");

-- CreateIndex
CREATE INDEX "Text_existent_idx" ON "Text"("existent");

-- CreateIndex
CREATE UNIQUE INDEX "Text_resourceId_role_key" ON "Text"("resourceId", "role");

-- CreateIndex
CREATE INDEX "Relation_subjectId_existent_idx" ON "Relation"("subjectId", "existent");

-- CreateIndex
CREATE INDEX "Relation_predicateId_existent_idx" ON "Relation"("predicateId", "existent");

-- CreateIndex
CREATE INDEX "Relation_objectId_existent_idx" ON "Relation"("objectId", "existent");

-- CreateIndex
CREATE INDEX "Relation_existent_idx" ON "Relation"("existent");

-- CreateIndex
CREATE INDEX "Relation_projectId_idx" ON "Relation"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Relation_subjectId_predicateId_objectId_key" ON "Relation"("subjectId", "predicateId", "objectId");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_uri_key" ON "Attachment"("uri");

-- CreateIndex
CREATE INDEX "Attachment_existent_idx" ON "Attachment"("existent");

-- CreateIndex
CREATE UNIQUE INDEX "AIModel_shortName_key" ON "AIModel"("shortName");

-- CreateIndex
CREATE UNIQUE INDEX "AIModel_name_key" ON "AIModel"("name");

-- CreateIndex
CREATE INDEX "AIModel_existent_idx" ON "AIModel"("existent");

-- CreateIndex
CREATE INDEX "Script_existent_idx" ON "Script"("existent");

-- CreateIndex
CREATE UNIQUE INDEX "Script_name_key" ON "Script"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ScriptVersion_scriptId_version_key" ON "ScriptVersion"("scriptId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ScriptVersion_scriptId_hash_key" ON "ScriptVersion"("scriptId", "hash");

-- CreateIndex
CREATE INDEX "Request_status_existent_idx" ON "Request"("status", "existent");

-- CreateIndex
CREATE INDEX "Request_existent_idx" ON "Request"("existent");

-- CreateIndex
CREATE INDEX "Request_conversationId_status_idx" ON "Request"("conversationId", "status");

-- CreateIndex
CREATE INDEX "Request_conversationId_updatedAt_idx" ON "Request"("conversationId", "updatedAt");

-- CreateIndex
CREATE INDEX "Request_parentId_idx" ON "Request"("parentId");

-- CreateIndex
CREATE INDEX "Request_conversationId_createdBy_idx" ON "Request"("conversationId", "createdBy");

-- CreateIndex
CREATE INDEX "Request_notifyId_idx" ON "Request"("notifyId");

-- CreateIndex
CREATE INDEX "Response_existent_idx" ON "Response"("existent");

-- CreateIndex
CREATE INDEX "Response_requestId_idx" ON "Response"("requestId");

-- CreateIndex
CREATE INDEX "Response_conversationId_createdAt_idx" ON "Response"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_externalId_key" ON "Conversation"("externalId");

-- CreateIndex
CREATE INDEX "Conversation_existent_idx" ON "Conversation"("existent");

-- CreateIndex
CREATE INDEX "Conversation_projectId_userId_existent_idx" ON "Conversation"("projectId", "userId", "existent");

-- CreateIndex
CREATE INDEX "ResourceTree_treeName_treeStart_treeEnd_existent_idx" ON "ResourceTree"("treeName", "treeStart", "treeEnd", "existent");

-- CreateIndex
CREATE INDEX "ResourceTree_existent_idx" ON "ResourceTree"("existent");

-- CreateIndex
CREATE INDEX "ResourceTree_deletedAt_idx" ON "ResourceTree"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceTree_treeName_resourceId_key" ON "ResourceTree"("treeName", "resourceId");

-- CreateIndex
CREATE INDEX "EventSubscription_eventName_isActive_idx" ON "EventSubscription"("eventName", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "EventSubscription_scriptId_entry_eventName_conversationId_key" ON "EventSubscription"("scriptId", "entry", "eventName", "conversationId");

-- CreateIndex
CREATE INDEX "EventLog_conversationId_eventName_id_idx" ON "EventLog"("conversationId", "eventName", "id");

-- CreateIndex
CREATE INDEX "BusEvent_conversationId_eventName_id_idx" ON "BusEvent"("conversationId", "eventName", "id");

-- CreateIndex
CREATE INDEX "BusEvent_createdAt_idx" ON "BusEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ConversationLease_owner_idx" ON "ConversationLease"("owner");

-- CreateIndex
CREATE INDEX "Agent_existent_idx" ON "Agent"("existent");

-- CreateIndex
CREATE INDEX "Agent_parentAgentId_idx" ON "Agent"("parentAgentId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_name_key" ON "Agent"("name");

-- CreateIndex
CREATE INDEX "Role_projectId_idx" ON "Role"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_projectId_name_key" ON "Role"("projectId", "name");

-- CreateIndex
CREATE INDEX "ToolRole_toolId_idx" ON "ToolRole"("toolId");

-- CreateIndex
CREATE INDEX "ToolRole_roleId_idx" ON "ToolRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "ToolRole_toolId_roleId_key" ON "ToolRole"("toolId", "roleId");

-- CreateIndex
CREATE INDEX "ProjectRole_projectId_idx" ON "ProjectRole"("projectId");

-- CreateIndex
CREATE INDEX "ProjectRole_roleId_idx" ON "ProjectRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRole_projectId_roleId_key" ON "ProjectRole"("projectId", "roleId");

-- CreateIndex
CREATE INDEX "UserRole_userId_idx" ON "UserRole"("userId");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE INDEX "UserRole_projectId_idx" ON "UserRole"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_projectId_key" ON "UserRole"("userId", "roleId", "projectId");

-- CreateIndex
CREATE INDEX "AgentRole_agentId_idx" ON "AgentRole"("agentId");

-- CreateIndex
CREATE INDEX "AgentRole_roleId_idx" ON "AgentRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRole_agentId_roleId_key" ON "AgentRole"("agentId", "roleId");

-- CreateIndex
CREATE INDEX "StepTrace_conversationId_createdAt_idx" ON "StepTrace"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "StepTrace_requestId_idx" ON "StepTrace"("requestId");

-- CreateIndex
CREATE INDEX "LlmCall_conversationId_createdAt_idx" ON "LlmCall"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "LlmCall_requestId_idx" ON "LlmCall"("requestId");

-- CreateIndex
CREATE INDEX "LlmTelemetry_projectId_createdAt_idx" ON "LlmTelemetry"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "LlmTelemetry_projectId_conversationId_createdAt_idx" ON "LlmTelemetry"("projectId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "LlmTelemetry_conversationId_turn_idx" ON "LlmTelemetry"("conversationId", "turn");

-- CreateIndex
CREATE INDEX "LlmTelemetry_requestId_idx" ON "LlmTelemetry"("requestId");

-- CreateIndex
CREATE INDEX "PluginConfigValue_projectId_userId_existent_idx" ON "PluginConfigValue"("projectId", "userId", "existent");

-- CreateIndex
CREATE UNIQUE INDEX "PluginConfigValue_namespace_key_scope_projectId_userId_exis_key" ON "PluginConfigValue"("namespace", "key", "scope", "projectId", "userId", "existent");

-- CreateIndex
CREATE INDEX "SavedPrompt_projectId_existent_idx" ON "SavedPrompt"("projectId", "existent");

-- CreateIndex
CREATE UNIQUE INDEX "SavedPrompt_projectId_name_existent_key" ON "SavedPrompt"("projectId", "name", "existent");

-- CreateIndex
CREATE INDEX "_RequestResources_B_index" ON "_RequestResources"("B");

-- CreateIndex
CREATE INDEX "_ConversationResources_B_index" ON "_ConversationResources"("B");

-- AddForeignKey
ALTER TABLE "Tool" ADD CONSTRAINT "Tool_mcpServerId_fkey" FOREIGN KEY ("mcpServerId") REFERENCES "McpServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tool" ADD CONSTRAINT "Tool_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpServer" ADD CONSTRAINT "McpServer_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpResource" ADD CONSTRAINT "McpResource_mcpServerId_fkey" FOREIGN KEY ("mcpServerId") REFERENCES "McpServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpPrompt" ADD CONSTRAINT "McpPrompt_mcpServerId_fkey" FOREIGN KEY ("mcpServerId") REFERENCES "McpServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Text" ADD CONSTRAINT "Text_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relation" ADD CONSTRAINT "Relation_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relation" ADD CONSTRAINT "Relation_predicateId_fkey" FOREIGN KEY ("predicateId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relation" ADD CONSTRAINT "Relation_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relation" ADD CONSTRAINT "Relation_aiModelId_fkey" FOREIGN KEY ("aiModelId") REFERENCES "AIModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relation" ADD CONSTRAINT "Relation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptVersion" ADD CONSTRAINT "ScriptVersion_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_aiModelId_fkey" FOREIGN KEY ("aiModelId") REFERENCES "AIModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_aiModelId_fkey" FOREIGN KEY ("aiModelId") REFERENCES "AIModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceTree" ADD CONSTRAINT "ResourceTree_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceTree" ADD CONSTRAINT "ResourceTree_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ResourceTree"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceTree" ADD CONSTRAINT "ResourceTree_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSubscription" ADD CONSTRAINT "EventSubscription_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSubscription" ADD CONSTRAINT "EventSubscription_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolRole" ADD CONSTRAINT "ToolRole_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolRole" ADD CONSTRAINT "ToolRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleInheritance" ADD CONSTRAINT "RoleInheritance_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleInheritance" ADD CONSTRAINT "RoleInheritance_subRoleId_fkey" FOREIGN KEY ("subRoleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRole" ADD CONSTRAINT "ProjectRole_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRole" ADD CONSTRAINT "ProjectRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRole" ADD CONSTRAINT "AgentRole_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRole" ADD CONSTRAINT "AgentRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RequestResources" ADD CONSTRAINT "_RequestResources_A_fkey" FOREIGN KEY ("A") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RequestResources" ADD CONSTRAINT "_RequestResources_B_fkey" FOREIGN KEY ("B") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ConversationResources" ADD CONSTRAINT "_ConversationResources_A_fkey" FOREIGN KEY ("A") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ConversationResources" ADD CONSTRAINT "_ConversationResources_B_fkey" FOREIGN KEY ("B") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

