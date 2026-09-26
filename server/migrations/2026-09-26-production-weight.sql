-- Run once in hadibt_business_platform before deploying the matching API.
ALTER TABLE production_tasks ADD COLUMN weight_of_10_grams DECIMAL(14,3) NULL AFTER required_quantity;
ALTER TABLE production_logs ADD COLUMN total_weight_grams DECIMAL(14,3) NOT NULL DEFAULT 0 AFTER quantity;
