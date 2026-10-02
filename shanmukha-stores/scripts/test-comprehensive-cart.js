const http = require('http');
const pool = require('../config/db');
const bcrypt = require('bcrypt');

function makeSessionClient() {
  let cookies = [];
  return {
    getCookies: () => cookies,
    request: (options, postData = null) => {
      return new Promise((resolve, reject) => {
        const defaultHeaders = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
        if (cookies.length > 0) defaultHeaders['Cookie'] = cookies.join('; ');

        let bodyPayload = postData;
        if (postData && typeof postData === 'object') {
          bodyPayload = new URLSearchParams(postData).toString();
          defaultHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
        } else if (postData && typeof postData === 'string') {
          defaultHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
        }
        if (bodyPayload) {
          defaultHeaders['Content-Length'] = Buffer.byteLength(bodyPayload);
        }

        const reqOpts = {
          hostname: '127.0.0.1',
          port: 3000,
          path: options.path,
          method: options.method || 'GET',
          headers: { ...defaultHeaders, ...(options.headers || {}) },
        };

        const req = http.request(reqOpts, (res) => {
          if (res.headers['set-cookie']) {
            const newCookies = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [res.headers['set-cookie']];
            for (const nc of newCookies) {
              const cookiePart = nc.split(';')[0];
              const name = cookiePart.split('=')[0];
              cookies = cookies.filter(c => !c.startsWith(name + '='));
              cookies.push(cookiePart);
            }
          }
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', reject);
        if (bodyPayload) req.write(bodyPayload);
        req.end();
      });
    }
  };
}

async function runTests() {
  console.log('=== STARTING COMPREHENSIVE GUEST CART VERIFICATION ===\n');

  // Fetch product for testing
  const pRes = await pool.query('SELECT id, name, price, stock FROM products WHERE is_enabled = true AND stock > 10 LIMIT 1');
  const product = pRes.rows[0];
  console.log(`Testing with product: ID=${product.id} "${product.name}"`);

  // Ensure test users exist with known passwords
  const hash = await bcrypt.hash('password123', 10);
  await pool.query('UPDATE users SET password = $1 WHERE id IN (1, 2)', [hash]);

  // Clean test user carts to test from a clean state
  await pool.query('DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id IN (1, 2))');

  // ---------------------------------------------------------
  // TEST 1: Regular User Login Flow (user id 2)
  // ---------------------------------------------------------
  console.log('\n--- TEST 1: Guest adds item -> Checkout -> Login as Regular User ---');
  const client1 = makeSessionClient();
  await client1.request({ path: '/' });
  await client1.request({ path: `/cart/add/${product.id}`, method: 'POST' }, { quantity: 2, selected_weight: '100gm' });
  
  const checkout1 = await client1.request({ path: '/orders/checkout' });
  console.log('1. Checkout redirected to:', checkout1.headers.location);

  const login1 = await client1.request({
    path: '/auth/login',
    method: 'POST'
  }, {
    login_id: 'tester@test.com',
    password: 'password123'
  });
  console.log('2. Login response status:', login1.statusCode, 'redirected to:', login1.headers.location);

  const checkoutAfterLogin1 = await client1.request({ path: login1.headers.location });
  const hasItemInCheckout1 = checkoutAfterLogin1.body.includes(product.name);
  console.log('3. Landed on:', login1.headers.location, 'Status:', checkoutAfterLogin1.statusCode, 'Has item:', hasItemInCheckout1);

  const cartAfterLogin1 = await client1.request({ path: '/cart' });
  const hasItemInCart1 = cartAfterLogin1.body.includes(product.name);
  console.log('4. Cart page has item:', hasItemInCart1);

  if (!hasItemInCheckout1 || !hasItemInCart1) {
    throw new Error('TEST 1 FAILED: Regular user cart was empty after login!');
  }
  console.log('✅ TEST 1 PASSED: Regular user retains guest items at checkout and cart.');

  // ---------------------------------------------------------
  // TEST 2: Admin User Login Flow (user id 1)
  // ---------------------------------------------------------
  console.log('\n--- TEST 2: Guest adds item -> Checkout -> Login as Admin User ---');
  const client2 = makeSessionClient();
  await client2.request({ path: '/' });
  await client2.request({ path: `/cart/add/${product.id}`, method: 'POST' }, { quantity: 3, selected_weight: '100gm' });

  const checkout2 = await client2.request({ path: '/orders/checkout' });
  console.log('1. Checkout redirected to:', checkout2.headers.location);

  const login2 = await client2.request({
    path: '/auth/login',
    method: 'POST'
  }, {
    login_id: 'chnishith051@gmail.com',
    password: 'password123'
  });
  console.log('2. Admin Login status:', login2.statusCode, 'redirected to:', login2.headers.location);

  const checkoutAfterLogin2 = await client2.request({ path: login2.headers.location });
  const hasItemInCheckout2 = checkoutAfterLogin2.body.includes(product.name);
  console.log('3. Admin Landed on checkout, Status:', checkoutAfterLogin2.statusCode, 'Has item:', hasItemInCheckout2);

  const cartAfterLogin2 = await client2.request({ path: '/cart' });
  const hasItemInCart2 = cartAfterLogin2.body.includes(product.name);
  console.log('4. Admin Cart page has item:', hasItemInCart2);

  if (!hasItemInCheckout2 || !hasItemInCart2) {
    throw new Error('TEST 2 FAILED: Admin user cart was empty after login!');
  }
  console.log('✅ TEST 2 PASSED: Admin user preserves guest items and reaches checkout.');

  // ---------------------------------------------------------
  // TEST 3: New User Registration Flow
  // ---------------------------------------------------------
  console.log('\n--- TEST 3: Guest adds item -> Checkout -> Register New User ---');
  const client3 = makeSessionClient();
  await client3.request({ path: '/' });
  await client3.request({ path: `/cart/add/${product.id}`, method: 'POST' }, { quantity: 1, selected_weight: '100gm' });

  const checkout3 = await client3.request({ path: '/orders/checkout' });
  console.log('1. Checkout redirected to:', checkout3.headers.location);

  const randomPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);
  const regRes = await client3.request({
    path: '/auth/register',
    method: 'POST'
  }, {
    full_name: 'Test Guest Merge',
    phone: randomPhone,
    password: 'Password123!',
    confirm_password: 'Password123!'
  });
  console.log('2. Register status:', regRes.statusCode, 'redirected to:', regRes.headers.location);

  const checkoutAfterReg = await client3.request({ path: regRes.headers.location });
  const hasItemInRegCheckout = checkoutAfterReg.body.includes(product.name);
  console.log('3. Register landed on:', regRes.headers.location, 'Has item:', hasItemInRegCheckout);

  if (!hasItemInRegCheckout) {
    throw new Error('TEST 3 FAILED: Registered user cart was empty!');
  }
  console.log('✅ TEST 3 PASSED: Registered user retains guest items.');

  // ---------------------------------------------------------
  // TEST 4: LocalStorage Sync Backup Recovery
  // ---------------------------------------------------------
  console.log('\n--- TEST 4: Client Backup Sync (/cart/sync-guest) ---');
  const client4 = makeSessionClient();
  await client4.request({ path: '/' });

  // Simulate client-side localStorage recovery
  const syncRes = await client4.request({
    path: '/cart/sync-guest',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({
    items: [{ product_id: product.id, quantity: 4, selected_weight: null }]
  }));

  const syncData = JSON.parse(syncRes.body);
  console.log('1. Sync guest response:', syncData);

  const cartAfterSync = await client4.request({ path: '/cart' });
  const hasItemInCartSync = cartAfterSync.body.includes(product.name);
  console.log('2. Cart page has synced item:', hasItemInCartSync);

  if (!hasItemInCartSync) {
    throw new Error('TEST 4 FAILED: Backup sync did not restore cart!');
  }
  console.log('✅ TEST 4 PASSED: Client backup sync successfully restored guest cart.');

  console.log('\n======================================================');
  console.log('🎉 ALL 4 GUEST CART & CHECKOUT LOGIN TESTS PASSED 100%!');
  console.log('======================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
