import { FastifyPluginAsync } from 'fastify'
import { eq, sql, and, gte } from 'drizzle-orm'
import { jobs, users } from '@racedash/db'
import { getDb } from '../../lib/db'
import type { AdminOverviewResponse } from '../../types'

const statsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: AdminOverviewResponse }>('/api/admin/stats/overview', async () => {
    const db = getDb()

    const now = new Date()
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // In-flight counts by status
    const inFlightRows = await db
      .select({
        status: jobs.status,
        count: sql<number>`count(*)::int`,
      })
      .from(jobs)
      .where(sql`${jobs.status} IN ('uploading', 'queued', 'rendering', 'compositing')`)
      .groupBy(jobs.status)

    const inFlight = { uploading: 0, queued: 0, rendering: 0, compositing: 0 }
    for (const row of inFlightRows) {
      if (row.status in inFlight) {
        inFlight[row.status as keyof typeof inFlight] = row.count
      }
    }

    // Completed today
    const [completedRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.status, 'complete'), gte(jobs.updatedAt, todayStart)))

    // Failed today
    const [failedRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.status, 'failed'), gte(jobs.updatedAt, todayStart)))

    // 7-day failure rate
    const [terminalRow] = await db
      .select({
        total: sql<number>`count(*)::int`,
        failed: sql<number>`count(*) FILTER (WHERE ${jobs.status} = 'failed')::int`,
      })
      .from(jobs)
      .where(and(sql`${jobs.status} IN ('complete', 'failed')`, gte(jobs.updatedAt, sevenDaysAgo)))

    const failureRate7d = terminalRow.total > 0 ? Math.round((terminalRow.failed / terminalRow.total) * 1000) / 10 : 0

    // Recent 10 failed jobs
    const recentFailed = await db
      .select({
        id: jobs.id,
        userEmail: users.email,
        errorMessage: jobs.errorMessage,
        failedAt: jobs.updatedAt,
      })
      .from(jobs)
      .innerJoin(users, eq(jobs.userId, users.id))
      .where(eq(jobs.status, 'failed'))
      .orderBy(sql`${jobs.updatedAt} DESC`)
      .limit(10)

    return {
      inFlight,
      completedToday: completedRow.count,
      failedToday: failedRow.count,
      failureRate7d,
      recentFailedJobs: recentFailed.map((j) => ({
        id: j.id,
        userEmail: j.userEmail,
        errorMessage: j.errorMessage,
        failedAt: j.failedAt.toISOString(),
      })),
    }
  })
}

export default statsRoutes
