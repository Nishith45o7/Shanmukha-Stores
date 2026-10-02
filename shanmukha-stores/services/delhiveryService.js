const https = require('https');
const pool = require('../config/db');
const { parseWeightToKg } = require('../utils/weightUtils');

const DEFAULT_TOKEN = 'db87a430be6265eaa629935fac6fcb454306e3da';
const DEFAULT_WAREHOUSE = 'Shanmukha_Stores_Vijayawada';
const BASE_HOST = 'track.delhivery.com';

/**
 * Retrieve active Delhivery configuration from store_settings or environment
 */
async function getDelhiveryConfig() {
  try {
    const res = await pool.query(
      "SELECT setting_key, setting_value FROM store_settings WHERE setting_key IN ('delhivery_api_token', 'delhivery_warehouse_name', 'delhivery_enabled')"
    );
    const map = {};
    res.rows.forEach(r => map[r.setting_key] = r.setting_value);
    return {
      token: map.delhivery_api_token || process.env.DELHIVERY_API_TOKEN || DEFAULT_TOKEN,
      warehouse: map.delhivery_warehouse_name || process.env.DELHIVERY_WAREHOUSE_NAME || DEFAULT_WAREHOUSE,
      enabled: map.delhivery_enabled !== 'false'
    };
  } catch (e) {
    return {
      token: process.env.DELHIVERY_API_TOKEN || DEFAULT_TOKEN,
      warehouse: process.env.DELHIVERY_WAREHOUSE_NAME || DEFAULT_WAREHOUSE,
      enabled: true
    };
  }
}

/**
 * Helper to make HTTPS requests to Delhivery API
 */
function delhiveryApiRequest({ path, method = 'GET', data = null, headers = {}, token }) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'Authorization': `Token ${token}`,
      'Accept': 'application/json'
    };

    if (data && !headers['Content-Type']) {
      defaultHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const options = {
      hostname: BASE_HOST,
      path,
      method,
      headers: { ...defaultHeaders, ...headers }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed, raw: body });
        } catch (_e) {
          resolve({ status: res.statusCode, data: null, raw: body });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error('Delhivery API connection timed out'));
    });

    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

/**
 * Check serviceability for a customer pincode
 */
async function checkPincodeServiceability(pincode) {
  const config = await getDelhiveryConfig();
  const cleanPin = String(pincode).trim();
  const res = await delhiveryApiRequest({
    path: `/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(cleanPin)}`,
    method: 'GET',
    token: config.token
  });

  if (res.data && res.data.delivery_codes && res.data.delivery_codes.length > 0) {
    const info = res.data.delivery_codes[0].postal_code;
    return {
      serviceable: true,
      pin: info.pin,
      city: info.district || info.city,
      state: info.state_code,
      prepaid: info.pre_paid === 'Y',
      cod: info.cod === 'Y'
    };
  }
  return { serviceable: false, pin: cleanPin };
}

/**
 * Push an order directly to Delhivery One and generate an official AWB Tracking Number
 */
async function createShipmentForOrder(orderId) {
  const config = await getDelhiveryConfig();

  // 1. Fetch Order and User details
  const orderRes = await pool.query(`
    SELECT o.*, u.full_name AS user_name, u.phone AS user_phone, u.email AS user_email
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
    WHERE o.id = $1
  `, [orderId]);

  if (orderRes.rows.length === 0) {
    throw new Error('Order #' + orderId + ' not found');
  }
  const order = orderRes.rows[0];

  // 2. Fetch Order Items
  const itemsRes = await pool.query(`
    SELECT oi.*, p.name AS product_name
    FROM order_items oi
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = $1
  `, [orderId]);
  const items = itemsRes.rows;

  // 3. Calculate package weight in Grams
  let totalWeightKg = 0;
  items.forEach(item => {
    const qty = parseInt(item.quantity, 10) || 1;
    const unitKg = item.selected_weight ? parseWeightToKg(item.selected_weight) : 0.5;
    totalWeightKg += (unitKg || 0.5) * qty;
  });
  const weightGrams = Math.max(100, Math.round(totalWeightKg * 1000));

  // 4. Parse Address & Pincode
  const fullAddress = order.address || '';
  const pinMatch = fullAddress.match(/\b(\d{6})\b/) || (order.notes || '').match(/\b(\d{6})\b/);
  const pincode = pinMatch ? pinMatch[1] : '520001';
  const city = order.city || 'Vijayawada';
  const recipientName = order.user_name || 'Valued Customer';
  const recipientPhone = (order.user_phone || '8886383838').replace(/\D/g, '').slice(-10);

  // 5. Payment details
  const isCod = order.payment_method === 'cod' && String(order.payment_status).toLowerCase() !== 'paid';
  const codAmount = isCod ? Math.round(Number(order.total_amount)) : 0;
  const productDesc = items.map(i => `${i.product_name} (${i.selected_weight || '1 unit'}) x${i.quantity}`).join(', ').substring(0, 200);

  // 6. Build Delhivery CMU Payload
  const shipment = {
    name: recipientName,
    add: fullAddress.substring(0, 250),
    pin: pincode,
    city: city,
    state: 'Andhra Pradesh',
    country: 'India',
    phone: recipientPhone,
    order: String(order.id),
    payment_mode: isCod ? 'COD' : 'Prepaid',
    cod_amount: codAmount,
    total_amount: Math.round(Number(order.total_amount)),
    weight: weightGrams,
    quantity: items.reduce((sum, i) => sum + (parseInt(i.quantity, 10) || 1), 0),
    products_desc: productDesc,
    order_date: new Date(order.created_at).toISOString().slice(0, 19).replace('T', ' '),
    pickup_location: config.warehouse
  };

  const cmuPayload = {
    shipments: [shipment],
    pickup_location: {
      name: config.warehouse
    }
  };

  const formBody = `format=json&data=${encodeURIComponent(JSON.stringify(cmuPayload))}`;

  const res = await delhiveryApiRequest({
    path: '/api/cmu/create.json',
    method: 'POST',
    data: formBody,
    token: config.token
  });

  const data = res.data;
  if (!data) {
    throw new Error('Invalid response from Delhivery API');
  }

  if (data.packages && data.packages.length > 0) {
    const pkg = data.packages[0];
    if (pkg.status === 'Fail') {
      const errReason = (pkg.remarks && pkg.remarks.length) ? pkg.remarks.join(', ') : 'Failed to manifest shipment';
      throw new Error(`Delhivery rejected order #${orderId}: ${errReason}`);
    }

    const waybill = pkg.waybill;
    const sortCode = pkg.sort_code || '';

    // Update database with official AWB number and status
    await pool.query(`
      UPDATE orders
      SET 
        awb_number = $1,
        courier_name = 'Delhivery',
        delhivery_status = 'Manifested',
        status = CASE WHEN status = 'Cancelled' THEN status ELSE 'Shipped' END,
        delivery_note = COALESCE(delivery_note, '') || ' [Shipped via Delhivery AWB: ' || $1 || ']'
      WHERE id = $2
    `, [waybill, orderId]);

    return {
      success: true,
      waybill: waybill,
      sortCode: sortCode,
      pickupLocation: config.warehouse,
      raw: pkg
    };
  }

  if (data.rmk) {
    throw new Error('Delhivery response: ' + data.rmk);
  }

  throw new Error('Unable to create Delhivery shipment. Check warehouse and address details.');
}

/**
 * Fetch Official Printable Delhivery Packing Slip / Barcode Shipping Label
 */
async function getPackingSlip(waybill) {
  const config = await getDelhiveryConfig();
  const cleanWbn = String(waybill).trim();
  const res = await delhiveryApiRequest({
    path: `/api/p/packing_slip?wbns=${encodeURIComponent(cleanWbn)}`,
    method: 'GET',
    token: config.token
  });

  if (res.data && res.data.packages && res.data.packages.length > 0) {
    const pkg = res.data.packages[0];
    return {
      html: pkg.html || null,
      barcode: pkg.barcode || null,
      raw: pkg
    };
  }
  return { html: res.raw, raw: res.raw };
}

/**
 * Track an AWB live on Delhivery
 */
async function trackShipment(waybill) {
  const config = await getDelhiveryConfig();
  const cleanWbn = String(waybill).trim();
  const res = await delhiveryApiRequest({
    path: `/api/v1/packages/json/?waybill=${encodeURIComponent(cleanWbn)}`,
    method: 'GET',
    token: config.token
  });

  if (res.data && res.data.ShipmentData && res.data.ShipmentData.length > 0) {
    const shipment = res.data.ShipmentData[0].Shipment;
    return {
      success: true,
      waybill: shipment.AWB,
      status: shipment.Status ? shipment.Status.Status : 'Unknown',
      statusType: shipment.Status ? shipment.Status.StatusType : '',
      statusDateTime: shipment.Status ? shipment.Status.StatusDateTime : '',
      statusLocation: shipment.Status ? shipment.Status.StatusLocation : '',
      expectedDelivery: shipment.ExpectedDeliveryDate || null,
      origin: shipment.Origin,
      destination: shipment.Destination,
      scans: shipment.Scans || []
    };
  }

  return { success: false, error: 'Tracking data unavailable or newly created' };
}

module.exports = {
  getDelhiveryConfig,
  checkPincodeServiceability,
  createShipmentForOrder,
  getPackingSlip,
  trackShipment
};
