'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Trophy, Menu, X, LogOut, User, Settings, LayoutDashboard, Users } from 'lucide-react'

interface NavbarProps {
  role?: 'commissioner' | 'team_manager' | null
}

export function Navbar({ role }: NavbarProps) {
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
    { href: '/', label: 'Standings', icon: Trophy },
    ...(role === 'team_manager' ? [
      { href: '/dashboard', label: 'My Team', icon: LayoutDashboard },
      { href: '/draft', label: 'Draft Room', icon: Users },
    ] : []),
    ...(role === 'commissioner' ? [
      { href: '/commissioner', label: 'Commissioner', icon: Settings },
      { href: '/draft', label: 'Draft Room', icon: Users },
    ] : []),
  ]

  return (
    <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-yellow-400 hover:text-yellow-300 transition-colors">
            <Trophy className="w-6 h-6" />
            <span className="hidden sm:block">5 on 2 Fantasy Wrestling</span>
            <span className="sm:hidden">5 on 2</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  pathname === href
                    ? 'bg-yellow-400 text-gray-900'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </div>

          {/* User actions */}
          <div className="hidden md:flex items-center gap-2">
            {role ? (
              <>
                <span className="text-xs text-gray-400 px-2 py-1 bg-gray-800 rounded-full capitalize">
                  {role.replace('_', ' ')}
                </span>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-yellow-400 text-gray-900 hover:bg-yellow-300 transition-colors"
              >
                <User className="w-4 h-4" />
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-800"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-800 bg-gray-900 px-4 py-3 space-y-1">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                pathname === href
                  ? 'bg-yellow-400 text-gray-900'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
          {role ? (
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-yellow-400 text-gray-900"
            >
              <User className="w-4 h-4" />
              Sign In
            </Link>
          )}
        </div>
      )}
    </nav>
  )
}
