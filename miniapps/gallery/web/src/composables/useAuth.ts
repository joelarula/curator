import { ref, computed } from 'vue';

export interface RoleInfo {
  id: string;
  name: string;
  description?: string | null;
}

export interface UserProjectAccess {
  id: string;
  name: string;
  roles: string[];
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
  googleId?: string | null;
  roles?: (string | RoleInfo)[];
  projects?: UserProjectAccess[];
  defaultProjectId?: string;
}

export const user = ref<UserProfile | null>(null);
export const token = ref<string>('');
export const activeProjectId = ref<string>('artmoments');
export const authLoading = ref<boolean>(false);

export const isAuthenticated = computed(() => !!user.value);

export const userProjects = computed<UserProjectAccess[]>(() => {
  return user.value?.projects || [];
});

export const isCuratorManager = computed(() => {
  if (!user.value?.roles) return false;
  return user.value.roles.some((r) => {
    const roleName = typeof r === 'string' ? r : r.name;
    return (
      roleName === 'curator_manager' ||
      roleName === 'gallery_admin' ||
      roleName === 'gallery_curator'
    );
  });
});

export function useAuth() {
  async function initAuth() {
    if (typeof window === 'undefined') return;

    authLoading.value = true;
    try {
      const url = new URL(window.location.href);
      const queryToken = url.searchParams.get('token');

      if (queryToken) {
        localStorage.setItem('gallery_token', queryToken);
        token.value = queryToken;

        url.searchParams.delete('token');
        url.searchParams.delete('auth_error');
        window.history.replaceState({}, document.title, url.pathname + url.search);
      } else {
        token.value = localStorage.getItem('gallery_token') || '';
      }

      const savedProj = localStorage.getItem('gallery_project_id');
      if (savedProj) {
        activeProjectId.value = savedProj;
      }

      if (token.value) {
        await fetchUser();
      }
    } finally {
      authLoading.value = false;
    }
  }

  async function fetchUser(): Promise<UserProfile | null> {
    if (!token.value) {
      user.value = null;
      return null;
    }

    try {
      const res = await fetch('/auth/me', {
        headers: {
          Authorization: `Bearer ${token.value}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          user.value = data.user;
          if (data.user.defaultProjectId && !localStorage.getItem('gallery_project_id')) {
            activeProjectId.value = data.user.defaultProjectId;
          }
          return data.user;
        }
      }
      logout();
      return null;
    } catch (err) {
      console.warn('[Gallery Auth] Failed to fetch user profile:', err);
      return null;
    }
  }

  function setActiveProject(projectId: string) {
    activeProjectId.value = projectId;
    if (typeof window !== 'undefined') {
      localStorage.setItem('gallery_project_id', projectId);
    }
  }

  function loginWithGoogle() {
    if (typeof window === 'undefined') return;
    const callback = encodeURIComponent(window.location.href);
    window.location.href = `/auth/google?callback=${callback}`;
  }

  function logout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('gallery_token');
    }
    token.value = '';
    user.value = null;
  }

  return {
    user,
    token,
    activeProjectId,
    userProjects,
    authLoading,
    isAuthenticated,
    isCuratorManager,
    initAuth,
    fetchUser,
    setActiveProject,
    loginWithGoogle,
    logout,
  };
}
