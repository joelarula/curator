/**
 * useGlobalActions.ts
 * 
 * Cross-component action orchestration layer.
 * 
 * Holds module-level reactive state for dialogs and actions that can be
 * triggered from anywhere in the app (e.g. the sidebar "+" button, a
 * keyboard shortcut, or a page button) and consumed by the dialog component
 * that is mounted at the App root.
 * 
 * Pattern: shared refs instead of an event bus — any component can import
 * `showEstablishSourceDialog` directly and set it to true without needing
 * a parent-child relationship.
 */
import { ref } from 'vue'

export const showEstablishSourceDialog = ref(false)
export const initialParentId = ref<string | null>(null)

/**
 * Opens the "Establish Source" dialog, optionally pre-setting a parent node.
 * Call with a Source ID to create a child wiki page under that parent,
 * or with no arguments to create a top-level root page.
 */
export function openEstablishSource(parentId: string | null = null) {
    initialParentId.value = parentId
    showEstablishSourceDialog.value = true
}
