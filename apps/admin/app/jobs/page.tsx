import { adminFetch } from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { JobStatusBadge } from '@/components/jobs/JobStatusBadge'
import { formatDateTime, formatDuration } from '@/lib/utils'
import Link from 'next/link'

interface JobListData {
  jobs: Array<{
    id: string
    userEmail: string
    status: string
    rcCost: number | null
    createdAt: string
    updatedAt: string
    durationSec: number | null
    errorMessage: string | null
  }>
  nextCursor: string | null
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; range?: string; cursor?: string }>
}) {
  const { status, range = '7d', cursor } = await searchParams
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (range) params.set('range', range)
  if (cursor) params.set('cursor', cursor)

  const data = await adminFetch<JobListData>(`/api/admin/jobs?${params.toString()}`)

  return (
    <div>
      <PageHeader title="Jobs" />

      <form className="flex gap-3 mb-4">
        <select
          name="status"
          defaultValue={status ?? ''}
          className="px-3 py-2 border border-border rounded-md text-sm bg-background"
        >
          <option value="">All Statuses</option>
          <option value="uploading">Uploading</option>
          <option value="queued">Queued</option>
          <option value="rendering">Rendering</option>
          <option value="compositing">Compositing</option>
          <option value="complete">Complete</option>
          <option value="failed">Failed</option>
        </select>
        <select
          name="range"
          defaultValue={range}
          className="px-3 py-2 border border-border rounded-md text-sm bg-background"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="all">All time</option>
        </select>
        <button
          type="submit"
          className="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Filter
        </button>
      </form>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Job ID</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">User</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">RC</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Duration</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Created</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Error</th>
            </tr>
          </thead>
          <tbody>
            {data.jobs.map((job) => (
              <tr key={job.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2 font-mono text-xs">
                  <Link href={`/jobs/${job.id}`} className="text-primary hover:underline">
                    {job.id.slice(0, 8)}...
                  </Link>
                </td>
                <td className="px-4 py-2">{job.userEmail}</td>
                <td className="px-4 py-2">
                  <JobStatusBadge status={job.status} />
                </td>
                <td className="px-4 py-2">{job.rcCost ?? '—'}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {job.durationSec != null ? formatDuration(job.durationSec) : '—'}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{formatDateTime(job.createdAt)}</td>
                <td className="px-4 py-2 text-muted-foreground truncate max-w-[200px]">
                  {job.errorMessage ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.nextCursor && (
        <div className="mt-4">
          <Link
            href={`/jobs?${status ? `status=${status}&` : ''}range=${range}&cursor=${data.nextCursor}`}
            className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-secondary"
          >
            Next →
          </Link>
        </div>
      )}
    </div>
  )
}
