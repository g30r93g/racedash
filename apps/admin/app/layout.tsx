import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { ClerkProvider } from '@clerk/nextjs'
import { Sidebar } from '@/components/layout/Sidebar'
import './globals.css'

export const metadata = {
  title: 'RaceDash Admin',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { userId, sessionClaims } = await auth()

  if (userId && (sessionClaims?.publicMetadata as Record<string, unknown>)?.role !== 'admin') {
    redirect('/access-denied')
  }

  return (
    <ClerkProvider>
      <html lang="en">
        <body className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 p-8">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  )
}
