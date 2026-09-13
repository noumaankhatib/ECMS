-- AlterTable
ALTER TABLE "submission" ADD COLUMN     "clarification_requested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clarification_requested_at" TIMESTAMPTZ(6),
ADD COLUMN     "clarification_responded_at" TIMESTAMPTZ(6),
ADD COLUMN     "clarification_response" TEXT,
ADD COLUMN     "department" VARCHAR(20) NOT NULL DEFAULT 'PLANNING',
ADD COLUMN     "pending_with" VARCHAR(100),
ADD COLUMN     "permit_reference" VARCHAR(100),
ADD COLUMN     "pre_halt_status" VARCHAR(30);

-- CreateTable
CREATE TABLE "submission_review" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "submission_id" UUID NOT NULL,
    "review_date" DATE NOT NULL,
    "reviewer_name" VARCHAR(200),
    "comments" TEXT,
    "response_due_at" DATE,
    "response_text" TEXT,
    "responded_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "submission_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_meeting" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "submission_id" UUID NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "meeting_at" TIMESTAMPTZ(6),
    "attendees" TEXT,
    "purpose" TEXT,
    "outcome" TEXT,
    "held_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "submission_meeting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "submission_review_submission_id_idx" ON "submission_review"("submission_id");

-- CreateIndex
CREATE INDEX "submission_meeting_submission_id_idx" ON "submission_meeting"("submission_id");

-- AddForeignKey
ALTER TABLE "submission_review" ADD CONSTRAINT "submission_review_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_meeting" ADD CONSTRAINT "submission_meeting_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
