import { adminFetch } from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { UserDetailClient } from '@/components/users/UserDetailClient'

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const data = await adminFetch<{
    user: {
      id: string
      clerkId: string
      email: string
      billingCountry: string | null
      stripeCustomerId: string | null
      createdAt: string
    }
    licenses: Array<{
      id: string
      tier: string
      status: string
      stripeSubscriptionId: string | null
      startsAt: string
      expiresAt: string
      createdAt: string
      updatedAt: string
    }>
    totalRc: number
    creditPacks: Array<{
      id: string
      packName: string
      rcTotal: number
      rcRemaining: number
      priceGbp: string
      purchasedAt: string
      expiresAt: string
    }>
    recentJobs: Array<{
      id: string
      status: string
      rcCost: number | null
      createdAt: string
      updatedAt: string
    }>
  }>(`/api/admin/users/${id}`)

  return (
    <div>
      <PageHeader title={data.user.email} breadcrumb={{ label: 'Users', href: '/users' }} />
      <UserDetailClient data={data} />
    </div>
  )
}
