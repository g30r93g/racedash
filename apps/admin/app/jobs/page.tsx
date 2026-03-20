import { adminFetch } from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { JobStatusBadge } from '@/components/jobs/JobStatusBadge'
import { formatDateTime, formatDuration } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
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
        <Select name="status" defaultValue={status ?? ''}>
          <option value="">All Statuses</option>
          <option value="uploading">Uploading</option>
          <option value="queued">Queued</option>
          <option value="rendering">Rendering</option>
          <option value="compositing">Compositing</option>
          <option value="complete">Complete</option>
          <option value="failed">Failed</option>
        </Select>
        <Select name="range" defaultValue={range}>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="all">All time</option>
        </Select>
        <Button type="submit">Filter</Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>Job ID</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>RC</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Error</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.jobs.map((job) => (
            <TableRow key={job.id} className="hover:bg-muted/30">
              <TableCell className="font-mono text-xs">
                <Link href={`/jobs/${job.id}`} className="text-primary hover:underline">
                  {job.id.slice(0, 8)}...
                </Link>
              </TableCell>
              <TableCell>{job.userEmail}</TableCell>
              <TableCell>
                <JobStatusBadge status={job.status} />
              </TableCell>
              <TableCell>{job.rcCost ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">
                {job.durationSec != null ? formatDuration(job.durationSec) : '—'}
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDateTime(job.createdAt)}</TableCell>
              <TableCell className="text-muted-foreground truncate max-w-[200px]">
                {job.errorMessage ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {data.nextCursor && (
        <div className="mt-4">
          <Link
            href={`/jobs?${status ? `status=${status}&` : ''}range=${range}&cursor=${data.nextCursor}`}
          >
            <Button variant="outline" size="sm">
              Next →
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}
