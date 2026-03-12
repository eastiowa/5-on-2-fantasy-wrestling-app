'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Menu, X, LogOut, User, Settings, LayoutDashboard, Users, Trophy, History, Zap } from 'lucide-react'

interface NavbarProps {
  role?: 'commissioner' | 'team_manager' | null
  hasTeam?: boolean
  currentSeasonLabel?: string | null
  isBootstrap?: boolean
}

export function Navbar({ role, hasTeam, currentSeasonLabel, isBootstrap }: NavbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const navLinks = [
    { href: '/', label: 'Dashboard', icon: Trophy },
    ...(role && hasTeam ? [
      { href: '/dashboard', label: 'My Team', icon: LayoutDashboard },
    ] : []),
    ...(role ? [
      { href: '/draft', label: 'Draft Room', icon: Users },
    ] : []),
    { href: '/past-seasons', label: 'Past Seasons', icon: History },
    ...(role === 'commissioner' ? [
      { href: '/commissioner', label: 'Commissioner', icon: Settings },
    ] : []),
    ...(role && isBootstrap ? [
      { href: '/commissioner/users', label: 'Setup', icon: Zap },
    ] : []),
  ]

  return (
    <nav className="bg-gray-900 border-b-2 border-orange-600 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-4">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity shrink-0">
            <Image
              src="/logo.png"
              alt="5 on 2 Fantasy Wrestling"
              width={68}
              height={68}
              className="rounded-lg object-contain"
              priority
            />
            <div className="hidden lg:block">
              <span className="font-bold text-base text-yellow-400 tracking-tight leading-none">
                5 on 2 Fantasy Wrestling
              </span>
              {currentSeasonLabel && (
                <div className="text-xs text-orange-400/80 leading-none mt-0.5">{currentSeasonLabel}</div>
              )}
            </div>
            <span className="lg:hidden font-bold text-base text-yellow-400">5 on 2</span>
          </Link>

          {/* Desktop Nav — text only, no icons */}
          <div className="hidden md:flex items-center gap-0.5 flex-1 justify-center">
            {navLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
                  pathname === href || (href !== '/' && pathname.startsWith(href))
                    ? 'bg-yellow-400 text-gray-900'
                    : 'text-gray-300 hover:bg-orange-600/20 hover:text-orange-300'
                )}
              >
                {label}
              </Link>
            ))}
          </div>

          {/* User actions */}
          <div className="hidden md:flex items-center shrink-0">
            {role ? (
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-gray-400 hover:bg-orange-600/20 hover:text-orange-300 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium bg-yellow-400 text-gray-900 hover:bg-yellow-300 transition-colors"
              >
                <User className="w-4 h-4" />
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-md text-gray-400 hover:text-orange-300 hover:bg-orange-600/20 transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-800 bg-gray-900">
          <div className="px-4 py-3 space-y-1">
            {/* Season label on mobile */}
            {currentSeasonLabel && (
              <div className="px-3 py-1 text-xs text-orange-400/80 font-medium">{currentSeasonLabel}</div>
            )}
            {navLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                  pathname === href || (href !== '/' && pathname.startsWith(href))
                    ? 'bg-yellow-400 text-gray-900'
                    : 'text-gray-300 hover:bg-orange-600/20 hover:text-orange-300'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}

            <div className="pt-3 mt-3 border-t border-gray-800">
              {role ? (
                <button
                  onClick={() => { setMenuOpen(false); handleSignOut() }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 rounded-md text-sm text-gray-300 hover:bg-orange-600/20 hover:text-orange-300 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium bg-yellow-400 text-gray-900 hover:bg-yellow-300 transition-colors"
                >
                  <User className="w-4 h-4" />
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
