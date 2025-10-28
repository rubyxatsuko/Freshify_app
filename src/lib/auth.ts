import { supabase } from './supabase';

// Simplified auth using only Supabase Auth (no complex RLS)

export async function signUp(email: string, password: string, name: string) {
  try {
    // Sign up with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name
        }
      }
    });

    if (error) throw error;

    // Auto sign in after signup
    if (data.user) {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;

      return { 
        data: signInData, 
        error: null,
        user: {
          id: data.user.id,
          email: data.user.email || email,
          name: name
        }
      };
    }

    return { data, error: null, user: null };
  } catch (error: any) {
    console.error('Signup error:', error);
    
    // Translate common Supabase errors to Indonesian
    let errorMessage = error.message;
    
    if (error.message?.includes('User already registered')) {
      errorMessage = 'Email sudah terdaftar. Silakan gunakan email lain atau login.';
    } else if (error.message?.includes('Password should be at least')) {
      errorMessage = 'Password minimal harus 6 karakter.';
    } else if (error.message?.includes('Invalid email')) {
      errorMessage = 'Format email tidak valid.';
    } else if (error.message?.includes('Signup requires a valid password')) {
      errorMessage = 'Password tidak boleh kosong.';
    } else if (error.message?.includes('Unable to validate email address')) {
      errorMessage = 'Email tidak valid. Periksa kembali email Anda.';
    } else if (error.message?.includes('Database error')) {
      errorMessage = 'Terjadi kesalahan pada server. Silakan coba lagi.';
    } else if (!errorMessage) {
      errorMessage = 'Gagal membuat akun. Silakan coba lagi.';
    }
    
    return { data: null, error: errorMessage, user: null };
  }
}

export async function signIn(email: string, password: string) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    return { data, error: null };
  } catch (error: any) {
    console.error('Sign in error:', error);
    
    // Translate common Supabase errors to Indonesian
    let errorMessage = error.message;
    
    if (error.message?.includes('Invalid login credentials')) {
      errorMessage = 'Email atau password salah. Jika Anda belum punya akun, silakan daftar terlebih dahulu di tab Sign Up.';
    } else if (error.message?.includes('Email not confirmed')) {
      errorMessage = 'Email belum dikonfirmasi. Periksa inbox email Anda.';
    } else if (error.message?.includes('Invalid email')) {
      errorMessage = 'Format email tidak valid.';
    } else if (error.message?.includes('User not found')) {
      errorMessage = 'Akun tidak ditemukan. Silakan daftar terlebih dahulu.';
    } else if (error.message?.includes('Too many requests')) {
      errorMessage = 'Terlalu banyak percobaan login. Tunggu beberapa saat.';
    } else if (error.message?.includes('Network request failed')) {
      errorMessage = 'Tidak ada koneksi internet. Periksa koneksi Anda.';
    } else if (!errorMessage) {
      errorMessage = 'Gagal login. Silakan coba lagi.';
    }
    
    return { data: null, error: errorMessage };
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getCurrentUser() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) return null;

    // Return user profile from session metadata
    return {
      id: session.user.id,
      email: session.user.email || '',
      name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
      role: session.user.user_metadata?.role || 'user'
    };
  } catch (error) {
    console.error('Get current user error:', error);
    return null;
  }
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}
