import { queryDatabase } from "../lib/database";
import { BillingAddress } from "../models/billing.model";

export class BillingAddressRepository {
  async findByWorkspaceId(workspaceId: string): Promise<BillingAddress | null> {
    const rows = await queryDatabase(
      `SELECT workspace_id AS "workspaceId", company_name AS "companyName", gst_number AS "gstNumber",
              address_line1 AS "addressLine1", address_line2 AS "addressLine2", city, state, 
              pin_code AS "pinCode", country, phone, email, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM billing_addresses
       WHERE workspace_id = $1::uuid`,
      [workspaceId]
    );
    return rows[0] || null;
  }

  async save(address: {
    workspaceId: string;
    companyName?: string | null;
    gstNumber?: string | null;
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    state: string;
    pinCode: string;
    country?: string;
    phone?: string | null;
    email?: string | null;
  }): Promise<BillingAddress> {
    const rows = await queryDatabase(
      `INSERT INTO billing_addresses (workspace_id, company_name, gst_number, address_line1, address_line2, city, state, pin_code, country, phone, email)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (workspace_id) DO UPDATE 
       SET company_name = EXCLUDED.company_name, gst_number = EXCLUDED.gst_number, 
           address_line1 = EXCLUDED.address_line1, address_line2 = EXCLUDED.address_line2, 
           city = EXCLUDED.city, state = EXCLUDED.state, pin_code = EXCLUDED.pin_code, 
           country = EXCLUDED.country, phone = EXCLUDED.phone, email = EXCLUDED.email, updated_at = NOW()
       RETURNING workspace_id AS "workspaceId", company_name AS "companyName", gst_number AS "gstNumber",
                 address_line1 AS "addressLine1", address_line2 AS "addressLine2", city, state, 
                 pin_code AS "pinCode", country, phone, email`,
      [
        address.workspaceId,
        address.companyName || null,
        address.gstNumber || null,
        address.addressLine1,
        address.addressLine2 || null,
        address.city,
        address.state,
        address.pinCode,
        address.country || 'India',
        address.phone || null,
        address.email || null,
      ]
    );
    return rows[0];
  }
}
export const billingAddressRepository = new BillingAddressRepository();
