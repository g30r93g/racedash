import { pgTable, uuid, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { creditReservations } from './credit-reservations'
import { creditPacks } from './credit-packs'

export const creditReservationPacks = pgTable(
  'credit_reservation_packs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reservationId: uuid('reservation_id')
      .references(() => creditReservations.id)
      .notNull(),
    packId: uuid('pack_id')
      .references(() => creditPacks.id)
      .notNull(),
    rcDeducted: integer('rc_deducted').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('credit_reservation_packs_reservation_id_idx').on(table.reservationId)],
)
