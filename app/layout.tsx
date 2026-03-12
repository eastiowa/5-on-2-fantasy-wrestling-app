import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Navbar } from '@/components/shared/Navbar'
import { InviteRedirector } from '@/components/shared/InviteRedirector'
import { createClient } from '@/lib/supabase/server'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '5 on 2 Fantasy Wrestling League',
  description: 'Fantasy wrestling draft and scoring platform',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let role: 'commissioner' | 'team_manager' | null = null
  let hasTeam = false
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, team_id')
      .eq('id', user.id)
      .single()
    role = profile?.role ?? null
    hasTeam = !!profile?.team_id
  }

  // Fetch current season label for the navbar badge (public data, always safe)
  const { data: currentSeason } = await supabase
    .from('seasons')
    .select('label, year')
    .eq('is_current', true)
    .maybeSingle()

  // Bootstrap: detect when no commissioners exist so the Navbar can show a setup link
  const { count: commissionerCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'commissioner')
  const isBootstrap = (commissionerCount ?? 0) === 0

  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-950 text-gray-100 min-h-screen`}>
        <InviteRedirector />
        <Navbar role={role} hasTeam={hasTeam} currentSeasonLabel={currentSeason?.label ?? null} isBootstrap={isBootstrap} />
        <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
          {children}
        </main>
      </body>
    </html>
  )
}
