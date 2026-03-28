import { adminFetch } from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { JobStatusBadge } from '@/components/jobs/JobStatusBadge'
import { SfnExecutionLink } from '@/components/jobs/SfnExecutionLink'
import { formatDateTime, formatDuration } from '@/lib/utils'

interface JobDetailData {
  job: {
    id: string
    userId: string
    userEmail: string
    status: string
    config: Record<string, unknown>
    inputS3Keys: string[]
    uploadIds: unknown
    outputS3Key: string | null
    downloadExpiresAt: string | null
    slotTaskToken: string | null
    renderTaskToken: string | null
    remotionRenderId: string | null
    rcCost: number | null
    sfnExecutionArn: string | null
    errorMessage: string | null
    createdAt: string
    updatedAt: string
  }
  sfnConsoleUrl: string | null
  creditReservation: {
    id: string
    rcAmount: number
    status: string
    createdAt: string
    settledAt: string | null
    packs: Array<{ packId: string; packName: string; rcDeducted: number }>
  } | null
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await adminFetch<JobDetailData>(`/api/admin/jobs/${id}`)

  const { job } = data
  const isTerminal = job.status === 'complete' || job.status === 'failed'
  const durationSec = isTerminal
    ? Math.round((new Date(job.updatedAt).getTime() - new Date(job.createdAt).getTime()) / 1000)
    : null

  const config = job.config as { width?: number; height?: number; fps?: number }

  return (
    <div>
      <PageHeader title={`Job ${job.id.slice(0, 8)}...`} breadcrumb={{ label: 'Jobs', href: '/jobs' }} />

      <div className="space-y-6">
        <section className="rounded-lg border border-border p-5">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <JobStatusBadge status={job.status} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">RC Cost</dt>
              <dd>{job.rcCost ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">User</dt>
              <dd>{job.userEmail}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Duration</dt>
              <dd>{durationSec != null ? formatDuration(durationSec) : '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatDateTime(job.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Updated</dt>
              <dd>{formatDateTime(job.updatedAt)}</dd>
            </div>
          </dl>
        </section>

        {job.errorMessage && (
          <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-5">
            <h2 className="text-sm font-semibold text-destructive mb-2">Error</h2>
            <p className="text-sm">{job.errorMessage}</p>
          </section>
        )}

        <section className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold mb-3">Config & I/O</h2>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Resolution</dt>
              <dd>
                {config.width && config.height ? `${config.width}x${config.height}` : '—'}
                {config.fps ? ` @ ${config.fps}fps` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Input</dt>
              <dd className="font-mono text-xs">{job.inputS3Keys?.[0] ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Output</dt>
              <dd className="font-mono text-xs">{job.outputS3Key ?? '—'}</dd>
            </div>
            {job.downloadExpiresAt && (
              <div>
                <dt className="text-muted-foreground">Download Expires</dt>
                <dd>{formatDateTime(job.downloadExpiresAt)}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold mb-3">Pipeline</h2>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Step Functions</dt>
              <dd>
                <SfnExecutionLink url={data.sfnConsoleUrl} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Remotion Render ID</dt>
              <dd className="font-mono text-xs">{job.remotionRenderId ?? '—'}</dd>
            </div>
          </dl>
        </section>

        {data.creditReservation && (
          <section className="rounded-lg border border-border p-5">
            <h2 className="text-sm font-semibold mb-3">Credit Reservation</h2>
            <dl className="grid grid-cols-3 gap-4 text-sm mb-3">
              <div>
                <dt className="text-muted-foreground">Amount</dt>
                <dd>{data.creditReservation.rcAmount} RC</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="capitalize">{data.creditReservation.status}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Settled</dt>
                <dd>{data.creditReservation.settledAt ? formatDateTime(data.creditReservation.settledAt) : '—'}</dd>
              </div>
            </dl>
            {data.creditReservation.packs.length > 0 && (
              <div className="rounded border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Pack</th>
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">RC Deducted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.creditReservation.packs.map((p) => (
                      <tr key={p.packId} className="border-b border-border last:border-0">
                        <td className="px-3 py-1.5">{p.packName}</td>
                        <td className="px-3 py-1.5">{p.rcDeducted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
