import { adminFetch } from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'

interface UserListData {
  users: Array<{
    id: string
    clerkId: string
    email: string
    licenseTier: 'plus' | 'pro' | null
    createdAt: string
  }>
  nextCursor: string | null
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; cursor?: string }>
}) {
  const { search, cursor } = await searchParams
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  if (cursor) params.set('cursor', cursor)

  const data = await adminFetch<UserListData>(`/api/admin/users?${params.toString()}`)

  return (
    <div>
      <PageHeader title="Users" />

      <form className="mb-4">
        <input
          type="text"
          name="search"
          defaultValue={search}
          placeholder="Search by email..."
          className="w-80 px-3 py-2 border border-border rounded-md text-sm bg-background"
        />
      </form>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Email</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Clerk ID</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Tier</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Created</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((user) => (
              <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2">
                  <Link href={`/users/${user.id}`} className="text-primary hover:underline">
                    {user.email}
                  </Link>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{user.clerkId}</td>
                <td className="px-4 py-2">
                  {user.licenseTier ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary uppercase">
                      {user.licenseTier}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{formatDate(user.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.nextCursor && (
        <div className="mt-4">
          <Link
            href={`/users?${search ? `search=${search}&` : ''}cursor=${data.nextCursor}`}
            className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-secondary"
          >
            Next →
          </Link>
        </div>
      )}
    </div>
  )
}
