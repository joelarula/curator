import { ref, computed } from 'vue';
import { getServerBaseUrl } from '@wasm/graphql-client';

export interface RoleInfo {
  id: string;
  name: string;
  description?: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
  googleId?: string | null;
  roles?: (string | RoleInfo)[];
  createdAt?: string;
  updatedAt?: string;
}

export const user = ref<UserProfile | null>(null);
export const token = ref<string>('');
export const authLoading = ref<boolean>(false);
export const isAuthenticated = computed(() => !!user.value);
export const isCuratorManager = computed(() => {
  if (!user.value?.roles) return false;
  return user.value.roles.some((r) => {
    const roleName = typeof r === 'string' ? r : r.name;
    return roleName === 'curator_manager';
  });
});

export function useAuth() {
  /**
   * Initializes authentication state by inspecting the URL query parameters
   * for a ?token= parameter from the Google OAuth callback, or reads from localStorage.
   */
  async function initAuth() {
    if (typeof window === 'undefined') return;

    authLoading.value = true;
    try {
      const url = new URL(window.location.href);
      const queryToken = url.searchParams.get('token');

      if (queryToken) {
        localStorage.setItem('keeris_token', queryToken);
        token.value = queryToken;

        // Clean up token from browser URL without triggering reload
        url.searchParams.delete('token');
        url.searchParams.delete('auth_error');
        window.history.replaceState({}, document.title, url.pathname + url.search);
      } else {
        token.value = localStorage.getItem('keeris_token') || '';
      }

      if (token.value) {
        await fetchUser();
      }
    } finally {
      authLoading.value = false;
    }
  }

  /**
   * Validates current token against the server's /auth/me endpoint.
   */
  async function fetchUser(): Promise<UserProfile | null> {
    if (!token.value) {
      user.value = null;
      return null;
    }

    try {
      const baseUrl = getServerBaseUrl();
      const res = await fetch(`${baseUrl}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token.value}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          user.value = data.user;
          return data.user;
        }
      }
      // If unauthorized or token invalid, clear
      logout();
      return null;
    } catch (err) {
      console.warn('[Keeris Auth] Failed to fetch current user profile:', err);
      return null;
    }
  }

  /**
   * Redirects the user to the server's Google OAuth initiation endpoint.
   */
  function loginWithGoogle() {
    if (typeof window === 'undefined') return;
    const baseUrl = getServerBaseUrl();
    const callback = encodeURIComponent(window.location.origin);
    window.location.href = `${baseUrl}/auth/google?callback=${callback}`;
  }

  /**
   * Logs out the user by clearing local storage and reactive state.
   */
  function logout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('keeris_token');
    }
    token.value = '';
    user.value = null;
  }

  return {
    user,
    token,
    authLoading,
    isAuthenticated,
    isCuratorManager,
    initAuth,
    fetchUser,
    loginWithGoogle,
    logout,
  };
}
