ALTER TABLE "departments" ADD COLUMN "parent_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL;
