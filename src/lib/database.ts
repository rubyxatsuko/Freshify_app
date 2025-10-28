import { CartItem, Order, Product } from '../types';

/**
 * Simplified Database Layer using localStorage
 * 
 * This module provides a clean interface for data persistence
 * without the complexity of RLS policies and Supabase database errors.
 * 
 * Data Structure:
 * - cart_{userId}: User's shopping cart items
 * - orders_{userId}: User's order history
 * - consumption_{userId}: Weekly calorie consumption tracking
 * - consumption_reset_{userId}: Last weekly reset timestamp
 * - scans_{userId}: Barcode scan history
 */

// ==================== CONSTANTS ====================

const STORAGE_KEYS = {
  cart: (userId: string) => `freshify_cart_${userId}`,
  orders: (userId: string) => `freshify_orders_${userId}`,
  consumption: (userId: string) => `freshify_consumption_${userId}`,
  consumptionReset: (userId: string) => `freshify_consumption_reset_${userId}`,
  scans: (userId: string) => `freshify_scans_${userId}`,
} as const;

const MAX_SCAN_HISTORY = 50;
const DAYS_IN_WEEK = 7;

// ==================== CART OPERATIONS ====================

/**
 * Get user's cart items
 */
export async function getCart(userId: string): Promise<CartItem[]> {
  try {
    const key = STORAGE_KEYS.cart(userId);
    const stored = localStorage.getItem(key);
    
    if (!stored) return [];
    
    return JSON.parse(stored);
  } catch (error) {
    console.error('Error fetching cart:', error);
    return [];
  }
}

/**
 * Add product to cart or increase quantity if already exists
 */
export async function addToCart(
  userId: string, 
  productId: string, 
  quantity: number = 1
): Promise<void> {
  try {
    const cart = await getCart(userId);
    const { products } = await import('../data/products');
    const product = products.find(p => p.id === productId);
    
    if (!product) {
      throw new Error(`Product with ID ${productId} not found`);
    }
    
    const existingItemIndex = cart.findIndex(item => item.product.id === productId);
    
    if (existingItemIndex >= 0) {
      // Update existing item quantity
      cart[existingItemIndex].quantity += quantity;
    } else {
      // Add new item to cart
      cart.push({ product, quantity });
    }
    
    const key = STORAGE_KEYS.cart(userId);
    localStorage.setItem(key, JSON.stringify(cart));
  } catch (error) {
    console.error('Error adding to cart:', error);
    throw error;
  }
}

/**
 * Update cart item quantity
 */
export async function updateCartQuantity(
  userId: string, 
  productId: string, 
  quantity: number
): Promise<void> {
  try {
    if (quantity <= 0) {
      await removeFromCart(userId, productId);
      return;
    }
    
    const cart = await getCart(userId);
    const itemIndex = cart.findIndex(item => item.product.id === productId);
    
    if (itemIndex >= 0) {
      cart[itemIndex].quantity = quantity;
      const key = STORAGE_KEYS.cart(userId);
      localStorage.setItem(key, JSON.stringify(cart));
    }
  } catch (error) {
    console.error('Error updating quantity:', error);
    throw error;
  }
}

/**
 * Remove item from cart
 */
export async function removeFromCart(userId: string, productId: string): Promise<void> {
  try {
    const cart = await getCart(userId);
    const filteredCart = cart.filter(item => item.product.id !== productId);
    
    const key = STORAGE_KEYS.cart(userId);
    localStorage.setItem(key, JSON.stringify(filteredCart));
  } catch (error) {
    console.error('Error removing from cart:', error);
    throw error;
  }
}

/**
 * Clear all items from cart
 */
export async function clearCart(userId: string): Promise<void> {
  try {
    const key = STORAGE_KEYS.cart(userId);
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Error clearing cart:', error);
    throw error;
  }
}

// ==================== ORDER OPERATIONS ====================

/**
 * Create a new order from cart items
 */
export async function createOrder(
  userId: string, 
  items: CartItem[], 
  total: number, 
  paymentMethod: string = 'cash', 
  paymentDetails?: any
): Promise<Order | null> {
  try {
    if (!items || items.length === 0) {
      throw new Error('Cannot create order with empty cart');
    }
    
    const order: Order = {
      id: `ORD${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      items: items.map(item => ({
        product: { ...item.product },
        quantity: item.quantity
      })),
      total,
      date: new Date().toISOString(),
      status: 'completed',
      paymentMethod,
      paymentDetails
    };
    
    // Save order to history
    const orders = await getOrders(userId);
    orders.unshift(order);
    
    // Keep only last 100 orders
    if (orders.length > 100) {
      orders.splice(100);
    }
    
    const ordersKey = STORAGE_KEYS.orders(userId);
    localStorage.setItem(ordersKey, JSON.stringify(orders));
    
    // Update weekly consumption tracking
    await updateWeeklyConsumption(userId, items);
    
    // Clear cart after successful order
    await clearCart(userId);
    
    return order;
  } catch (error) {
    console.error('Error creating order:', error);
    return null;
  }
}

/**
 * Get user's order history
 */
export async function getOrders(userId: string): Promise<Order[]> {
  try {
    const key = STORAGE_KEYS.orders(userId);
    const stored = localStorage.getItem(key);
    
    if (!stored) return [];
    
    return JSON.parse(stored);
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
}

// ==================== CONSUMPTION TRACKING ====================

/**
 * Update weekly calorie consumption
 */
async function updateWeeklyConsumption(userId: string, items: CartItem[]): Promise<void> {
  try {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
    
    const totalCalories = items.reduce((sum, item) => {
      return sum + (item.product.nutrition.calories * item.quantity);
    }, 0);
    
    const weeklyData = await getWeeklyConsumption(userId);
    weeklyData[dayOfWeek] += totalCalories;
    
    const key = STORAGE_KEYS.consumption(userId);
    localStorage.setItem(key, JSON.stringify(weeklyData));
  } catch (error) {
    console.error('Error updating consumption:', error);
  }
}

/**
 * Get weekly calorie consumption data
 * Returns array of 7 numbers (Sunday to Saturday)
 */
export async function getWeeklyConsumption(userId: string): Promise<number[]> {
  try {
    const key = STORAGE_KEYS.consumption(userId);
    const resetKey = STORAGE_KEYS.consumptionReset(userId);
    const stored = localStorage.getItem(key);
    
    // Check if data needs to be reset for new week
    const lastReset = localStorage.getItem(resetKey);
    const today = new Date();
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay());
    currentWeekStart.setHours(0, 0, 0, 0);
    
    const shouldReset = !lastReset || new Date(lastReset) < currentWeekStart;
    
    if (shouldReset) {
      // Reset consumption data for new week
      const emptyWeek = Array(DAYS_IN_WEEK).fill(0);
      localStorage.setItem(key, JSON.stringify(emptyWeek));
      localStorage.setItem(resetKey, currentWeekStart.toISOString());
      return emptyWeek;
    }
    
    if (!stored) {
      return Array(DAYS_IN_WEEK).fill(0);
    }
    
    const data = JSON.parse(stored);
    
    // Ensure data has correct length
    if (!Array.isArray(data) || data.length !== DAYS_IN_WEEK) {
      return Array(DAYS_IN_WEEK).fill(0);
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching consumption:', error);
    return Array(DAYS_IN_WEEK).fill(0);
  }
}

// ==================== SCAN HISTORY ====================

/**
 * Log a barcode scan
 */
export async function logScan(
  userId: string, 
  productId: string, 
  barcode: string
): Promise<void> {
  try {
    const key = STORAGE_KEYS.scans(userId);
    const stored = localStorage.getItem(key);
    const scans = stored ? JSON.parse(stored) : [];
    
    const { products } = await import('../data/products');
    const product = products.find(p => p.id === productId);
    
    if (!product) {
      throw new Error(`Product with ID ${productId} not found`);
    }
    
    const scanRecord = {
      id: `SCAN${Date.now()}`,
      productId,
      barcode,
      productName: product.name,
      timestamp: new Date().toISOString()
    };
    
    scans.unshift(scanRecord);
    
    // Keep only last MAX_SCAN_HISTORY scans
    if (scans.length > MAX_SCAN_HISTORY) {
      scans.splice(MAX_SCAN_HISTORY);
    }
    
    localStorage.setItem(key, JSON.stringify(scans));
  } catch (error) {
    console.error('Error logging scan:', error);
    throw error;
  }
}

/**
 * Get user's scan history
 */
export async function getScanHistory(userId: string) {
  try {
    const key = STORAGE_KEYS.scans(userId);
    const stored = localStorage.getItem(key);
    
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error fetching scan history:', error);
    return [];
  }
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Clear all user data (for logout or account deletion)
 */
export async function clearUserData(userId: string): Promise<void> {
  try {
    localStorage.removeItem(STORAGE_KEYS.cart(userId));
    localStorage.removeItem(STORAGE_KEYS.orders(userId));
    localStorage.removeItem(STORAGE_KEYS.consumption(userId));
    localStorage.removeItem(STORAGE_KEYS.consumptionReset(userId));
    localStorage.removeItem(STORAGE_KEYS.scans(userId));
  } catch (error) {
    console.error('Error clearing user data:', error);
  }
}

/**
 * Get storage size for user data (in bytes)
 */
export async function getUserDataSize(userId: string): Promise<number> {
  try {
    let totalSize = 0;
    const keys = [
      STORAGE_KEYS.cart(userId),
      STORAGE_KEYS.orders(userId),
      STORAGE_KEYS.consumption(userId),
      STORAGE_KEYS.consumptionReset(userId),
      STORAGE_KEYS.scans(userId),
    ];
    
    for (const key of keys) {
      const data = localStorage.getItem(key);
      if (data) {
        totalSize += new Blob([data]).size;
      }
    }
    
    return totalSize;
  } catch (error) {
    console.error('Error calculating data size:', error);
    return 0;
  }
}
