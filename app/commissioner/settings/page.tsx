import { redirect } from 'next/navigation'

/**
 * Draft Settings have been merged into the Draft Controls page.
 * Redirect any bookmarks or old links.
 */
export default function SettingsRedirect() {
  redirect('/commissioner/draft')
}
