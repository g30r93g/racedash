import { formatDateTime } from '@/lib/utils'

interface FailedJob {
  id: string
  userEmail: string
  errorMessage: string | null
  failedAt: string
}

export function RecentFailedJobsTable({ jobs }: { jobs: FailedJob[] }) {
  if (jobs.length === 0) {
    return <p className="text-sm text-muted-foreground">No recent failures.</p>
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Job ID</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">User</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Error</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Failed At</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2 font-mono text-xs">
                <a href={`/jobs/${job.id}`} className="text-primary hover:underline">
                  {job.id.slice(0, 8)}...
                </a>
              </td>
              <td className="px-4 py-2">{job.userEmail}</td>
              <td className="px-4 py-2 text-muted-foreground truncate max-w-[300px]">
                {job.errorMessage ?? '—'}
              </td>
              <td className="px-4 py-2 text-muted-foreground">{formatDateTime(job.failedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
