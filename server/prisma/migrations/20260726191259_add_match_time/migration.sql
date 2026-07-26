/*
  Warnings:

  - Added the required column `matchTime` to the `Pick` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Pick" ADD COLUMN     "matchTime" TIMESTAMP(3) NOT NULL;
