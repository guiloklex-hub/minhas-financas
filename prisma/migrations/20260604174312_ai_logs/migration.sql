-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "feature" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
