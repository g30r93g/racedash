'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'

const STATUS_OPTIONS = [
  { label: 'Uploading', value: 'uploading' },
  { label: 'Queued', value: 'queued' },
  { label: 'Rendering', value: 'rendering' },
  { label: 'Compositing', value: 'compositing' },
  { label: 'Complete', value: 'complete' },
  { label: 'Failed', value: 'failed' },
]

interface JobFilterFormProps {
  initialStatuses: string[]
  initialRange: string
}

export function JobFilterForm({ initialStatuses, initialRange }: JobFilterFormProps) {
  const router = useRouter()
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(initialStatuses)
  const [range, setRange] = useState(initialRange)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (selectedStatuses.length > 0) {
      params.set('status', selectedStatuses.join(','))
    }
    if (range) {
      params.set('range', range)
    }
    const qs = params.toString()
    router.push(`/jobs${qs ? `?${qs}` : ''}`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3 mb-4 items-start">
      <div className="w-64">
        <MultiSelect
          options={STATUS_OPTIONS}
          value={selectedStatuses}
          onChange={setSelectedStatuses}
          placeholder="All Statuses"
        />
      </div>
      <Select value={range} onValueChange={(v) => v && setRange(v)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7d">Last 7 days</SelectItem>
          <SelectItem value="30d">Last 30 days</SelectItem>
          <SelectItem value="all">All time</SelectItem>
        </SelectContent>
      </Select>
      <Button type="submit">Filter</Button>
    </form>
  )
}
