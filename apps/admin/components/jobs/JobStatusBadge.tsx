import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<string, string> = {
  uploading: 'bg-blue-100 text-blue-700',
  queued: 'bg-amber-100 text-amber-700',
  rendering: 'bg-purple-100 text-purple-700',
  compositing: 'bg-indigo-100 text-indigo-700',
  complete: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

const STATUS_LABELS: Record<string, string> = {
  uploading: 'Uploading',
  queued: 'Queued',
  rendering: 'Rendering',
  compositing: 'Compositing',
  complete: 'Complete',
  failed: 'Failed',
}

export function JobStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700',
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
