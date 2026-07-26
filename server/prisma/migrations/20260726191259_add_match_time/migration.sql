-- AlterTable
-- DEFAULT now() ajouté manuellement pour ne pas échouer si la table "Pick"
-- contient déjà des lignes (elles sont de toute façon régénérées chaque jour).
ALTER TABLE "Pick" ADD COLUMN     "matchTime" TIMESTAMP(3) NOT NULL DEFAULT now();
