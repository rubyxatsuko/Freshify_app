import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '../utils/supabase/info';

const supabaseUrl = `https://${projectId}.supabase.co`;

export const supabase = createClient(supabaseUrl, publicAnonKey);

// Database types
export interface DbUser {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export interface DbCartItem {
  id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
}

export interface DbOrder {
  id: string;
  user_id: string;
  items: any[];
  total: number;
  status: 'pending' | 'processing' | 'completed';
  created_at: string;
}

export interface DbConsumptionLog {
  id: string;
  user_id: string;
  date: string;
  calories: number;
  items: string[];
  created_at: string;
}

export interface DbScanHistory {
  id: string;
  user_id: string;
  product_id: string;
  barcode: string;
  scanned_at: string;
}