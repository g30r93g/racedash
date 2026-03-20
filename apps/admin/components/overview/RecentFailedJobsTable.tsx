import { formatDateTime } from '@/lib/utils'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'

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
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/50">
          <TableHead>Job ID</TableHead>
          <TableHead>User</TableHead>
          <TableHead>Error</TableHead>
          <TableHead>Failed At</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((job) => (
          <TableRow key={job.id}>
            <TableCell className="font-mono text-xs">
              <a href={`/jobs/${job.id}`} className="text-primary hover:underline">
                {job.id.slice(0, 8)}...
              </a>
            </TableCell>
            <TableCell>{job.userEmail}</TableCell>
            <TableCell className="text-muted-foreground truncate max-w-[300px]">
              {job.errorMessage ?? '—'}
            </TableCell>
            <TableCell className="text-muted-foreground">{formatDateTime(job.failedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
