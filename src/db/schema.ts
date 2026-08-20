import {
  pgTable, text, integer, boolean, timestamp, date, numeric,
  pgEnum, uniqueIndex, index, primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@/lib/id";

export const roleEnum = pgEnum("role", ["ADMIN", "MEMBER"]);
export const reportStatusEnum = pgEnum("report_status", [
  "DRAFT", "SUBMITTED", "APPROVED", "REJECTED",
]);
/** WORK = ngày làm việc, PUBLIC_OFF = 公休, SUB_OFF = 代休, HOLIDAY_WORK = 公出 */
export const dayTypeEnum = pgEnum("day_type", [
  "WORK", "PUBLIC_OFF", "SUB_OFF", "HOLIDAY_WORK",
]);

/* ─────────────────────────── Master ─────────────────────────── */

/** 会社名 */
export const companies = pgTable("companies", {
  id: text("id").primaryKey().$defaultFn(createId),
  code: text("code").notNull().unique(),      // 会社コード  (10000)
  name: text("name").notNull(),               // 会社名      (FPTジャパン)
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** PJ master */
export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    systemCode: text("system_code").notNull(),   // CD           (10000)
    systemName: text("system_name").notNull(),   // システム名称  (Yokogawa)
    code: text("code").notNull().unique(),       // PJCD         (10000)
    name: text("name").notNull(),                // プロジェクト名称 (Rep Portal)
    startDate: date("start_date"),
    endDate: date("end_date"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("projects_active_idx").on(t.isActive)],
);

/** Member được assign vào project nào */
export const projectAssignments = pgTable(
  "project_assignments",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("project_assignments_unique").on(t.userId, t.projectId),
    index("project_assignments_user_idx").on(t.userId),
  ],
);

/** 工種 master */
export const workTypes = pgTable(
  "work_types",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    code: text("code").notNull().unique(),   // 30102
    name: text("name").notNull(),            // 製造：コーディング
    note: text("note"),                      // 補足説明
    category: text("category").notNull(),    // 製造
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [index("work_types_active_idx").on(t.isActive)],
);

/* ─────────────────────────── Users ─────────────────────────── */

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),          // 氏名 — in ra Excel
    displayName: text("display_name"),              // ThienLN1 — dùng đặt tên file
    employeeCode: text("employee_code"),            // 支払先コード
    roleTitle: text("role_title"),                  // Front SE / BA / PM ...
    location: text("location"),                     // 日本 / ベトナム
    billingUnitPrice: numeric("billing_unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
    billingFactor: numeric("billing_factor", { precision: 6, scale: 2 }).notNull().default("1"),
    role: roleEnum("role").notNull().default("MEMBER"),
    isActive: boolean("is_active").notNull().default(true),
    mustChangePw: boolean("must_change_pw").notNull().default(true),
    companyId: text("company_id").references(() => companies.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("users_active_idx").on(t.isActive)],
);

/* ─────────────────────────── Budget ─────────────────────────── */

/** Budget giờ theo member × project × tháng */
export const budgets = pgTable(
  "budgets",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    hours: numeric("hours", { precision: 7, scale: 2 }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("budgets_unique").on(t.userId, t.projectId, t.year, t.month),
    index("budgets_period_idx").on(t.year, t.month),
  ],
);

/* ─────────────────────── Nhập liệu hằng ngày ─────────────────────── */

/** 始業 / 終業 / 休憩・外出時間 của một ngày */
export const dayLogs = pgTable(
  "day_logs",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    startMin: integer("start_min"),                     // 09:00 -> 540
    endMin: integer("end_min"),                         // 19:00 -> 1140
    breakMin: integer("break_min").notNull().default(60),
    dayType: dayTypeEnum("day_type").notNull().default("WORK"),
    leaveNote: text("leave_note"),                      // 有給休暇 / 全休 / 午前休 / 遅刻30分 ...
    remark: text("remark"),                             // 備考
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("day_logs_unique").on(t.userId, t.date),
    index("day_logs_date_idx").on(t.date),
  ],
);

/** Một dòng công việc: ngày × project × 工種 × số giờ */
export const timeEntries = pgTable(
  "time_entries",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    projectId: text("project_id").notNull().references(() => projects.id),
    workTypeId: text("work_type_id").notNull().references(() => workTypes.id),
    description: text("description").notNull().default(""),   // 主な作業内容
    hours: numeric("hours", { precision: 5, scale: 2 }).notNull(),
    isPlan: boolean("is_plan").notNull().default(false),      // false = 実績, true = 予定
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("time_entries_user_date_idx").on(t.userId, t.date),
    index("time_entries_date_idx").on(t.date),
  ],
);

/* ─────────────────────── Chốt sổ theo tháng ─────────────────────── */

export const monthlyReports = pgTable(
  "monthly_reports",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    status: reportStatusEnum("status").notNull().default("DRAFT"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewerId: text("reviewer_id"),
    reviewNote: text("review_note"),
    memberNote: text("member_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("monthly_reports_unique").on(t.userId, t.year, t.month),
    index("monthly_reports_period_idx").on(t.year, t.month, t.status),
  ],
);

/** Cấu hình theo tháng: 所定日数 */
export const monthSettings = pgTable(
  "month_settings",
  {
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    workingDays: integer("working_days").notNull().default(0),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.year, t.month] })],
);

/** Ngày nghỉ lễ — đổ vào cột 公休 của 勤務報告書 */
export const holidays = pgTable("holidays", {
  id: text("id").primaryKey().$defaultFn(createId),
  date: date("date").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull().default("公休"),
});

/** Thông tin cố định in trên 勤務報告書 */
export const orgSettings = pgTable("org_settings", {
  id: text("id").primaryKey().default("default"),
  clientCompany: text("client_company").notNull().default("横河ソリューションサービス株式会社"),
  orgUnit: text("org_unit").notNull().default("SI　開発部"),
  workplace: text("workplace").notNull().default("〒105-0011東京都港区芝公園1丁目7-6"),
  workName: text("work_name").notNull().default("YOKO Portal 開発"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    target: text("target"),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt)],
);

/* ─────────────────────────── Relations ─────────────────────────── */

export const usersRelations = relations(users, ({ one, many }) => ({
  company: one(companies, { fields: [users.companyId], references: [companies.id] }),
  budgets: many(budgets),
  dayLogs: many(dayLogs),
  entries: many(timeEntries),
  reports: many(monthlyReports),
  projectAssignments: many(projectAssignments),
}));

export const projectAssignmentsRelations = relations(projectAssignments, ({ one }) => ({
  user: one(users, { fields: [projectAssignments.userId], references: [users.id] }),
  project: one(projects, { fields: [projectAssignments.projectId], references: [projects.id] }),
}));

export const projectsRelations = relations(projects, ({ many }) => ({
  assignments: many(projectAssignments),
}));

export const budgetsRelations = relations(budgets, ({ one }) => ({
  user: one(users, { fields: [budgets.userId], references: [users.id] }),
  project: one(projects, { fields: [budgets.projectId], references: [projects.id] }),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  user: one(users, { fields: [timeEntries.userId], references: [users.id] }),
  project: one(projects, { fields: [timeEntries.projectId], references: [projects.id] }),
  workType: one(workTypes, { fields: [timeEntries.workTypeId], references: [workTypes.id] }),
}));

export const dayLogsRelations = relations(dayLogs, ({ one }) => ({
  user: one(users, { fields: [dayLogs.userId], references: [users.id] }),
}));

export const monthlyReportsRelations = relations(monthlyReports, ({ one }) => ({
  user: one(users, { fields: [monthlyReports.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectAssignment = typeof projectAssignments.$inferSelect;
export type WorkType = typeof workTypes.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type DayLog = typeof dayLogs.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type MonthlyReport = typeof monthlyReports.$inferSelect;
