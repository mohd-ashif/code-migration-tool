-- Migration 011: Cloudinary Storage Support for Invoices
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS storage_provider VARCHAR(50) DEFAULT 'cloudinary',
ADD COLUMN IF NOT EXISTS cloudinary_public_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP NULL;

-- Update specific invoice record
UPDATE invoices 
SET pdf_url = 'https://res.cloudinary.com/smuzxkzu/raw/upload/v1784740908/invoices/INV-2026-0004.pdf',
    storage_provider = 'cloudinary',
    cloudinary_public_id = 'invoices/INV-2026-0004',
    uploaded_at = NOW(),
    updated_at = NOW() 
WHERE id = 'c24a5103-1ede-4c7c-b730-b8e9b8f86ffc';
