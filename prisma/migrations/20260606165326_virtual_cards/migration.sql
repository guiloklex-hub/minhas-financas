-- CreateTable
CREATE TABLE "VirtualCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastFour" TEXT,
    "color" TEXT,
    "spendingLimit" REAL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VirtualCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CreditCardTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PURCHASE',
    "categoryId" TEXT,
    "notes" TEXT,
    "tags" TEXT,
    "installmentGroupId" TEXT,
    "installmentNumber" INTEGER,
    "installmentTotal" INTEGER,
    "invoiceId" TEXT,
    "virtualCardId" TEXT,
    "fxCurrency" TEXT,
    "fxAmount" REAL,
    "iofAmount" REAL,
    "rewardPoints" REAL NOT NULL DEFAULT 0,
    "isSubscription" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceGroupId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreditCardTransaction_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CreditCardTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CreditCardTransaction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "CreditCardInvoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CreditCardTransaction_virtualCardId_fkey" FOREIGN KEY ("virtualCardId") REFERENCES "VirtualCard" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CreditCardTransaction" ("amount", "cardId", "categoryId", "createdAt", "date", "fxAmount", "fxCurrency", "id", "installmentGroupId", "installmentNumber", "installmentTotal", "invoiceId", "iofAmount", "isSubscription", "notes", "recurrenceGroupId", "rewardPoints", "tags", "title", "type", "updatedAt") SELECT "amount", "cardId", "categoryId", "createdAt", "date", "fxAmount", "fxCurrency", "id", "installmentGroupId", "installmentNumber", "installmentTotal", "invoiceId", "iofAmount", "isSubscription", "notes", "recurrenceGroupId", "rewardPoints", "tags", "title", "type", "updatedAt" FROM "CreditCardTransaction";
DROP TABLE "CreditCardTransaction";
ALTER TABLE "new_CreditCardTransaction" RENAME TO "CreditCardTransaction";
CREATE INDEX "CreditCardTransaction_cardId_idx" ON "CreditCardTransaction"("cardId");
CREATE INDEX "CreditCardTransaction_date_idx" ON "CreditCardTransaction"("date");
CREATE INDEX "CreditCardTransaction_invoiceId_idx" ON "CreditCardTransaction"("invoiceId");
CREATE INDEX "CreditCardTransaction_virtualCardId_idx" ON "CreditCardTransaction"("virtualCardId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "VirtualCard_cardId_idx" ON "VirtualCard"("cardId");
