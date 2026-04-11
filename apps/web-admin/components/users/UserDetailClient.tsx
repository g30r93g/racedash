'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IssueLicenseDialog } from './IssueLicenseDialog'
import { ExtendLicenseDialog } from './ExtendLicenseDialog'
import { RevokeLicenseDialog } from './RevokeLicenseDialog'
import { CreditAdjustmentForm } from './CreditAdjustmentForm'
import { JobStatusBadge } from '@/components/jobs/JobStatusBadge'
import { formatDate, formatDateTime } from '@/lib/utils'
import Link from 'next/link'

interface License {
  id: string
  tier: string
  status: string
  stripeSubscriptionId: string | null
  startsAt: string
  expiresAt: string
  createdAt: string
  updatedAt: string
}

interface CreditPack {
  id: string
  packName: string
  rcTotal: number
  rcRemaining: number
  priceGbp: string
  purchasedAt: string
  expiresAt: string
}

interface RecentJob {
  id: string
  status: string
  rcCost: number | null
  createdAt: string
  updatedAt: string
}

interface UserDetailData {
  user: {
    id: string
    clerkId: string
    email: string
    billingCountry: string | null
    stripeCustomerId: string | null
    createdAt: string
  }
  licenses: License[]
  totalRc: number
  creditPacks: CreditPack[]
  recentJobs: RecentJob[]
}

export function UserDetailClient({ data }: { data: UserDetailData }) {
  const router = useRouter()
  const [showIssue, setShowIssue] = useState(false)
  const [extendLicense, setExtendLicense] = useState<License | null>(null)
  const [revokeLicense, setRevokeLicense] = useState<License | null>(null)

  const activeLicense = data.licenses.find((l) => l.status === 'active')

  function refresh() {
    router.refresh()
  }

  return (
    <div className="space-y-8">
      {/* Profile */}
      <section className="rounded-lg border border-border p-5">
        <h2 className="text-sm font-semibold mb-3">Profile</h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{data.user.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Clerk ID</dt>
            <dd className="font-mono text-xs">{data.user.clerkId}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Billing Country</dt>
            <dd>{data.user.billingCountry ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Stripe Customer</dt>
            <dd className="font-mono text-xs">{data.user.stripeCustomerId ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Member Since</dt>
            <dd>{formatDate(data.user.createdAt)}</dd>
          </div>
        </dl>
      </section>

      {/* Active License */}
      <section className="rounded-lg border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Active License</h2>
          <div className="flex gap-2">
            {activeLicense && (
              <>
                <button
                  onClick={() => setExtendLicense(activeLicense)}
                  className="px-2 py-1 text-xs border border-border rounded hover:bg-secondary"
                >
                  Extend
                </button>
                <button
                  onClick={() => setRevokeLicense(activeLicense)}
                  className="px-2 py-1 text-xs border border-destructive text-destructive rounded hover:bg-destructive/10"
                >
                  Revoke
                </button>
              </>
            )}
            <button
              onClick={() => setShowIssue(true)}
              className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              Issue New License
            </button>
          </div>
        </div>

        {activeLicense ? (
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Tier</dt>
              <dd className="uppercase font-medium">{activeLicense.tier}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="capitalize">{activeLicense.status}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Expires</dt>
              <dd>{formatDate(activeLicense.expiresAt)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">No active license.</p>
        )}
      </section>

      {/* License History */}
      {data.licenses.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3">License History</h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Tier</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Starts</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Expires</th>
                </tr>
              </thead>
              <tbody>
                {data.licenses.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 uppercase">{l.tier}</td>
                    <td className="px-4 py-2 capitalize">{l.status}</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatDate(l.startsAt)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatDate(l.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Credit Packs */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-semibold">Credit Packs</h2>
          <span className="text-sm text-muted-foreground">
            {data.totalRc} RC available
          </span>
        </div>
        {data.creditPacks.length > 0 ? (
          <div className="rounded-lg border border-border overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Pack</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Total</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Left</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Expires</th>
                </tr>
              </thead>
              <tbody>
                {data.creditPacks.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{p.packName}</td>
                    <td className="px-4 py-2">{p.rcTotal}</td>
                    <td className="px-4 py-2">{p.rcRemaining}</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatDate(p.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mb-4">No credit packs.</p>
        )}

        <CreditAdjustmentForm userId={data.user.id} onSuccess={refresh} />
      </section>

      {/* Recent Jobs */}
      <section>
        <h2 className="text-sm font-semibold mb-3">Recent Jobs</h2>
        {data.recentJobs.length > 0 ? (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Job ID</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">RC Cost</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.recentJobs.map((j) => (
                  <tr key={j.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">
                      <Link href={`/jobs/${j.id}`} className="text-primary hover:underline">
                        {j.id.slice(0, 8)}...
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <JobStatusBadge status={j.status} />
                    </td>
                    <td className="px-4 py-2">{j.rcCost ?? '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatDateTime(j.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No jobs yet.</p>
        )}
      </section>

      {/* Dialogs */}
      <IssueLicenseDialog
        userId={data.user.id}
        open={showIssue}
        onClose={() => setShowIssue(false)}
        onSuccess={refresh}
      />
      {extendLicense && (
        <ExtendLicenseDialog
          userId={data.user.id}
          licenseId={extendLicense.id}
          currentExpiresAt={extendLicense.expiresAt}
          open={true}
          onClose={() => setExtendLicense(null)}
          onSuccess={refresh}
        />
      )}
      {revokeLicense && (
        <RevokeLicenseDialog
          userId={data.user.id}
          licenseId={revokeLicense.id}
          tier={revokeLicense.tier}
          open={true}
          onClose={() => setRevokeLicense(null)}
          onSuccess={refresh}
        />
      )}
    </div>
  )
}
