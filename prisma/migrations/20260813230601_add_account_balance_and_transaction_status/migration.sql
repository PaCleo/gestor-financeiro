-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "balance" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'POSTED';
