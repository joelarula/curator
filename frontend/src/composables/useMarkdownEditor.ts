/**
 * useMarkdownEditor.ts
 * 
 * Low-level textarea manipulation composable for markdown authoring.
 * 
 * Works by reading the native textarea's `selectionStart`/`selectionEnd`
 * to wrap or insert markdown syntax around the currently selected text.
 * After insertion it uses `nextTick` to restore focus and re-position the
 * cursor inside the newly inserted syntax (e.g. inside `**...**`).
 * 
 * Used by:
 * - `EstablishSourceDialog.vue` (manual entry tab)
 * - `WikiPage.vue` (in-page editor)
 * 
 * @param contentRef  A writable ref holding the textarea's string value.
 * @param textareaRef A ref to the Vuetify `<v-textarea>` component instance.
 */
import { nextTick } from 'vue'

export function useMarkdownEditor(contentRef: { value: string }, textareaRef: any) {
  /**
   * Inserts `text` at the current cursor position (or replaces the selection).
   * Optionally places the cursor at `cursorOffset` characters in, with `selectionLen`
   * characters pre-selected (useful for placing the cursor inside syntax markers).
   */
  function insertText(text: string, cursorOffset = 0, selectionLen = 0) {
    const textarea = textareaRef.value?.$el.querySelector('textarea') || textareaRef.value
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    
    contentRef.value = contentRef.value.substring(0, start) + text + contentRef.value.substring(end)
    
    nextTick(() => {
      textarea.focus()
      if (selectionLen > 0) {
        textarea.setSelectionRange(start + cursorOffset, start + cursorOffset + selectionLen)
      } else {
        textarea.setSelectionRange(start + text.length, start + text.length)
      }
    })
  }

  /**
   * Applies a markdown format to the current selection.
   * Supported types: 'bold', 'italic', 'h1', 'h2', 'list', 'wiki-link'.
   * If no text is selected, sensible placeholder text is inserted instead.
   */
  function applyFormat(type: string) {
    const textarea = textareaRef.value?.$el.querySelector('textarea') || textareaRef.value
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = contentRef.value.substring(start, end)
    let replacement = ''
    let cursorOffset = 2
    let selectionLen = selected.length || 9

    switch (type) {
      case 'bold':
        replacement = `**${selected || 'bold text'}**`
        break
      case 'italic':
        replacement = `*${selected || 'italic text'}*`
        cursorOffset = 1
        break
      case 'h1':
        replacement = `\n# ${selected || 'Header'}\n`
        cursorOffset = 3
        break
      case 'h2':
        replacement = `\n## ${selected || 'Subheader'}\n`
        cursorOffset = 4
        break
      case 'list':
        replacement = `\n- ${selected || 'item'}`
        cursorOffset = 3
        break
      case 'wiki-link':
        replacement = `[[path/to/page | ${selected || 'Page Label'}]]`
        cursorOffset = 2
        selectionLen = 12
        break
    }

    if (replacement) {
        insertText(replacement, cursorOffset, selectionLen)
    }
  }

  return {
    applyFormat,
    insertText
  }
}
