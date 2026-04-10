import { ClerkProvider } from '@clerk/nextjs'

// Nested ClerkProvider — only wraps the /account subtree so the rest of the
// marketing site builds and serves without Clerk env vars. The publishable
// key is read automatically from NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.
//
// We intentionally scope Clerk to this layout rather than the root layout
// so public pages (home, pricing, blog, support, etc.) remain Clerk-free
// and keep their current bundle size.
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      // Match the marketing site's dark aesthetic. The custom forms we render
      // below use our own components; these variables only affect any
      // Clerk-managed UI such as the Turnstile CAPTCHA.
      appearance={{
        variables: {
          colorPrimary: '#8CC8FF',
          colorBackground: '#0B1220',
          colorText: '#E8F3FFC2',
          colorTextSecondary: '#E8F3FF80',
          colorDanger: '#f07878',
          borderRadius: '14px',
        },
      }}
    >
      {children}
    </ClerkProvider>
  )
}
