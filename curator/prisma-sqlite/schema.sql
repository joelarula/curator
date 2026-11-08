-- Generated from schema.prisma by `npm run prisma:sql` (scripts/generate-schema-sql.mjs). Do not edit.
-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "googleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "existent" BOOLEAN DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Tool" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT,
    "accessLevel" TEXT NOT NULL DEFAULT 'safe_write',
    "requiredRole" TEXT,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "origin" TEXT NOT NULL DEFAULT 'local',
    "mcpServerId" INTEGER,
    "remoteName" TEXT,
    "projectId" TEXT,
    "inputSchema" JSONB,
    "annotations" JSONB,
    "existent" BOOLEAN DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tool_mcpServerId_fkey" FOREIGN KEY ("mcpServerId") REFERENCES "McpServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Tool_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "McpServer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    "lastSyncedAt" DATETIME,
    "projectId" TEXT NOT NULL,
    "createdBy" TEXT,
    "existent" BOOLEAN DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "McpServer_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "McpResource" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mcpServerId" INTEGER NOT NULL,
    "uri" TEXT NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "annotations" JSONB,
    "existent" BOOLEAN DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "McpResource_mcpServerId_fkey" FOREIGN KEY ("mcpServerId") REFERENCES "McpServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "McpPrompt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mcpServerId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "arguments" JSONB,
    "existent" BOOLEAN DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "McpPrompt_mcpServerId_fkey" FOREIGN KEY ("mcpServerId") REFERENCES "McpServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uri" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "metadata" JSONB,
    "existent" BOOLEAN DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Resource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Text" (
    "resourceId" INTEGER,
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MAIN',
    "mimeType" TEXT DEFAULT 'text/plain',
    "extension" TEXT DEFAULT 'txt',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "existent" BOOLEAN DEFAULT true,
    "deletedAt" DATETIME,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Text_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Relation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "subjectId" INTEGER NOT NULL,
    "predicateId" INTEGER NOT NULL,
    "objectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aiModelId" INTEGER,
    "literalValue" REAL,
    "literalString" TEXT,
    "literalDate" DATETIME,
    "literalBoolean" BOOLEAN,
    "literalDatatype" TEXT,
    "selectionStart" INTEGER,
    "selectionEnd" INTEGER,
    "justification" TEXT,
    "projectId" TEXT,
    "existent" BOOLEAN DEFAULT true,
    CONSTRAINT "Relation_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Relation_predicateId_fkey" FOREIGN KEY ("predicateId") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Relation_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Relation_aiModelId_fkey" FOREIGN KEY ("aiModelId") REFERENCES "AIModel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Relation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attachment" (
    "resourceId" INTEGER,
    "id" TEXT NOT NULL PRIMARY KEY,
    "uri" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "slug" TEXT,
    "projectId" TEXT,
    "mimetype" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "existent" BOOLEAN DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Attachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AIModel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shortName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" TEXT,
    "url" TEXT,
    "deletedAt" DATETIME,
    "existent" BOOLEAN DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Script" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "body" TEXT,
    "toolCalls" JSONB,
    "ast" JSONB,
    "userId" TEXT,
    "projectId" TEXT,
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "existent" BOOLEAN DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Script_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScriptVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "scriptId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "ast" JSONB,
    "body" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScriptVersion_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Request" (
    "scriptVersion" INTEGER,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
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
    "scheduledAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "executionScheduled" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "notifyId" INTEGER,
    "pendingDependencies" INTEGER NOT NULL DEFAULT 0,
    "eventCursor" INTEGER,
    "lockedBy" TEXT,
    "lockedAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "parentId" INTEGER,
    "existent" BOOLEAN DEFAULT true,
    CONSTRAINT "Request_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Request_aiModelId_fkey" FOREIGN KEY ("aiModelId") REFERENCES "AIModel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Request_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Request_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Request_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Request_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Request" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Response" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestId" INTEGER NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "aiModelId" INTEGER,
    "projectId" TEXT,
    "userId" TEXT,
    "existent" BOOLEAN DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Response_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Response_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Response_aiModelId_fkey" FOREIGN KEY ("aiModelId") REFERENCES "AIModel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Response_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "externalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "metadata" JSONB,
    "existent" BOOLEAN DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Conversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResourceTree" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "treeName" TEXT NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "treeStart" REAL NOT NULL,
    "treeEnd" REAL NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT,
    "deletedAt" DATETIME,
    "existent" BOOLEAN DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ResourceTree_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ResourceTree_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ResourceTree" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ResourceTree_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventName" TEXT NOT NULL,
    "scriptId" INTEGER NOT NULL,
    "agentId" TEXT,
    "conversationId" INTEGER,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "entry" TEXT,
    "when" TEXT,
    "payloadAs" TEXT,
    CONSTRAINT "EventSubscription_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventSubscription_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "conversationId" INTEGER NOT NULL,
    "eventName" TEXT NOT NULL,
    "payload" JSONB,
    "target" TEXT,
    "source" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BusEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "conversationId" INTEGER NOT NULL,
    "eventName" TEXT NOT NULL,
    "payload" JSONB,
    "target" TEXT,
    "source" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ConversationLease" (
    "conversationId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "owner" TEXT NOT NULL,
    "leaseUntil" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "scriptId" INTEGER,
    "schedule" TEXT NOT NULL DEFAULT 'every 10 minutes',
    "lastPolledAt" DATETIME,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "parentAgentId" TEXT,
    "existent" BOOLEAN DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Agent_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Agent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "projectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Role_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ToolRole" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "toolId" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ToolRole_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ToolRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoleInheritance" (
    "parentId" TEXT NOT NULL,
    "subRoleId" TEXT NOT NULL,

    PRIMARY KEY ("parentId", "subRoleId"),
    CONSTRAINT "RoleInheritance_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoleInheritance_subRoleId_fkey" FOREIGN KEY ("subRoleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectRole" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectRole_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "projectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserRole_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentRole" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "agentId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    CONSTRAINT "AgentRole_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgentRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StepTrace" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" INTEGER NOT NULL,
    "requestId" INTEGER NOT NULL,
    "projectId" TEXT,
    "nodeType" TEXT,
    "status" TEXT NOT NULL,
    "output" TEXT,
    "startedAt" DATETIME,
    "worker" TEXT
);

-- CreateTable
CREATE TABLE "LlmCall" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" INTEGER NOT NULL,
    "requestId" INTEGER NOT NULL,
    "projectId" TEXT,
    "turn" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "request" JSONB NOT NULL,
    "response" JSONB,
    "error" TEXT,
    "ms" INTEGER
);

-- CreateTable
CREATE TABLE "LlmTelemetry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "latencyMs" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "_RequestResources" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_RequestResources_A_fkey" FOREIGN KEY ("A") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_RequestResources_B_fkey" FOREIGN KEY ("B") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ConversationResources" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_ConversationResources_A_fkey" FOREIGN KEY ("A") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ConversationResources_B_fkey" FOREIGN KEY ("B") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
CREATE UNIQUE INDEX "_RequestResources_AB_unique" ON "_RequestResources"("A", "B");

-- CreateIndex
CREATE INDEX "_RequestResources_B_index" ON "_RequestResources"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ConversationResources_AB_unique" ON "_ConversationResources"("A", "B");

-- CreateIndex
CREATE INDEX "_ConversationResources_B_index" ON "_ConversationResources"("B");

