const pool = require("../config/db");
const { parseWeightToKg } = require("./weightUtils");

/**
 * Calculate total quantity of items in guest session cart
 */
const getGuestCartCount = (req) => {
  if (!req || !req.session || !Array.isArray(req.session.guestCart)) return 0;
  return req.session.guestCart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
};

/**
 * Fetch and process complete product details for guest cart items
 */
const getGuestCartItems = async (req, client = pool) => {
  if (!req || !req.session || !Array.isArray(req.session.guestCart) || req.session.guestCart.length === 0) {
    return [];
  }

  const rawItems = req.session.guestCart.filter(i => i && i.product_id && Number(i.quantity) > 0);
  if (rawItems.length === 0) return [];

  const productIds = [...new Set(rawItems.map(i => Number(i.product_id)).filter(id => Number.isInteger(id) && id > 0))];
  if (productIds.length === 0) return [];

  const productsRes = await client.query(
    `SELECT 
        p.id AS product_id,
        p.category_id,
        p.name,
        p.price AS original_price,
        CASE
          WHEN p.offer_active = true AND COALESCE(p.offer_percent, 0) > 0
          THEN ROUND((p.price * (1 - COALESCE(p.offer_percent, 0) / 100.0))::numeric, 2)
          ELSE p.price
        END AS base_price,
        p.image,
        p.stock,
        p.price_type,
        p.offer_active,
        p.offer_percent
     FROM products p
     WHERE p.id = ANY($1::int[])
       AND COALESCE(p.is_enabled, true) = true`,
    [productIds]
  );

  const productMap = new Map();
  for (const row of productsRes.rows) {
    productMap.set(Number(row.product_id), row);
  }

  const processed = [];
  for (const item of rawItems) {
    const product = productMap.get(Number(item.product_id));
    if (!product || product.stock <= 0) continue;

    let multiplier = 1;
    if (product.price_type === 'kg' && item.selected_weight) {
      multiplier = parseWeightToKg(item.selected_weight) || 1;
    }

    const originalPrice = Number(product.original_price) * multiplier;
    const currentPrice = Number(product.base_price) * multiplier;
    const quantity = Math.min(Number(item.quantity) || 1, product.stock);

    processed.push({
      id: item.id || `g_${product.product_id}_${item.selected_weight || 'default'}`,
      product_id: product.product_id,
      category_id: product.category_id,
      name: product.name,
      original_price: product.original_price,
      base_price: product.base_price,
      originalPrice,
      price: currentPrice,
      image: product.image,
      stock: product.stock,
      price_type: product.price_type,
      offer_active: product.offer_active,
      offer_percent: product.offer_percent,
      selected_weight: item.selected_weight || null,
      quantity,
      originalSubtotal: originalPrice * quantity,
      subtotal: currentPrice * quantity,
    });
  }

  return processed;
};

/**
 * Merge guest session cart into database cart when user signs in or registers
 */
const mergeGuestCart = async (req, userId, client = pool) => {
  if (!req || !req.session || !Array.isArray(req.session.guestCart) || req.session.guestCart.length === 0 || !userId) {
    return;
  }

  const guestItems = [...req.session.guestCart];
  if (guestItems.length === 0) return;

  try {
    // 1. Get or create user cart
    let cartResult = await client.query("SELECT id FROM carts WHERE user_id = $1", [userId]);
    let cartId;
    if (cartResult.rows.length === 0) {
      const newCart = await client.query("INSERT INTO carts (user_id) VALUES ($1) RETURNING id", [userId]);
      cartId = newCart.rows[0].id;
    } else {
      cartId = cartResult.rows[0].id;
    }

    // 2. Merge each guest item
    for (const item of guestItems) {
      const productId = Number(item.product_id);
      const qty = Number(item.quantity) || 1;
      const weight = item.selected_weight || null;

      if (!productId || qty <= 0) continue;

      // Verify product validity and stock
      const pRes = await client.query(
        "SELECT id, stock FROM products WHERE id = $1 AND COALESCE(is_enabled, true) = true",
        [productId]
      );
      if (pRes.rows.length === 0) continue;
      const product = pRes.rows[0];
      if (product.stock <= 0) continue;

      // Check if product already exists in user cart
      const existing = await client.query(
        `SELECT id, quantity 
         FROM cart_items 
         WHERE cart_id = $1 
           AND product_id = $2 
           AND (selected_weight = $3 OR (selected_weight IS NULL AND $3 IS NULL))`,
        [cartId, productId, weight]
      );

      if (existing.rows.length > 0) {
        const mergedQty = Math.min(product.stock, existing.rows[0].quantity + qty);
        await client.query("UPDATE cart_items SET quantity = $1 WHERE id = $2", [mergedQty, existing.rows[0].id]);
      } else {
        const initialQty = Math.min(product.stock, qty);
        await client.query(
          "INSERT INTO cart_items (cart_id, product_id, quantity, selected_weight) VALUES ($1, $2, $3, $4)",
          [cartId, productId, initialQty, weight]
        );
      }
    }

    // 3. Clear guest cart once merged
    req.session.guestCart = [];
  } catch (err) {
    console.error("CartService mergeGuestCart error:", err.message);
  }
};

module.exports = {
  getGuestCartCount,
  getGuestCartItems,
  mergeGuestCart,
};
