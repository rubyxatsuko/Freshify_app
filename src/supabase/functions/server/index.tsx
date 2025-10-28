import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createClient } from "@supabase/supabase-js";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// Create Supabase client
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Enable logger
app.use("*", logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  })
);

// Helper to verify user
async function verifyUser(authHeader: string | null) {
  if (!authHeader) return null;

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    console.log("Auth error:", error);
    return null;
  }

  return user;
}

// Health check endpoint
app.get("/make-server-e56751be/health", (c) => {
  return c.json({ status: "ok" });
});

// ============ AUTH ROUTES ============

app.post("/make-server-e56751be/auth/signup", async (c) => {
  try {
    const { email, password, name } = await c.req.json();

    // Create user with Supabase Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      // Automatically confirm the user's email since an email server hasn't been configured
      email_confirm: true,
    });

    if (error) {
      console.error("Signup error:", error);
      return c.json({ error: error.message }, 400);
    }

    // Store user profile in KV store with role
    // Set admin role for admin@gmail.com
    const role = email === "admin@gmail.com" ? "admin" : "user";

    await kv.set(`user:${data.user.id}`, {
      id: data.user.id,
      email,
      name,
      role,
      created_at: new Date().toISOString(),
    });

    return c.json({
      user: {
        id: data.user.id,
        email,
        name,
      },
    });
  } catch (error: any) {
    console.error("Signup error:", error);
    return c.json({ error: error.message }, 500);
  }
});

app.get("/make-server-e56751be/auth/user", async (c) => {
  const user = await verifyUser(c.req.header("Authorization"));

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get user profile from KV store
  const profile = await kv.get(`user:${user.id}`);

  if (!profile) {
    // Fallback: create profile from user metadata
    const role = user.email === "admin@gmail.com" ? "admin" : "user";
    const profileData = {
      id: user.id,
      email: user.email!,
      name: user.user_metadata?.name || user.email!.split("@")[0],
      role,
      created_at: new Date().toISOString(),
    };
    await kv.set(`user:${user.id}`, profileData);
    return c.json(profileData);
  }

  return c.json(profile);
});

// ============ CART ROUTES ============

app.get("/make-server-e56751be/cart", async (c) => {
  const user = await verifyUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const cart = (await kv.get(`cart:${user.id}`)) || [];
  return c.json(cart);
});

app.post("/make-server-e56751be/cart/add", async (c) => {
  const user = await verifyUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const { productId, quantity = 1 } = await c.req.json();

    const cart = (await kv.get(`cart:${user.id}`)) || [];

    // Check if item exists
    const existingIndex = cart.findIndex(
      (item: any) => item.product_id === productId
    );

    if (existingIndex >= 0) {
      cart[existingIndex].quantity += quantity;
    } else {
      cart.push({ product_id: productId, quantity });
    }

    await kv.set(`cart:${user.id}`, cart);

    return c.json({ success: true });
  } catch (error: any) {
    console.error("Add to cart error:", error);
    return c.json({ error: error.message }, 500);
  }
});

app.put("/make-server-e56751be/cart/update", async (c) => {
  const user = await verifyUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const { productId, quantity } = await c.req.json();

    let cart = (await kv.get(`cart:${user.id}`)) || [];

    if (quantity < 1) {
      // Remove item
      cart = cart.filter((item: any) => item.product_id !== productId);
    } else {
      // Update quantity
      const itemIndex = cart.findIndex(
        (item: any) => item.product_id === productId
      );
      if (itemIndex >= 0) {
        cart[itemIndex].quantity = quantity;
      }
    }

    await kv.set(`cart:${user.id}`, cart);

    return c.json({ success: true });
  } catch (error: any) {
    console.error("Update cart error:", error);
    return c.json({ error: error.message }, 500);
  }
});

app.delete("/make-server-e56751be/cart/remove", async (c) => {
  const user = await verifyUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const { productId } = await c.req.json();

    let cart = (await kv.get(`cart:${user.id}`)) || [];
    cart = cart.filter((item: any) => item.product_id !== productId);

    await kv.set(`cart:${user.id}`, cart);

    return c.json({ success: true });
  } catch (error: any) {
    console.error("Remove from cart error:", error);
    return c.json({ error: error.message }, 500);
  }
});

app.delete("/make-server-e56751be/cart/clear", async (c) => {
  const user = await verifyUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  await kv.set(`cart:${user.id}`, []);
  return c.json({ success: true });
});

// ============ ORDER ROUTES ============

app.post("/make-server-e56751be/orders", async (c) => {
  const user = await verifyUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const { items, total } = await c.req.json();

    const orderId = crypto.randomUUID();
    const order = {
      id: orderId,
      user_id: user.id,
      items,
      total,
      status: "processing",
      created_at: new Date().toISOString(),
    };

    // Save order
    await kv.set(`order:${orderId}`, order);

    // Add to user's order list
    const userOrders = (await kv.get(`user_orders:${user.id}`)) || [];
    userOrders.unshift(orderId);
    await kv.set(`user_orders:${user.id}`, userOrders);

    // Clear cart
    await kv.set(`cart:${user.id}`, []);

    // Log consumption
    const totalCalories = items.reduce((sum: number, item: any) => {
      return sum + item.calories * item.quantity;
    }, 0);

    const itemNames = items.map((item: any) => item.product_name);

    await logConsumption(user.id, totalCalories, itemNames);

    return c.json(order);
  } catch (error: any) {
    console.error("Create order error:", error);
    return c.json({ error: error.message }, 500);
  }
});

app.get("/make-server-e56751be/orders", async (c) => {
  const user = await verifyUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const orderIds = (await kv.get(`user_orders:${user.id}`)) || [];

    const orders = [];
    for (const orderId of orderIds) {
      const order = await kv.get(`order:${orderId}`);
      if (order) {
        orders.push(order);
      }
    }

    return c.json(orders);
  } catch (error: any) {
    console.error("Get orders error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============ CONSUMPTION TRACKING ============

async function logConsumption(
  userId: string,
  calories: number,
  items: string[]
) {
  const today = new Date().toISOString().split("T")[0];
  const key = `consumption:${userId}:${today}`;

  const existing = await kv.get(key);

  if (existing) {
    await kv.set(key, {
      date: today,
      calories: existing.calories + calories,
      items: [...existing.items, ...items],
    });
  } else {
    await kv.set(key, {
      date: today,
      calories,
      items,
    });
  }
}

app.get("/make-server-e56751be/consumption/weekly", async (c) => {
  const user = await verifyUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const today = new Date();
    const weeklyData = Array(7).fill(0);

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - (6 - i));
      const dateStr = date.toISOString().split("T")[0];

      const data = await kv.get(`consumption:${user.id}:${dateStr}`);
      if (data) {
        weeklyData[i] = data.calories;
      }
    }

    return c.json(weeklyData);
  } catch (error: any) {
    console.error("Get weekly consumption error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============ ADMIN ROUTES ============

// Update user role (for setting up admin)
app.post("/make-server-e56751be/admin/update-role", async (c) => {
  const user = await verifyUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const { email, role } = await c.req.json();

    // Get current user profile to check if they're admin
    const currentProfile = await kv.get(`user:${user.id}`);

    // Allow if current user is admin OR if they're setting their own role to admin (for initial setup)
    if (currentProfile?.role !== "admin" && user.email !== email) {
      return c.json({ error: "Only admins can update roles" }, 403);
    }

    // Find user by email
    const allKeys = await kv.getByPrefix("user:");
    const targetUser = allKeys.find((u: any) => u.email === email);

    if (!targetUser) {
      return c.json({ error: "User not found" }, 404);
    }

    // Update role
    await kv.set(`user:${targetUser.id}`, {
      ...targetUser,
      role,
    });

    console.log(`Role updated for ${email} to ${role}`);

    return c.json({
      success: true,
      message: `Role updated to ${role} for ${email}`,
    });
  } catch (error: any) {
    console.error("Update role error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Get all users (admin only)
app.get("/make-server-e56751be/admin/users", async (c) => {
  const user = await verifyUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const profile = await kv.get(`user:${user.id}`);

    if (profile?.role !== "admin") {
      return c.json({ error: "Admin access required" }, 403);
    }

    const users = await kv.getByPrefix("user:");

    return c.json(users);
  } catch (error: any) {
    console.error("Get users error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============ SCAN HISTORY ============

app.post("/make-server-e56751be/scan", async (c) => {
  const user = await verifyUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const { productId, barcode } = await c.req.json();

    const scanId = crypto.randomUUID();
    const scan = {
      id: scanId,
      user_id: user.id,
      product_id: productId,
      barcode,
      scanned_at: new Date().toISOString(),
    };

    await kv.set(`scan:${scanId}`, scan);

    // Add to user's scan history (keep last 20)
    const scanHistory = (await kv.get(`scan_history:${user.id}`)) || [];
    scanHistory.unshift(scanId);
    if (scanHistory.length > 20) {
      scanHistory.pop();
    }
    await kv.set(`scan_history:${user.id}`, scanHistory);

    return c.json({ success: true });
  } catch (error: any) {
    console.error("Log scan error:", error);
    return c.json({ error: error.message }, 500);
  }
});

app.get("/make-server-e56751be/scan/history", async (c) => {
  const user = await verifyUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const scanIds = (await kv.get(`scan_history:${user.id}`)) || [];

    const scans = [];
    for (const scanId of scanIds.slice(0, 10)) {
      const scan = await kv.get(`scan:${scanId}`);
      if (scan) {
        scans.push(scan);
      }
    }

    return c.json(scans);
  } catch (error: any) {
    console.error("Get scan history error:", error);
    return c.json({ error: error.message }, 500);
  }
});

Deno.serve(app.fetch);
