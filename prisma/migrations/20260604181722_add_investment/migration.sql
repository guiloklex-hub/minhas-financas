-- CreateTable
CREATE TABLE "Investment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "initialAmount" REAL NOT NULL,
    "currentAmount" REAL NOT NULL,
    "yieldRate" REAL NOT NULL,
    "startDate" DATETIME NOT NULL,
    "maturityDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
