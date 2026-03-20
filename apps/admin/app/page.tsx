import { adminFetch } from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { RefreshButton } from '@/components/layout/RefreshButton'
import { MetricCard } from '@/components/overview/MetricCard'
import { RecentFailedJobsTable } from '@/components/overview/RecentFailedJobsTable'

interface OverviewData {
  inFlight: { uploading: number; queued: number; rendering: number; compositing: number }
  completedToday: number
  failedToday: number
  failureRate7d: number
  recentFailedJobs: Array<{
    id: string
    userEmail: string
    errorMessage: string | null
    failedAt: string
  }>
}

export default async function OverviewPage() {
  const data = await adminFetch<OverviewData>('/api/admin/stats/overview')

  return (
    <div>
      <PageHeader title="Overview" actions={<RefreshButton />} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <MetricCard label="Uploading" value={data.inFlight.uploading} />
        <MetricCard label="Queued" value={data.inFlight.queued} />
        <MetricCard label="Rendering" value={data.inFlight.rendering} />
        <MetricCard label="Compositing" value={data.inFlight.compositing} />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <MetricCard label="Completed Today" value={data.completedToday} />
        <MetricCard label="Failed Today" value={data.failedToday} />
        <MetricCard label="7d Failure Rate" value={data.failureRate7d} suffix="%" />
      </div>

      <h2 className="text-lg font-semibold mb-3">Recent Failed Jobs</h2>
      <RecentFailedJobsTable jobs={data.recentFailedJobs} />
    </div>
  )
}
