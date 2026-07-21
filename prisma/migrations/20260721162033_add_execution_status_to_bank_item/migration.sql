/*
  Warnings:

  - Added the required column `executionStatus` to the `BankItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BankItem" ADD COLUMN     "executionStatus" TEXT NOT NULL;
