import { queryClient } from "../client.js";

async function runMigration() {
  console.log("Applying notifications table migration to PostgreSQL...");

  await queryClient.unsafe(`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      target_role VARCHAR(50),
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      category VARCHAR(50) NOT NULL,
      type VARCHAR(50) NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'INFO',
      action_url VARCHAR(255),
      metadata JSONB,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_notif_tenant_user ON notifications(tenant_id, user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_notif_tenant_role ON notifications(tenant_id, target_role);
    CREATE INDEX IF NOT EXISTS idx_notif_branch_created ON notifications(branch_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_notif_category_type ON notifications(category, type);

    CREATE TABLE IF NOT EXISTS notification_reads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_user_read ON notification_reads(notification_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_notif_read_user ON notification_reads(user_id);
  `);

  console.log("Notifications tables and indexes created successfully!");
  process.exit(0);
}

runMigration().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
