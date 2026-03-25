ALTER TABLE "policy_rules" ADD COLUMN IF NOT EXISTS "leave_type_id" uuid REFERENCES "leave_types"("id") ON DELETE CASCADE;
