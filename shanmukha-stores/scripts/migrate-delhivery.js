const pool = require('../config/db');

async function migrate() {
  console.log('Migrating Delhivery columns and store settings...');
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS awb_number VARCHAR(100);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_name VARCHAR(50) DEFAULT 'Delhivery';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_label_url TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS delhivery_status VARCHAR(100);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_location VARCHAR(150) DEFAULT 'Shanmukha_Stores_Vijayawada';
    
    INSERT INTO store_settings (setting_key, setting_value)
    VALUES 
      ('delhivery_api_token', 'db87a430be6265eaa629935fac6fcb454306e3da'),
      ('delhivery_warehouse_name', 'Shanmukha_Stores_Vijayawada'),
      ('delhivery_enabled', 'true')
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;
  `);
  console.log('✅ Delhivery database migration completed.');
  process.exit(0);
}

migrate().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});
