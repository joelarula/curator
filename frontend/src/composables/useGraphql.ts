/**
 * useGraphql.ts
 * 
 * Central GraphQL client and global notification layer.
 * 
 * Provides:
 * - `graphql(query, variables)` — authenticated POST to /graphql, returns
 *   response data or null on error. Automatically injects the Bearer token
 *   from `useAuth`.
 * - `showSuccess(msg)` / `showError(msg)` — writes to the module-level
 *   snackbar refs consumed by the App root's <v-snackbar>.
 * 
 * All pages and components use this single function rather than raw fetch,
 * ensuring consistent auth headers and error surfacing.
 */
import { ref } from 'vue'
import { token } from './useAuth'

export const snackbar = ref(false)
export const snackbarText = ref('')

/** Displays a success message in the global snackbar. */
export function showSuccess(msg: string) {
  snackbarText.value = msg
  snackbar.value = true
}

/** Displays an error message in the global snackbar (prefixed with "Error:"). */
export function showError(msg: string) {
  snackbarText.value = `Error: ${msg}`
  snackbar.value = true
}

/**
 * Sends an authenticated GraphQL request to the server.
 * @returns The `data` field of the response, or `null` if an error occurred.
 * Errors are automatically shown in the global snackbar.
 */
export async function graphql(query: string, variables: any = {}) {
  try {
    const response = await fetch('/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.value}`,
      },
      body: JSON.stringify({ query, variables }),
    })
    const result = await response.json()
    if (result.errors) {
      console.error('GraphQL Errors:', result.errors)
      showError(result.errors[0].message)
      return null
    }
    return result.data
  } catch (error) {
    console.error('GraphQL Fetch Error:', error)
    showError('Network error connecting to server')
    return null
  }
}
