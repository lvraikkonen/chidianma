import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HookHarness } from "./helpers/hookHarness";
import { App } from "../src/app/App";
import { AppShell } from "../src/components/AppShell";
import { LoginPage } from "../src/pages/LoginPage";
import { StatusPanel } from "../src/components/StatusPanel";
import { AdminApiError } from "../src/api";
import * as groupsClient from "../src/clients/groups";
import { readAdminSession, writeAdminSession } from "../src/sessionStore";

vi.mock("react", async (original) => {
  const real = await original<typeof import("react")>();
  const { harnessHooks } = await import("./helpers/hookHarness");
  return { ...real, ...harnessHooks(real) };
});
vi.mock("../src/clients/groups", () => ({
  createGroup: vi.fn(), createIdentity: vi.fn(), createIdentityLinkCode: vi.fn(), joinGroup: vi.fn(),
  listGroups: vi.fn(), redeemIdentityLinkCode: vi.fn(), refreshIdentitySession: vi.fn(), refreshGroupSession: vi.fn(), resetIdentitySessions: vi.fn()
}));
vi.mock("../src/clients/restaurants", () => ({ listRestaurants: vi.fn().mockResolvedValue({ restaurants: [] }), createRecommendation: vi.fn(), createRestaurant: vi.fn(), patchRecommendation: vi.fn(), patchRestaurant: vi.fn() }));
const groups = ["group-1", "group-2", "group-3"].map((groupId) => ({ groupId, membershipId: `member-${groupId}`, name: groupId, role: "admin" as const }));
let identityId = "identity-1";
let failedFlights: Array<() => void> = [];
async function failSwitch() { failedFlights.shift()!(); await harness.flush(); }
let routeListener: (() => void) | undefined;
let harness: HookHarness<ReactNode>;
function elements(node: ReactNode): Array<ReactElement<Record<string, any>>> {
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<Record<string, any>>;
  return [element, ...Children.toArray(element.props.children).flatMap(elements)];
}
function destinationStatus() { return elements(harness.tree).find((e) => e.type === StatusPanel)!; }
function attempts(target = "group-2") { return vi.mocked(groupsClient.refreshGroupSession).mock.calls.filter((call) => call[1] === target).length; }
function navigate(hash: string) { window.location.hash = hash; routeListener?.(); }
beforeEach(() => {
  identityId = "identity-1";
  failedFlights = [];
  vi.resetAllMocks();
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    location: { hash: "#restaurants?groupId=group-2&mode=bulk" },
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
    addEventListener: (_name: string, listener: () => void) => { routeListener = listener; }, removeEventListener: () => { routeListener = undefined; }
  });
  writeAdminSession({ version: 2, apiBaseUrl: "", identityId, identityToken: "identity-token", activeGroupId: "group-1", sessionsByGroupId: { "group-1": { token: "session-1" } }, groupSummariesById: Object.fromEntries(groups.map((g) => [g.groupId, g])) });
  vi.mocked(groupsClient.refreshIdentitySession).mockImplementation(async () => ({ identityId, identityToken: "identity-token", identityTokenExpiresAt: "2027-01-01", displayName: "用户" }));
  vi.mocked(groupsClient.listGroups).mockResolvedValue({ groups });
  vi.mocked(groupsClient.refreshGroupSession).mockImplementation(async (_c, target) => {
    if (target !== "group-1") await new Promise<void>((_resolve, reject) => { failedFlights.push(() => reject(new AdminApiError({ kind: "http", status: 403, code: "removed_member" }))); });
    return { group: groups[0]!, identityToken: "identity-token", identityTokenExpiresAt: "2027-01-01", groupSessionToken: "session-1", groupSessionTokenExpiresAt: "2027-01-01" };
  });
  harness = new HookHarness<ReactNode>(App);
});
afterEach(() => { harness.unmount(); vi.unstubAllGlobals(); });

describe("App restaurant destination effect with the real auth controller", () => {
  it("stops after a failed switch, renders a terminal error and switches only after explicit retry", async () => {
    await harness.flush();
    expect(attempts()).toBe(1);
    await failSwitch();
    expect(attempts()).toBe(1);
    expect(renderToStaticMarkup(destinationStatus())).toContain("切换小组失败");
    await harness.flush(); expect(attempts()).toBe(1);
    const retry = destinationStatus().props.action;
    expect(retry.props.children).toContain("重试");
    await retry.props.onClick(); await harness.flush();
    expect(attempts()).toBe(2);
    await failSwitch();
    expect(attempts()).toBe(2);
    expect(readAdminSession().activeGroupId).toBe("group-1");
  });

  it("resets the attempt on destination changes and identity replacement", async () => {
    await harness.flush(); await failSwitch(); expect(attempts()).toBe(1);
    navigate("#restaurants?groupId=group-3&mode=bulk"); await harness.flush();
    await failSwitch(); expect(attempts("group-3")).toBe(1);
    navigate("#restaurants?groupId=group-2&mode=bulk"); await harness.flush();
    await failSwitch(); expect(attempts()).toBe(2);
    const shell = elements(harness.tree).find((e) => e.type === AppShell)!;
    await shell.props.onDisconnect(); await harness.flush();
    identityId = "identity-2";
    vi.mocked(groupsClient.createIdentity).mockResolvedValue({ identityId, identityToken: "second-token", identityTokenExpiresAt: "2027-01-01", displayName: "另一人" });
    const login = elements(harness.tree).find((e) => e.type === LoginPage)!;
    await login.props.onCreateIdentity("另一人"); await harness.flush();
    await failSwitch(); expect(attempts()).toBe(3);
    expect(renderToStaticMarkup(destinationStatus())).toContain("切换小组失败");
  });
});
