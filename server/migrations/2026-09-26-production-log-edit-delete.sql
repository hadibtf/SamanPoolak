-- Run once in hadibt_business_platform before deploying log edit/delete API.
ALTER TABLE production_logs
  ADD COLUMN updated_at DATETIME NULL AFTER created_at,
  ADD COLUMN deleted_at DATETIME NULL AFTER updated_at;
