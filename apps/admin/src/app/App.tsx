import type {
  CreateGroupRequest,
  CreateRecommendationRequest,
  PatchRecommendationRequest,
  PatchRestaurantRequest,
  RestaurantSummary
} from "@lunch/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdminApiError } from "../api";
import {
  createGroup,
  createIdentity,
  joinGroup,
  listGroups,
  refreshGroupSession
} from "../clients/groups";
import {
  getParticipation,
  getToday,
  refreshToday,
  type AdminGroupContext
} from "../clients/today";
import {
  createRecommendation as createRestaurantRecommendation,
  createRestaurant as createRestaurantRecord,
  listRestaurants,
  patchRecommendation as patchRestaurantRecommendation,
  patchRestaurant
} from "../clients/restaurants";
import { AppShell } from "../components/AppShell";
import { GroupEntryPanel } from "../components/GroupEntryPanel";
import { StatusPanel } from "../components/StatusPanel";
import {
  createAuthController,
  isMembershipInvalid,
  type AuthViewState
} from "../features/auth/authModel";
import {
  createRestaurantEntryController,
  type CreateRestaurantEntryInput,
  type RestaurantEntryState
} from "../features/restaurants/restaurantModel";
import {
  loadTodayView,
  refreshTodayView,
  type TodayDependencies,
  type TodayViewState
} from "../features/today/todayModel";
import { LoginPage } from "../pages/LoginPage";
import { RestaurantsPage } from "../pages/RestaurantsPage";
import { TodayPage } from "../pages/TodayPage";
import {
  clearGroupSession,
  disconnectAdmin,
  readAdminSession,
  saveGroupSession,
  saveIdentity,
  syncGroups
} from "../sessionStore";
import { createRequestGate } from "./requestGate";
import {
  navigate,
  parseAdminRoute,
  subscribeRoute,
  type AdminRoute
} from "./router";

export function App() {
  const [authState, setAuthState] = useState<AuthViewState>({ kind: "loading" });
  const [route, setRoute] = useState<AdminRoute>(() => (
    parseAdminRoute(window.location.hash)
  ));
  const [groupEntryOpen, setGroupEntryOpen] = useState(false);
  const [todayState, setTodayState] = useState<TodayViewState>({ kind: "loading" });
  const [todayReload, setTodayReload] = useState(0);
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);
  const [restaurantsLoading, setRestaurantsLoading] = useState(false);
  const [restaurantLoadError, setRestaurantLoadError] = useState<string>();
  const [restaurantOperationError, setRestaurantOperationError] = useState<string>();
  const [restaurantEntryState, setRestaurantEntryState] = useState<RestaurantEntryState>({ kind: "idle" });
  const [restaurantReload, setRestaurantReload] = useState(0);
  const restaurantGroupId = useRef<string | undefined>(undefined);
  const restaurantEntryController = useRef<{
    controller: ReturnType<typeof createRestaurantEntryController>;
    request: number;
    groupId: string;
  } | null>(null);
  const requestGate = useRef(createRequestGate());
  const authController = useMemo(() => createAuthController({
    readSession: readAdminSession,
    saveIdentity,
    saveGroupSession,
    syncGroups,
    clearGroupSession,
    disconnectAdmin,
    createIdentity,
    createGroup,
    joinGroup,
    listGroups,
    refreshGroupSession,
    onState: setAuthState
  }), []);

  useEffect(() => {
    const unsubscribe = subscribeRoute(setRoute);
    void authController.load();
    return unsubscribe;
  }, [authController]);

  useEffect(() => {
    if (authState.kind === "authenticated" && route === "login") {
      navigate("today");
    }
    if ((authState.kind === "identity-entry" || authState.kind === "group-entry")
      && route !== "login") {
      navigate("login");
    }
  }, [authState.kind, route]);

  const connectedState = authState.kind === "authenticated" || authState.kind === "switching"
    ? authState
    : null;
  const activeGroupId = connectedState?.session.activeGroupId;
  const activeGroupSession = activeGroupId
    ? connectedState?.session.sessionsByGroupId[activeGroupId]
    : undefined;
  const groupContext: AdminGroupContext | null = activeGroupId && activeGroupSession
    ? {
        apiBaseUrl: connectedState.session.apiBaseUrl,
        groupId: activeGroupId,
        token: activeGroupSession.token
      }
    : null;
  const activeGroup = activeGroupId
    ? connectedState?.groups.find((group) => group.groupId === activeGroupId)
    : undefined;

  useEffect(() => {
    if (route !== "today" || !groupContext) return;
    const request = requestGate.current.begin();
    setTodayState({ kind: "loading" });
    void loadTodayView(todayDependencies(groupContext)).then((next) => {
      if (requestGate.current.isCurrent(request)) setTodayState(next);
    });
    return () => requestGate.current.invalidate();
  }, [route, groupContext?.groupId, groupContext?.token, todayReload]);

  useEffect(() => {
    if (!groupContext) return;
    if (todayState.kind === "session-expired") {
      void authController.handleGroupError(new AdminApiError({
        kind: "http",
        status: 401,
        code: "invalid_session"
      }), groupContext.groupId);
    }
    if (todayState.kind === "forbidden") {
      void authController.handleGroupError(new AdminApiError({
        kind: "http",
        status: 403,
        code: "removed_member"
      }), groupContext.groupId);
    }
  }, [authController, groupContext?.groupId, todayState.kind]);

  useEffect(() => {
    if (route !== "restaurants" || !groupContext) return;
    const context = { ...groupContext };
    const request = requestGate.current.begin();
    const changedGroup = restaurantGroupId.current !== context.groupId;
    restaurantGroupId.current = context.groupId;
    if (changedGroup) {
      setRestaurants([]);
      setRestaurantEntryState({ kind: "idle" });
      restaurantEntryController.current = null;
    }
    setRestaurantsLoading(true);
    setRestaurantLoadError(undefined);
    setRestaurantOperationError(undefined);
    void listRestaurants(context).then((response) => {
      if (requestGate.current.isCurrent(request)) {
        setRestaurants(response.restaurants);
      }
    }).catch(async (error: unknown) => {
      await handleRestaurantError(error, context, request, "load");
    }).finally(() => {
      if (requestGate.current.isCurrent(request)) setRestaurantsLoading(false);
    });
    return () => requestGate.current.invalidate();
  }, [route, groupContext?.groupId, groupContext?.token, restaurantReload]);

  async function runActiveGroupMutation(operation: () => Promise<void>) {
    const before = readAdminSession().activeGroupId;
    requestGate.current.invalidate();
    clearRestaurantView();
    await operation();
    const after = readAdminSession().activeGroupId;
    if (after && after !== before) requestGate.current.invalidate();
    if (route === "restaurants" && after && after === before) {
      setRestaurantReload((value) => value + 1);
    }
  }

  async function handleCreateGroup(input: CreateGroupRequest) {
    await runActiveGroupMutation(() => authController.createGroup(input));
  }

  async function handleJoinGroup(inviteCode: string) {
    await runActiveGroupMutation(() => authController.joinGroup(inviteCode));
  }

  async function handleSwitchGroup(groupId: string) {
    await runActiveGroupMutation(() => authController.switchGroup(groupId));
  }

  function handleDisconnect() {
    requestGate.current.invalidate();
    clearRestaurantView();
    setGroupEntryOpen(false);
    authController.disconnect();
    navigate("login");
  }

  async function handleTodayRefresh() {
    if (!groupContext) return;
    const request = requestGate.current.begin();
    const next = await refreshTodayView(todayState, todayDependencies(groupContext));
    if (requestGate.current.isCurrent(request)) setTodayState(next);
  }

  async function handleRestaurantError(
    error: unknown,
    context: AdminGroupContext,
    request: number,
    target: "load" | "operation" | "entry"
  ): Promise<void> {
    if (!requestGate.current.isCurrent(request)) return;
    if (isMembershipInvalid(error)) {
      requestGate.current.invalidate();
      setRestaurants([]);
      setRestaurantsLoading(false);
      setRestaurantEntryState({ kind: "idle" });
      restaurantEntryController.current = null;
      await authController.handleGroupError(error, context.groupId);
      return;
    }
    const message = restaurantErrorMessage(error);
    if (target === "load") setRestaurantLoadError(message);
    if (target === "operation") setRestaurantOperationError(message);
  }

  function clearRestaurantView() {
    setRestaurants([]);
    setRestaurantsLoading(false);
    setRestaurantLoadError(undefined);
    setRestaurantOperationError(undefined);
    setRestaurantEntryState({ kind: "idle" });
    restaurantEntryController.current = null;
  }

  async function handleCreateRestaurantEntry(
    input: CreateRestaurantEntryInput
  ): Promise<RestaurantEntryState> {
    if (!groupContext) {
      return { kind: "restaurant-error", message: "当前小组连接不可用，请重新选择小组。" };
    }
    const context = { ...groupContext };
    const request = requestGate.current.begin();
    setRestaurantOperationError(undefined);
    setRestaurantEntryState({ kind: "submitting-restaurant" });
    const controller = createRestaurantEntryController({
      createRestaurant: async (restaurantInput) => {
        try {
          return await createRestaurantRecord(context, restaurantInput);
        } catch (error) {
          await handleRestaurantError(error, context, request, "entry");
          throw error;
        }
      },
      createRecommendation: async (recommendationInput) => {
        try {
          return await createRestaurantRecommendation(context, recommendationInput);
        } catch (error) {
          await handleRestaurantError(error, context, request, "entry");
          throw error;
        }
      }
    });
    restaurantEntryController.current = { controller, request, groupId: context.groupId };
    const next = await controller.submit(input);
    if (requestGate.current.isCurrent(request)) {
      setRestaurantEntryState(next);
      if (next.kind === "complete") setRestaurantReload((value) => value + 1);
    }
    return next;
  }

  async function handleRetryRestaurantRecommendation(): Promise<RestaurantEntryState> {
    const pendingEntry = restaurantEntryController.current;
    if (!pendingEntry
      || pendingEntry.groupId !== groupContext?.groupId
      || !requestGate.current.isCurrent(pendingEntry.request)) {
      return {
        kind: "recommendation-error",
        restaurantId: "unavailable",
        message: "重试上下文已失效，请刷新餐厅库后重新操作。"
      };
    }
    const controllerState = pendingEntry.controller.getState();
    setRestaurantEntryState({
      kind: "submitting-recommendation",
      restaurantId: controllerState.kind === "recommendation-error"
        ? controllerState.restaurantId
        : "pending"
    });
    const next = await pendingEntry.controller.retryRecommendation();
    if (requestGate.current.isCurrent(pendingEntry.request)) {
      setRestaurantEntryState(next);
      if (next.kind === "complete") setRestaurantReload((value) => value + 1);
    }
    return next;
  }

  async function runRestaurantOperation(
    operation: (context: AdminGroupContext) => Promise<unknown>
  ): Promise<boolean> {
    if (!groupContext) return false;
    const context = { ...groupContext };
    const request = requestGate.current.begin();
    restaurantEntryController.current = null;
    setRestaurantEntryState({ kind: "idle" });
    setRestaurantOperationError(undefined);
    try {
      await operation(context);
      if (requestGate.current.isCurrent(request)) {
        setRestaurantReload((value) => value + 1);
        return true;
      }
    } catch (error) {
      await handleRestaurantError(error, context, request, "operation");
    }
    return false;
  }

  function handlePatchRestaurant(restaurantId: string, input: PatchRestaurantRequest) {
    return runRestaurantOperation((context) => patchRestaurant(context, restaurantId, input));
  }

  function handleCreateRecommendation(input: CreateRecommendationRequest) {
    return runRestaurantOperation((context) => createRestaurantRecommendation(context, input));
  }

  function handlePatchRecommendation(
    recommendationId: string,
    input: PatchRecommendationRequest
  ) {
    return runRestaurantOperation((context) => (
      patchRestaurantRecommendation(context, recommendationId, input)
    ));
  }

  const switchingHasUsableActiveGroup = authState.kind === "switching"
    && Boolean(
      authState.session.activeGroupId
      && authState.session.sessionsByGroupId[authState.session.activeGroupId]
      && authState.session.groupSummariesById[authState.session.activeGroupId]
    );
  const shellState = authState.kind === "authenticated"
    || (authState.kind === "switching" && switchingHasUsableActiveGroup)
    ? authState
    : null;

  if (!shellState) {
    return (
      <LoginPage
        state={authState}
        onCreateIdentity={authController.createIdentity}
        onCreateGroup={handleCreateGroup}
        onJoinGroup={handleJoinGroup}
        onSwitchGroup={handleSwitchGroup}
        onDisconnect={handleDisconnect}
      />
    );
  }

  const inviteCode = shellState.kind === "authenticated"
    ? shellState.inviteCode
    : undefined;
  const error = shellState.kind === "authenticated"
    ? shellState.error
    : undefined;

  return (
    <AppShell
      route={route === "login" ? "today" : route}
      session={shellState.session}
      groups={shellState.groups}
      pendingGroupId={shellState.kind === "switching" ? shellState.pendingGroupId : undefined}
      onSwitchGroup={handleSwitchGroup}
      onOpenGroupEntry={() => setGroupEntryOpen((open) => !open)}
      onDisconnect={handleDisconnect}
      groupEntryPanel={groupEntryOpen ? (
        <div className="shell-entry-wrap">
          <div className="shell-entry-heading">
            <div>
              <span className="eyebrow">保留当前身份和小组</span>
              <h2>创建或加入另一个小组</h2>
            </div>
            <button className="button ghost" type="button" onClick={() => setGroupEntryOpen(false)}>
              关闭
            </button>
          </div>
          <GroupEntryPanel
            groups={shellState.groups}
            inviteCode={inviteCode}
            error={error}
            onCreateGroup={handleCreateGroup}
            onJoinGroup={handleJoinGroup}
          />
        </div>
      ) : inviteCode ? (
        <div className="shell-invite-banner" aria-live="polite">
          <span>小组已创建，请立即保存一次性邀请码</span>
          <code>{inviteCode}</code>
        </div>
      ) : undefined}
    >
      {route === "restaurants" ? activeGroup ? (
        <RestaurantsPage
          group={activeGroup}
          restaurants={restaurants}
          loading={restaurantsLoading}
          loadError={restaurantLoadError}
          operationError={restaurantOperationError}
          entryState={restaurantEntryState}
          onRetryLoad={() => setRestaurantReload((value) => value + 1)}
          onCreateEntry={handleCreateRestaurantEntry}
          onRetryRecommendation={handleRetryRestaurantRecommendation}
          onPatchRestaurant={handlePatchRestaurant}
          onCreateRecommendation={handleCreateRecommendation}
          onPatchRecommendation={handlePatchRecommendation}
        />
      ) : (
        <StatusPanel title="餐厅库" message="请选择一个可用小组后再管理餐厅。" />
      ) : (
        <TodayPage
          state={todayState}
          onGenerate={handleTodayRefresh}
          onRefresh={handleTodayRefresh}
          onRetry={() => setTodayReload((value) => value + 1)}
          onOpenRestaurants={() => navigate("restaurants")}
        />
      )}
    </AppShell>
  );
}

function restaurantErrorMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.code === "restaurant_owner_required") return "只有餐厅创建者或管理员可以编辑这家餐厅。";
    if (error.code === "recommendation_owner_required") return "只有推荐创建者或管理员可以编辑这条推荐。";
    if (error.code === "admin_membership_required") return "只有小组管理员可以修改餐厅状态。";
    if (error.kind === "network") return "网络连接失败，当前小组数据没有被更改。";
    if (error.status && error.status >= 500) return "服务暂时不可用，请稍后重试。";
  }
  return "操作没有完成，请检查输入或网络后重试。";
}

function todayDependencies(context: AdminGroupContext): TodayDependencies {
  return {
    getToday: () => getToday(context),
    refreshToday: () => refreshToday(context),
    getParticipation: () => getParticipation(context)
  };
}
