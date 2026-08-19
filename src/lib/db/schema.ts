import { pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Base schema definitions - Full functional entities will be implemented in Database Phase
export const systemCheck = pgTable("system_check", {
  id: varchar("id", { length: 36 }).primaryKey(),
  status: varchar("status", { length: 20 }).notNull().default("ok"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
});
