CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "existent" BOOLEAN DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Tool" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "existent" BOOLEAN DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

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

CREATE TABLE "Attachment" (
    "resourceId" INTEGER,
    "id" TEXT NOT NULL PRIMARY KEY,
    "uri" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimetype" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "existent" BOOLEAN DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

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

CREATE TABLE "Script" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "body" TEXT,
    "toolCalls" JSONB,
    "ast" JSONB,
    "userId" TEXT,
    "projectId" TEXT,
    "existent" BOOLEAN DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Script_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Request" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "toolName" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "scriptId" INTEGER,
    "aiModelId" INTEGER,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "toolCalls" JSONB,
    "ast" JSONB,
    "toolArgs" JSONB,
    "callbacks" JSONB,
    "context" JSONB,
    "conversationId" INTEGER NOT NULL,
    "agentId" TEXT,
    "scheduledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executionScheduled" DATETIME DEFAULT CURRENT_TIMESTAMP,
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

CREATE TABLE "Response" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestId" INTEGER NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "aiModelId" INTEGER,
    "projectId" TEXT,
    "existent" BOOLEAN DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Response_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Response_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Response_aiModelId_fkey" FOREIGN KEY ("aiModelId") REFERENCES "AIModel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Response_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

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

CREATE TABLE "Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "scriptId" INTEGER NOT NULL,
    "schedule" TEXT NOT NULL DEFAULT 'every 10 minutes',
    "lastPolledAt" DATETIME,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "existent" BOOLEAN DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Agent_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Agent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "_RequestResources" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_RequestResources_A_fkey" FOREIGN KEY ("A") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_RequestResources_B_fkey" FOREIGN KEY ("B") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "_ConversationResources" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_ConversationResources_A_fkey" FOREIGN KEY ("A") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ConversationResources_B_fkey" FOREIGN KEY ("B") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);