const pool = require('../config/db');
const fs = require('fs');
const path = require('path');

async function setup() {
  console.log('Creating uploaded_files table if not exists...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS uploaded_files (
      id SERIAL PRIMARY KEY,
      file_path TEXT UNIQUE NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      data BYTEA NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_uploaded_files_path ON uploaded_files(file_path);
  `);
  console.log('✅ uploaded_files table ensured.');

  // Optionally backfill existing local public/uploads/products images into uploaded_files
  const productsDir = path.join(__dirname, '..', 'public', 'uploads', 'products');
  if (fs.existsSync(productsDir)) {
    const files = fs.readdirSync(productsDir);
    let count = 0;
    for (const f of files) {
      const fullPath = path.join(productsDir, f);
      if (fs.statSync(fullPath).isFile()) {
        const ext = path.extname(f).toLowerCase();
        let mime = 'image/jpeg';
        if (ext === '.webp') mime = 'image/webp';
        else if (ext === '.png') mime = 'image/png';
        else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
        else if (ext === '.mp4') mime = 'video/mp4';

        const file_path = `/uploads/products/${f}`;
        const data = fs.readFileSync(fullPath);
        await pool.query(`
          INSERT INTO uploaded_files (file_path, mime_type, data)
          VALUES ($1, $2, $3)
          ON CONFLICT (file_path) DO NOTHING
        `, [file_path, mime, data]);
        count++;
      }
    }
    console.log(`✅ Backfilled ${count} existing products into uploaded_files.`);
  }

  process.exit(0);
}

setup().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
