import type { Prisma, PrismaClient } from "@prisma/client";
import {
  DEFAULT_GROUP_SCORING_WEIGHTS,
  LUNCH_HEADLINE,
  type GroupRole,
  type GroupSettingsResponse,
  type MemberContributionSummary,
  type MembersResponse,
  type MembershipStatus,
  type PatchGroupSettingsRequest,
  type RotateInviteCodeResponse,
  type ScoringWeightsSnapshot
} from "@lunch/shared";
import type { AppEnv } from "../../env.js";
import { assertValidOfficeTimezone, getOfficeCalendarWindows } from "../dates.js";
import { generateInviteCode, hashInviteCode } from "./inviteCodes.js";

export class GroupOperationsNotFoundError extends Error {
  constructor(public readonly groupId: string) {
    super("Group not found");
    this.name = "GroupOperationsNotFoundError";
  }
}

export class GroupSettingsValidationError extends Error {
  constructor(public readonly error: string, message: string) {
    super(message);
    this.name = "GroupSettingsValidationError";
  }
}

interface SettingsGroupRecord {
  id: string;
  name: string;
  subtitle: string | null;
  officeTimezone: string;
  officeCity: string;
  officeLatitude: number;
  officeLongitude: number;
  inviteCodeVersion: number;
  inviteCodeRotatedAt: Date;
}

interface ReminderRecord {
  reminderTime: string;
  weekdayReminderEnabled: boolean;
  secondReminderEnabled: boolean;
  notificationTitle: string;
  notificationGroupLabel: string | null;
}

interface WeightRecord extends ScoringWeightsSnapshot {}

export function buildGroupSettingsResponse(input: {
  group: SettingsGroupRecord;
  settings: ReminderRecord | null;
  weights: WeightRecord | null;
}): GroupSettingsResponse {
  return {
    groupId: input.group.id,
    group: {
      name: input.group.name,
      ...(input.group.subtitle ? { subtitle: input.group.subtitle } : {}),
      officeTimezone: input.group.officeTimezone,
      officeCity: input.group.officeCity,
      officeLatitude: input.group.officeLatitude,
      officeLongitude: input.group.officeLongitude
    },
    reminder: input.settings ? {
      reminderTime: input.settings.reminderTime,
      weekdayReminderEnabled: input.settings.weekdayReminderEnabled,
      secondReminderEnabled: input.settings.secondReminderEnabled,
      notificationTitle: input.settings.notificationTitle,
      ...(input.settings.notificationGroupLabel
        ? { notificationGroupLabel: input.settings.notificationGroupLabel }
        : {})
    } : {
      reminderTime: "11:30",
      weekdayReminderEnabled: true,
      secondReminderEnabled: false,
      notificationTitle: LUNCH_HEADLINE,
      notificationGroupLabel: input.group.name
    },
    scoringWeights: input.weights ? {
      weekdayMatch: input.weights.weekdayMatch,
      weatherMatch: input.weights.weatherMatch,
      distance: input.weights.distance,
      teammateRecommendation: input.weights.teammateRecommendation,
      recentDuplicatePenalty: input.weights.recentDuplicatePenalty,
      negativeFeedbackPenalty: input.weights.negativeFeedbackPenalty
    } : { ...DEFAULT_GROUP_SCORING_WEIGHTS },
    invite: {
      version: input.group.inviteCodeVersion,
      rotatedAt: input.group.inviteCodeRotatedAt.toISOString()
    }
  };
}

export function parseGroupSettingsPatch(body: unknown): PatchGroupSettingsRequest {
  const root = requireRecord(body, "Settings request must be an object");
  rejectUnknownFields(root, ["group", "reminder", "scoringWeights"]);
  if (!("group" in root) && !("reminder" in root) && !("scoringWeights" in root)) {
    invalid("Settings request must include at least one section");
  }
  const result: PatchGroupSettingsRequest = {};
  if ("group" in root) result.group = parseGroupPatch(root.group);
  if ("reminder" in root) result.reminder = parseReminderPatch(root.reminder);
  if ("scoringWeights" in root) result.scoringWeights = parseWeightsPatch(root.scoringWeights);
  return result;
}

function parseGroupPatch(value: unknown): NonNullable<PatchGroupSettingsRequest["group"]> {
  const record = requireRecord(value, "group must be an object");
  const allowed = ["name", "subtitle", "officeTimezone", "officeCity", "officeLatitude", "officeLongitude"];
  rejectUnknownFields(record, allowed);
  requireNonEmptySection(record, "group");
  const result: NonNullable<PatchGroupSettingsRequest["group"]> = {};
  if ("name" in record) result.name = nonEmptyString(record.name, "name");
  if ("subtitle" in record) {
    if (record.subtitle === null) result.subtitle = null;
    else result.subtitle = nonEmptyString(record.subtitle, "subtitle", "subtitle must be a string or null");
  }
  if ("officeTimezone" in record) {
    const timezone = nonEmptyString(record.officeTimezone, "officeTimezone");
    try {
      assertValidOfficeTimezone(timezone);
    } catch {
      invalid("officeTimezone must be a valid IANA timezone");
    }
    result.officeTimezone = timezone;
  }
  if ("officeCity" in record) result.officeCity = nonEmptyString(record.officeCity, "officeCity");
  if ("officeLatitude" in record) {
    result.officeLatitude = boundedNumber(record.officeLatitude, -90, 90, "latitude");
  }
  if ("officeLongitude" in record) {
    result.officeLongitude = boundedNumber(record.officeLongitude, -180, 180, "longitude");
  }
  return result;
}

function parseReminderPatch(value: unknown): NonNullable<PatchGroupSettingsRequest["reminder"]> {
  const record = requireRecord(value, "reminder must be an object");
  const allowed = [
    "reminderTime",
    "weekdayReminderEnabled",
    "secondReminderEnabled",
    "notificationTitle",
    "notificationGroupLabel"
  ];
  rejectUnknownFields(record, allowed);
  requireNonEmptySection(record, "reminder");
  const result: NonNullable<PatchGroupSettingsRequest["reminder"]> = {};
  if ("reminderTime" in record) {
    if (typeof record.reminderTime !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(record.reminderTime)) {
      invalid("reminderTime must use strict HH:mm format");
    }
    result.reminderTime = record.reminderTime;
  }
  for (const key of ["weekdayReminderEnabled", "secondReminderEnabled"] as const) {
    if (key in record) {
      if (typeof record[key] !== "boolean") invalid(`${key} must be a boolean`);
      result[key] = record[key];
    }
  }
  if ("notificationTitle" in record) {
    result.notificationTitle = nonEmptyString(record.notificationTitle, "notificationTitle");
  }
  if ("notificationGroupLabel" in record) {
    if (record.notificationGroupLabel === null) result.notificationGroupLabel = null;
    else result.notificationGroupLabel = nonEmptyString(
      record.notificationGroupLabel,
      "notificationGroupLabel",
      "notificationGroupLabel must be a string or null"
    );
  }
  return result;
}

function parseWeightsPatch(value: unknown): Partial<ScoringWeightsSnapshot> {
  const record = requireRecord(value, "scoringWeights must be an object");
  const keys = Object.keys(DEFAULT_GROUP_SCORING_WEIGHTS) as Array<keyof ScoringWeightsSnapshot>;
  rejectUnknownFields(record, keys);
  requireNonEmptySection(record, "scoringWeights");
  const result: Partial<ScoringWeightsSnapshot> = {};
  for (const key of keys) {
    if (key in record) {
      const weight = record[key];
      if (!Number.isInteger(weight) || (weight as number) < 0 || (weight as number) > 100) {
        invalid(`${key} must be an integer from 0 to 100`);
      }
      result[key] = weight as number;
    }
  }
  return result;
}

export async function getGroupSettings(input: {
  prisma: PrismaClient | Prisma.TransactionClient;
  groupId: string;
}): Promise<GroupSettingsResponse> {
  const [group, settings, weights] = await Promise.all([
    input.prisma.lunchGroup.findUnique({ where: { id: input.groupId } }),
    input.prisma.groupSettings.findUnique({ where: { groupId: input.groupId } }),
    input.prisma.scoringWeights.findUnique({ where: { groupId: input.groupId } })
  ]);
  if (!group) throw new GroupOperationsNotFoundError(input.groupId);
  return buildGroupSettingsResponse({ group, settings, weights });
}

export async function patchGroupSettings(input: {
  prisma: PrismaClient;
  groupId: string;
  patch: PatchGroupSettingsRequest;
}): Promise<GroupSettingsResponse> {
  return input.prisma.$transaction(async (tx) => {
    const existingGroup = await tx.lunchGroup.findUnique({ where: { id: input.groupId } });
    if (!existingGroup) throw new GroupOperationsNotFoundError(input.groupId);
    if (input.patch.group) {
      const groupData = input.patch.group as Prisma.LunchGroupUpdateInput;
      await tx.lunchGroup.update({ where: { id: input.groupId }, data: groupData });
    }
    if (input.patch.reminder) {
      const reminderData = input.patch.reminder as Prisma.GroupSettingsUncheckedUpdateInput;
      await tx.groupSettings.upsert({
        where: { groupId: input.groupId },
        create: {
          groupId: input.groupId,
          notificationGroupLabel: input.patch.group?.name ?? existingGroup.name,
          ...reminderData
        } as Prisma.GroupSettingsUncheckedCreateInput,
        update: reminderData
      });
    }
    if (input.patch.scoringWeights) {
      await tx.scoringWeights.upsert({
        where: { groupId: input.groupId },
        create: {
          groupId: input.groupId,
          ...DEFAULT_GROUP_SCORING_WEIGHTS,
          ...input.patch.scoringWeights
        },
        update: input.patch.scoringWeights
      });
    }
    return getGroupSettings({ prisma: tx, groupId: input.groupId });
  });
}

interface MemberRecord {
  id: string;
  displayName: string;
  role: GroupRole;
  status: MembershipStatus;
  joinedAt: Date;
  removedAt: Date | null;
}

export function buildMembersResponse(input: {
  groupId: string;
  window: { startAt: Date; endAt: Date };
  memberships: MemberRecord[];
  restaurants: Array<{ createdByMembershipId: string | null }>;
  recommendations: Array<{ createdByMembershipId: string | null }>;
  feedback: Array<{ membershipId: string | null }>;
}): MembersResponse {
  const contributionFor = (membershipId: string): MemberContributionSummary => {
    const restaurantCount = input.restaurants.filter((item) => item.createdByMembershipId === membershipId).length;
    const recommendationCount = input.recommendations.filter((item) => item.createdByMembershipId === membershipId).length;
    const feedbackCount = input.feedback.filter((item) => item.membershipId === membershipId).length;
    return {
      restaurantCount,
      recommendationCount,
      feedbackCount,
      total: restaurantCount + recommendationCount + feedbackCount
    };
  };
  return {
    groupId: input.groupId,
    contributionWindow: {
      startAt: input.window.startAt.toISOString(),
      endAt: input.window.endAt.toISOString()
    },
    members: [...input.memberships]
      .sort((left, right) => Number(left.status === "removed") - Number(right.status === "removed")
        || left.joinedAt.getTime() - right.joinedAt.getTime())
      .map((membership) => ({
        membershipId: membership.id,
        displayName: membership.displayName,
        role: membership.role,
        status: membership.status,
        joinedAt: membership.joinedAt.toISOString(),
        ...(membership.removedAt ? { removedAt: membership.removedAt.toISOString() } : {}),
        contribution: contributionFor(membership.id)
      }))
  };
}

export async function getGroupMembers(input: {
  prisma: PrismaClient | Prisma.TransactionClient;
  groupId: string;
  now?: Date | undefined;
}): Promise<MembersResponse> {
  const group = await input.prisma.lunchGroup.findUnique({ where: { id: input.groupId } });
  if (!group) throw new GroupOperationsNotFoundError(input.groupId);
  const window = getOfficeCalendarWindows(input.now ?? new Date(), group.officeTimezone).currentMonthUtc;
  const createdAt = { gte: window.startAt, lt: window.endAt };
  const [memberships, restaurants, recommendations, feedback] = await Promise.all([
    input.prisma.groupMembership.findMany({
      where: { groupId: input.groupId },
      include: { identity: true }
    }),
    input.prisma.restaurant.findMany({
      where: { groupId: input.groupId, createdAt },
      select: { createdByMembershipId: true }
    }),
    input.prisma.recommendation.findMany({
      where: { groupId: input.groupId, createdAt },
      select: { createdByMembershipId: true }
    }),
    input.prisma.feedback.findMany({
      where: { groupId: input.groupId, createdAt, membershipId: { not: null } },
      select: { membershipId: true }
    })
  ]);
  return buildMembersResponse({
    groupId: input.groupId,
    window,
    memberships: memberships.map((membership) => ({
      id: membership.id,
      displayName: membership.identity.displayName,
      role: membership.role,
      status: membership.status,
      joinedAt: membership.joinedAt,
      removedAt: membership.removedAt
    })),
    restaurants,
    recommendations,
    feedback
  });
}

export async function rotateGroupInviteCode(input: {
  prisma: PrismaClient;
  env: AppEnv;
  groupId: string;
  now?: Date | undefined;
}): Promise<RotateInviteCodeResponse> {
  const inviteCode = generateInviteCode();
  const rotatedAt = input.now ?? new Date();
  return input.prisma.$transaction(async (tx) => {
    const updated = await tx.lunchGroup.updateMany({
      where: { id: input.groupId },
      data: {
        inviteCodeHash: hashInviteCode(inviteCode, input.env.SESSION_SECRET),
        inviteCodeVersion: { increment: 1 },
        inviteCodeRotatedAt: rotatedAt
      }
    });
    if (updated.count === 0) throw new GroupOperationsNotFoundError(input.groupId);
    const group = await tx.lunchGroup.findUnique({ where: { id: input.groupId } });
    if (!group) throw new GroupOperationsNotFoundError(input.groupId);
    return {
      groupId: input.groupId,
      inviteCode,
      version: group.inviteCodeVersion,
      rotatedAt: group.inviteCodeRotatedAt.toISOString()
    };
  });
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(message);
  return value as Record<string, unknown>;
}

function rejectUnknownFields(record: Record<string, unknown>, allowed: readonly string[]) {
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown) invalid(`unknown field: ${unknown}`);
}

function requireNonEmptySection(record: Record<string, unknown>, name: string) {
  if (Object.keys(record).length === 0) invalid(`${name} must include at least one field`);
}

function nonEmptyString(value: unknown, field: string, typeMessage?: string): string {
  if (typeof value !== "string") invalid(typeMessage ?? `${field} must be a non-empty string`);
  const trimmed = value.trim();
  if (!trimmed) invalid(`${field} must be a non-empty string`);
  return trimmed;
}

function boundedNumber(value: unknown, minimum: number, maximum: number, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    invalid(`${field} must be a finite number from ${minimum} to ${maximum}`);
  }
  return value;
}

function invalid(message: string): never {
  throw new GroupSettingsValidationError("invalid_settings_request", message);
}
