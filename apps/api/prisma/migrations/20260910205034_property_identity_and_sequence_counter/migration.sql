-- AlterTable
ALTER TABLE "property" ADD COLUMN     "owner_name" VARCHAR(200),
ADD COLUMN     "owner_national_id" VARCHAR(50),
ADD COLUMN     "plot_number" VARCHAR(50),
ADD COLUMN     "survey_reference" VARCHAR(100),
ADD COLUMN     "title_deed_reference" VARCHAR(100),
ADD COLUMN     "village" VARCHAR(100),
ADD COLUMN     "wilayat" VARCHAR(100);

-- CreateTable
CREATE TABLE "sequence_counter" (
    "sequence_type" VARCHAR(30) NOT NULL,
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sequence_counter_pkey" PRIMARY KEY ("sequence_type","year")
);
