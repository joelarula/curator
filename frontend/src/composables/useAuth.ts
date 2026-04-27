/**
 * useAuth.ts
 * 
 * Authentication composable — Google OAuth flow + JWT token management.
 * 
 * Flow:
 *   1. `initAuth()` is called on app mount. It checks the URL for a `?token=`
 *      query param (set by the server after a successful Google OAuth callback)
 *      and persists it to localStorage.
 *   2. `token` (module-level ref) is used by `useGraphql` to inject the
 *      Authorization header on every GraphQL request.
 *   3. `fetchUser()` verifies the token is valid by querying the `me` resolver.
 *      If it fails, the user is logged out automatically.
 *   4. `loginWithGoogle()` redirects to the server's OAuth entry point.
 * 
 * `user` and `token` are module-level refs so any component can import them
 * directly without calling `useAuth()`.
 */
import { ref } from 'vue'
import { graphql } from './useGraphql'

export const user = ref<any>(null)
export const token = ref<string>('')

export function useAuth() {
  /** Fetches the current user from the server and populates `user`. Logs out on failure. */
  async function fetchUser() {
    const data = await graphql('{ me { id email name } }')
    if (data?.me) {
      user.value = data.me
    } else {
      logout()
    }
  }

  /** Redirects the browser to the server's Google OAuth entry point. */
  function loginWithGoogle() {
    window.location.href = 'http://localhost:4000/auth/google'
  }

  /** Clears the token from localStorage and reloads the app to the login screen. */
  function logout() {
    localStorage.removeItem('token')
    user.value = null
    token.value = ''
    window.location.href = '/'
  }

  /**
   * Bootstraps authentication on app mount.
   * Captures a one-time `?token=` URL param from the OAuth redirect,
   * stores it in localStorage, and removes it from the URL bar.
   */
  function initAuth() {
    const urlParams = new URLSearchParams(window.location.search)
    const queryToken = urlParams.get('token')

    if (queryToken) {
      localStorage.setItem('token', queryToken)
      token.value = queryToken
      window.history.replaceState({}, document.title, '/')
    } else {
      token.value = localStorage.getItem('token') || ''
    }
  }

  return { user, token, fetchUser, loginWithGoogle, logout, initAuth }
}
