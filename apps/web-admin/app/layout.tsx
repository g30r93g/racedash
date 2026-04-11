import { auth } from '@clerk/nextjs/server'
import { ClerkProvider } from '@clerk/nextjs'
import { ThemeProvider } from '@/components/theme-provider'
import { Sidebar } from '@/components/layout/Sidebar'
import './globals.css'
import { Geist } from 'next/font/google'
import { cn } from '@/lib/utils'

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' })

export const metadata = {
  title: 'RaceDash Admin',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()

  // Middleware already enforces admin role — if userId is set here, they're an admin
  const isAdmin = !!userId

  return (
    <html lang="en" className={cn('font-sans', geist.variable)} suppressHydrationWarning>
      <body className={isAdmin ? 'flex min-h-screen' : ''}>
        <ClerkProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            {isAdmin ? (
              <>
                <Sidebar />
                <main className="flex-1 p-8">{children}</main>
              </>
            ) : (
              children
            )}
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
