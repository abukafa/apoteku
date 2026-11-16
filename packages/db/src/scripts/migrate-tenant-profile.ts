import { db, schema } from "../index.js";
import { sql, eq } from "drizzle-orm";

async function main() {
  console.log("Applying tenant table schema additions...");

  await db.execute(sql`
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS legal_name varchar(255),
      ADD COLUMN IF NOT EXISTS tagline varchar(255),
      ADD COLUMN IF NOT EXISTS logo_url text,
      ADD COLUMN IF NOT EXISTS pharmacist_name varchar(255),
      ADD COLUMN IF NOT EXISTS responsible_person varchar(255),
      ADD COLUMN IF NOT EXISTS sipa_number varchar(100),
      ADD COLUMN IF NOT EXISTS sipa_expiry varchar(50),
      ADD COLUMN IF NOT EXISTS sia_number varchar(100),
      ADD COLUMN IF NOT EXISTS nib varchar(100),
      ADD COLUMN IF NOT EXISTS npwp varchar(50),
      ADD COLUMN IF NOT EXISTS address text,
      ADD COLUMN IF NOT EXISTS city varchar(100),
      ADD COLUMN IF NOT EXISTS province varchar(100),
      ADD COLUMN IF NOT EXISTS postal_code varchar(20),
      ADD COLUMN IF NOT EXISTS phone varchar(50),
      ADD COLUMN IF NOT EXISTS whatsapp varchar(50),
      ADD COLUMN IF NOT EXISTS email varchar(100),
      ADD COLUMN IF NOT EXISTS website varchar(100),
      ADD COLUMN IF NOT EXISTS bank_name varchar(100),
      ADD COLUMN IF NOT EXISTS bank_account_number varchar(100),
      ADD COLUMN IF NOT EXISTS bank_account_holder varchar(255),
      ADD COLUMN IF NOT EXISTS bank_accounts text,
      ADD COLUMN IF NOT EXISTS signature_url text,
      ADD COLUMN IF NOT EXISTS stamp_url text,
      ADD COLUMN IF NOT EXISTS receipt_header text,
      ADD COLUMN IF NOT EXISTS receipt_footer text;
  `);

  console.log("Columns verified/added successfully!");

  // Now populate or update the default tenant row
  const [tenant] = await db.select().from(schema.tenants).limit(1);
  if (!tenant) {
    console.error("No tenant found to update!");
    process.exit(1);
  }

  const updatedData = {
    name: tenant.name || "Apotek Hafidz Farma",
    legalName: "PT Hafidz Farma Medika",
    tagline: "Ikhtiar Sehat Keluarga",
    logoUrl: "/logo.png",
    pharmacistName: "apt. Ghina Nadhifah, S.Farm.",
    responsiblePerson: "apt. Ghina Nadhifah, S.Farm.",
    sipaNumber: "500.16.7.2/0289/SIPA/DPMPTSP/II/2026",
    sipaExpiry: "2029-12-31",
    siaNumber: "503/0124/SIA/DPMPTSP/2024",
    nib: "1234000567891",
    npwp: "01.234.567.8-123.000",
    address: "Jl. Raya Cirebon - Kuningan No. 45, Cilimus",
    city: "Kuningan",
    province: "Jawa Barat",
    postalCode: "45553",
    phone: "(0232) 876543",
    whatsapp: "0812-3456-7890",
    email: "info@hafidzfarma.com",
    website: "https://hafidzfarma.com",
    bankName: "BCA",
    bankAccountNumber: "0541238910",
    bankAccountHolder: "Apotek Hafidz Farma",
    bankAccounts: JSON.stringify([
      { bank: "BCA", accountNumber: "0541238910", accountHolder: "Apotek Hafidz Farma", isDefault: true },
      { bank: "Mandiri", accountNumber: "1310098765432", accountHolder: "Apotek Hafidz Farma", isDefault: false },
      { bank: "BSI", accountNumber: "7123456789", accountHolder: "Apotek Hafidz Farma", isDefault: false }
    ]),
    signatureUrl: "/signatures/apt-ghina.png",
    stampUrl: "/stamps/apotek-hafidz-farma.png",
    receiptHeader: "APOTEK HAFIDZ FARMA\nJl. Raya Cirebon - Kuningan No. 45\nTelp: (0232) 876543 / WA: 0812-3456-7890",
    receiptFooter: "Semoga Lekas Sembuh • Terima Kasih atas Kepercayaan Anda\nObat yang sudah dibeli tidak dapat ditukar/dikembalikan"
  };

  await db.update(schema.tenants).set(updatedData).where(eq(schema.tenants.id, tenant.id));
  console.log(`Tenant '${tenant.name}' (ID: ${tenant.id}) updated with comprehensive profile data!`);

  const [verify] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenant.id));
  console.log("Verification sample:", {
    name: verify.name,
    tagline: verify.tagline,
    pharmacistName: verify.pharmacistName,
    sipaNumber: verify.sipaNumber,
    bankName: verify.bankName,
    bankAccountNumber: verify.bankAccountNumber,
    address: verify.address
  });

  process.exit(0);
}

main().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
