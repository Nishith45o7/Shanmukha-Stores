const express = require("express");
const pool = require("../config/db");
const { normalizeCouponCode, validateCouponForUser } = require("../utils/couponService");
const { getProductWeightOptions, normalizeWeightLabel, parseWeightToKg } = require("../utils/weightUtils");
const { getGuestCartItems, mergeGuestCart, saveSession } = require("../utils/cartService");

const router = express.Router();

const wantsJson = (req) => {
  const accept = req.get("accept") || "";
  return req.xhr || accept.includes("application/json");
};

// ============================================================
// GET USER OR GUEST CART
// ============================================================
router.get("/", async (req, res, next) => {
  try {
    let processedItems = [];
    const userId = req.session.user ? req.session.user.id : null;

    if (!req.session.user) {
      // Guest cart session handler
      processedItems = await getGuestCartItems(req, pool);

      if (processedItems.length === 0) {
        req.session.appliedCouponCode = null;
        return res.render("cart", {
          title: "My Cart",
          cartItems: [],
          originalSubtotal: 0,
          subtotal: 0,
          offerDiscount: 0,
          couponDiscount: 0,
          appliedCoupon: null,
          couponError: null,
          total: 0,
          error: req.query.error || null,
          success: req.query.success || null,
        });
      }
    } else {
      // Logged-in user database cart
      const cartResult = await pool.query(
        "SELECT * FROM carts WHERE user_id = $1",
        [userId]
      );

      if (cartResult.rows.length === 0) {
        req.session.appliedCouponCode = null;
        return res.render("cart", {
          title: "My Cart",
          cartItems: [],
          total: 0,
          originalSubtotal: 0,
          subtotal: 0,
          offerDiscount: 0,
          couponDiscount: 0,
          appliedCoupon: null,
          couponError: null,
          error: req.query.error || null,
          success: req.query.success || null,
        });
      }

      const cart = cartResult.rows[0];

      const items = await pool.query(
        `SELECT 
            ci.id,
            ci.quantity,
            ci.selected_weight,
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
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
         WHERE ci.cart_id = $1
           AND COALESCE(p.is_enabled, true) = true
         ORDER BY ci.id ASC`,
        [cart.id]
      );

      processedItems = items.rows.map(item => {
        let multiplier = 1;
        if (item.price_type === 'kg' && item.selected_weight) {
          multiplier = parseWeightToKg(item.selected_weight) || 1;
        }

        const originalPrice = Number(item.original_price) * multiplier;
        const currentPrice = Number(item.base_price) * multiplier;
        return {
          ...item,
          originalPrice,
          price: currentPrice,
          originalSubtotal: originalPrice * item.quantity,
          subtotal: currentPrice * item.quantity
        };
      });
    }

    const originalSubtotal = processedItems.reduce((sum, item) => sum + Number(item.originalSubtotal), 0);
    const subtotal = processedItems.reduce((sum, item) => sum + Number(item.subtotal), 0);
    const offerDiscount = Math.max(originalSubtotal - subtotal, 0);

    const couponCode = normalizeCouponCode(req.session.appliedCouponCode);
    let appliedCoupon = null;
    let couponDiscount = 0;
    let couponError = null;
    const couponValidationItems = processedItems.map((item) => ({
      product_id: item.product_id,
      category_id: item.category_id,
      subtotal: Number(item.subtotal || 0),
      quantity: Number(item.quantity || 0),
      price: Number(item.price || 0)
    }));

    if (couponCode) {
      const couponState = await validateCouponForUser({
        client: pool,
        code: couponCode,
        subtotal,
        userId,
        cartItems: couponValidationItems
      });
      if (couponState.ok) {
        appliedCoupon = couponState.coupon;
        couponDiscount = couponState.discount;
      } else {
        req.session.appliedCouponCode = null;
        couponError = couponState.error;
      }
    }
    const total = Math.max(subtotal - couponDiscount, 0);

    res.render("cart", {
      title: "My Cart",
      cartItems: processedItems,
      originalSubtotal,
      subtotal,
      offerDiscount,
      couponDiscount,
      appliedCoupon,
      couponError,
      total,
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (err) {
    console.error("Cart GET error:", err);
    next(err);
  }
});

// ============================================================
// POST ADD TO CART (with guest cart & stock validation)
// ============================================================
router.post("/add/:productId", async (req, res) => {
  try {
    const productId = req.params.productId;
    const body = req.body || {};
    const quantity = parseInt(body.quantity, 10) || 1;
    const couponCode = (body.coupon_code || "").trim().toUpperCase();

    // Check product exists and has stock
    const productResult = await pool.query(
      "SELECT id, name, stock, price_type, available_weights FROM products WHERE id = $1 AND COALESCE(is_enabled, true) = true",
      [productId]
    );

    if (productResult.rows.length === 0) {
      if (wantsJson(req)) return res.status(404).json({ ok: false, error: "Product not found" });
      return res.redirect("/products?error=Product not found");
    }

    const product = productResult.rows[0];

    if (product.stock <= 0) {
      if (wantsJson(req)) return res.status(400).json({ ok: false, error: "This product is out of stock" });
      return res.redirect(`/products/${productId}?error=This product is out of stock`);
    }

    let selectedWeight = null;
    if (product.price_type === "kg") {
      const weightOptions = getProductWeightOptions(product);
      const requestedWeight = normalizeWeightLabel(body.selected_weight);
      selectedWeight = requestedWeight || (weightOptions[0] || null);

      if (!selectedWeight || !weightOptions.includes(selectedWeight)) {
        if (wantsJson(req)) return res.status(400).json({ ok: false, error: "Please select a valid weight option" });
        return res.redirect(`/products/${productId}?error=Please select a valid weight option`);
      }
    }

    let newCartCount = 0;

    if (!req.session.user) {
      // Guest cart session handler
      req.session.guestCart = req.session.guestCart || [];
      const guestCart = req.session.guestCart;

      const existingIndex = guestCart.findIndex(
        item => Number(item.product_id) === Number(product.id) &&
          (String(item.selected_weight || '') === String(selectedWeight || ''))
      );

      if (existingIndex > -1) {
        const newQty = (Number(guestCart[existingIndex].quantity) || 0) + quantity;
        if (newQty > product.stock) {
          if (wantsJson(req)) return res.status(400).json({ ok: false, error: `Only ${product.stock} units available for "${product.name}"` });
          return res.redirect(`/cart?error=Only ${product.stock} units available for "${product.name}"`);
        }
        guestCart[existingIndex].quantity = newQty;
      } else {
        if (quantity > product.stock) {
          if (wantsJson(req)) return res.status(400).json({ ok: false, error: `Only ${product.stock} units available` });
          return res.redirect(`/products/${productId}?error=Only ${product.stock} units available`);
        }
        guestCart.push({
          id: `g_${product.id}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          product_id: product.id,
          quantity,
          selected_weight: selectedWeight || null,
        });
      }

      newCartCount = guestCart.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
    } else {
      // Logged-in user database cart handler
      const userId = req.session.user.id;
      let cartResult = await pool.query("SELECT * FROM carts WHERE user_id = $1", [userId]);
      let cart;

      if (cartResult.rows.length === 0) {
        const newCart = await pool.query(
          "INSERT INTO carts (user_id) VALUES ($1) RETURNING *",
          [userId]
        );
        cart = newCart.rows[0];
      } else {
        cart = cartResult.rows[0];
      }

      const itemCheck = await pool.query(
        "SELECT * FROM cart_items WHERE cart_id = $1 AND product_id = $2 AND (selected_weight = $3 OR (selected_weight IS NULL AND $3 IS NULL))",
        [cart.id, productId, selectedWeight || null]
      );

      if (itemCheck.rows.length > 0) {
        const newQuantity = itemCheck.rows[0].quantity + quantity;

        if (newQuantity > product.stock) {
          if (wantsJson(req)) return res.status(400).json({ ok: false, error: `Only ${product.stock} units available for "${product.name}"` });
          return res.redirect(`/cart?error=Only ${product.stock} units available for "${product.name}"`);
        }

        await pool.query(
          "UPDATE cart_items SET quantity = $1 WHERE id = $2",
          [newQuantity, itemCheck.rows[0].id]
        );
      } else {
        if (quantity > product.stock) {
          if (wantsJson(req)) return res.status(400).json({ ok: false, error: `Only ${product.stock} units available` });
          return res.redirect(`/products/${productId}?error=Only ${product.stock} units available`);
        }

        await pool.query(
          "INSERT INTO cart_items (cart_id, product_id, quantity, selected_weight) VALUES ($1, $2, $3, $4)",
          [cart.id, productId, quantity, selectedWeight || null]
        );
      }

      const countRes = await pool.query(
        "SELECT COALESCE(SUM(quantity), 0) AS total_items FROM cart_items WHERE cart_id = $1",
        [cart.id]
      );
      newCartCount = parseInt(countRes.rows[0].total_items) || 0;
    }

    if (couponCode) {
      req.session.appliedCouponCode = couponCode;
    }

    // Explicitly guarantee session write to PostgreSQL
    await saveSession(req);

    if (wantsJson(req)) {
      return res.json({
        ok: true,
        message: `${product.name} added to cart!`,
        cartCount: newCartCount,
        product: { id: product.id, name: product.name }
      });
    }

    res.redirect("/cart?success=Item added to cart");
  } catch (err) {
    console.error("Add to cart error:", err);
    if (wantsJson(req)) {
      return res.status(500).json({ ok: false, error: "Failed to add item to cart" });
    }
    res.redirect("/cart?error=Failed to add item to cart");
  }
});

// ============================================================
// POST REMOVE ITEM FROM CART (user or guest)
// ============================================================
router.post("/remove/:itemId", async (req, res) => {
  try {
    const itemId = req.params.itemId;

    if (!req.session.user) {
      if (req.session.guestCart && Array.isArray(req.session.guestCart)) {
        req.session.guestCart = req.session.guestCart.filter(item => String(item.id) !== String(itemId));
        await saveSession(req);
      }
      if (wantsJson(req)) {
        return res.json({ ok: true, removed: true });
      }
      return res.redirect("/cart?success=Item removed");
    }

    // Ensure user owns the cart item
    await pool.query(
      `DELETE FROM cart_items ci
       USING carts c
       WHERE ci.id = $1 AND ci.cart_id = c.id AND c.user_id = $2`,
      [itemId, req.session.user.id]
    );
    if (wantsJson(req)) {
      return res.json({ ok: true, removed: true });
    }
    res.redirect("/cart?success=Item removed");
  } catch (err) {
    console.error("Remove cart item error:", err);
    if (wantsJson(req)) {
      return res.status(500).json({ ok: false, message: "Failed to remove item" });
    }
    res.redirect("/cart?error=Failed to remove item");
  }
});

// ============================================================
// POST APPLY COUPON (user or guest)
// ============================================================
router.post("/coupon/apply", async (req, res) => {
  try {
    const code = normalizeCouponCode(req.body.coupon_code);
    if (!code) {
      return res.redirect("/cart?error=Please enter a coupon code");
    }
    req.session.appliedCouponCode = code;
    return res.redirect("/cart?success=Coupon applied");
  } catch (err) {
    console.error("Apply coupon error:", err);
    return res.redirect("/cart?error=Failed to apply coupon");
  }
});

// ============================================================
// POST REMOVE COUPON (user or guest)
// ============================================================
router.post("/coupon/remove", async (req, res) => {
  req.session.appliedCouponCode = null;
  return res.redirect("/cart?success=Coupon removed");
});

// ============================================================
// POST UPDATE QUANTITY (user or guest, with stock validation)
// ============================================================
router.post("/update/:itemId", async (req, res) => {
  try {
    const itemId = req.params.itemId;
    const quantity = parseInt(req.body.quantity, 10);

    if (Number.isNaN(quantity)) {
      if (wantsJson(req)) {
        return res.status(400).json({ ok: false, message: "Invalid quantity" });
      }
      return res.redirect("/cart?error=Invalid quantity");
    }

    if (!req.session.user) {
      req.session.guestCart = req.session.guestCart || [];
      const itemIndex = req.session.guestCart.findIndex(item => String(item.id) === String(itemId));

      if (itemIndex === -1) {
        if (wantsJson(req)) return res.status(404).json({ ok: false, message: "Item not found" });
        return res.redirect("/cart?error=Item not found");
      }

      if (quantity < 1) {
        req.session.guestCart.splice(itemIndex, 1);
        await saveSession(req);
        if (wantsJson(req)) return res.json({ ok: true, removed: true });
        return res.redirect("/cart?success=Item removed from cart");
      }

      const item = req.session.guestCart[itemIndex];
      const pRes = await pool.query(
        "SELECT id, name, stock FROM products WHERE id = $1 AND COALESCE(is_enabled, true) = true",
        [item.product_id]
      );
      if (pRes.rows.length === 0) {
        req.session.guestCart.splice(itemIndex, 1);
        await saveSession(req);
        if (wantsJson(req)) return res.status(404).json({ ok: false, message: "Product no longer available" });
        return res.redirect("/cart?error=Product no longer available");
      }

      const product = pRes.rows[0];
      if (quantity > product.stock) {
        if (wantsJson(req)) {
          return res.status(400).json({
            ok: false,
            message: `Only ${product.stock} units available for "${product.name}"`,
            stock: product.stock
          });
        }
        return res.redirect(`/cart?error=Only ${product.stock} units available for "${product.name}"`);
      }

      item.quantity = quantity;
      await saveSession(req);
      if (wantsJson(req)) return res.json({ ok: true, quantity });
      return res.redirect("/cart");
    }

    // Logged-in user database cart
    if (quantity < 1) {
      await pool.query(
        `DELETE FROM cart_items ci
         USING carts c
         WHERE ci.id = $1 AND ci.cart_id = c.id AND c.user_id = $2`,
        [itemId, req.session.user.id]
      );
      if (wantsJson(req)) {
        return res.json({ ok: true, removed: true });
      }
      return res.redirect("/cart?success=Item removed from cart");
    }

    const result = await pool.query(
      `SELECT ci.*, p.stock, p.name
       FROM cart_items ci
       JOIN carts c ON c.id = ci.cart_id
       JOIN products p ON p.id = ci.product_id
       WHERE ci.id = $1 AND c.user_id = $2 AND COALESCE(p.is_enabled, true) = true`,
      [itemId, req.session.user.id]
    );

    if (result.rows.length === 0) {
      if (wantsJson(req)) {
        return res.status(404).json({ ok: false, message: "Item not found" });
      }
      return res.redirect("/cart?error=Item not found");
    }

    const item = result.rows[0];

    if (quantity > item.stock) {
      if (wantsJson(req)) {
        return res.status(400).json({
          ok: false,
          message: `Only ${item.stock} units available for "${item.name}"`,
          stock: item.stock
        });
      }
      return res.redirect(`/cart?error=Only ${item.stock} units available for "${item.name}"`);
    }

    await pool.query("UPDATE cart_items SET quantity = $1 WHERE id = $2", [quantity, itemId]);
    if (wantsJson(req)) {
      return res.json({ ok: true, quantity });
    }

    res.redirect("/cart");
  } catch (err) {
    console.error("Update cart error:", err);
    if (wantsJson(req)) {
      return res.status(500).json({ ok: false, message: "Failed to update quantity" });
    }
    res.redirect("/cart?error=Failed to update quantity");
  }
});

// ============================================================
// POST CLEAR CART (user or guest)
// ============================================================
router.post("/clear", async (req, res) => {
  try {
    if (!req.session.user) {
      req.session.guestCart = [];
      req.session.appliedCouponCode = null;
      await saveSession(req);
      return res.redirect("/cart");
    }

    const cartResult = await pool.query(
      "SELECT id FROM carts WHERE user_id = $1",
      [req.session.user.id]
    );
    if (cartResult.rows.length > 0) {
      await pool.query("DELETE FROM cart_items WHERE cart_id = $1", [cartResult.rows[0].id]);
    }
    req.session.appliedCouponCode = null;
    res.redirect("/cart");
  } catch (err) {
    console.error("Clear cart error:", err);
    res.redirect("/cart?error=Failed to clear cart");
  }
});

// ============================================================
// POST SYNC GUEST CART (from client localStorage backup)
// ============================================================
router.post("/sync-guest", async (req, res) => {
  try {
    let rawItems = req.body.items;
    if (typeof rawItems === 'string') {
      try { rawItems = JSON.parse(rawItems); } catch (e) { rawItems = []; }
    }
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return res.json({ ok: true, count: 0 });
    }

    if (req.session && req.session.user) {
      // User is logged in: merge directly into DB cart
      await mergeGuestCart(req, req.session.user.id, pool, rawItems);
      const countRes = await pool.query(
        `SELECT COALESCE(SUM(ci.quantity), 0) AS count
         FROM carts c
         JOIN cart_items ci ON ci.cart_id = c.id
         WHERE c.user_id = $1`,
        [req.session.user.id]
      );
      return res.json({ ok: true, count: parseInt(countRes.rows[0]?.count || 0) });
    } else {
      // Guest: merge into session guestCart
      req.session.guestCart = req.session.guestCart || [];
      for (const item of rawItems) {
        const pId = Number(item.product_id);
        const qty = Number(item.quantity) || 1;
        const weight = item.selected_weight || null;
        if (!pId || qty <= 0) continue;

        const existingIdx = req.session.guestCart.findIndex(
          i => Number(i.product_id) === pId && (String(i.selected_weight || '') === String(weight || ''))
        );
        if (existingIdx > -1) {
          req.session.guestCart[existingIdx].quantity = Math.max(Number(req.session.guestCart[existingIdx].quantity) || 1, qty);
        } else {
          req.session.guestCart.push({
            id: item.id || `g_${pId}_${Date.now()}`,
            product_id: pId,
            quantity: qty,
            selected_weight: weight
          });
        }
      }
      await saveSession(req);
      const count = req.session.guestCart.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
      return res.json({ ok: true, count });
    }
  } catch (err) {
    console.error("Sync guest cart error:", err);
    return res.status(500).json({ ok: false, message: "Sync failed" });
  }
});

module.exports = router;
