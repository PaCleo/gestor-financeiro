-- CreateTable
CREATE TABLE "CreditCardBill" (
    "id" TEXT NOT NULL,
    "pluggyBillId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "minimumPaymentAmount" DECIMAL(14,2),

    CONSTRAINT "CreditCardBill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditCardBill_pluggyBillId_key" ON "CreditCardBill"("pluggyBillId");

-- AddForeignKey
ALTER TABLE "CreditCardBill" ADD CONSTRAINT "CreditCardBill_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
