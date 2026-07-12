import React, { createContext, useContext, useReducer, type ReactNode } from "react";
import type { BootstrapResponse } from "../shared/api.js";
import type { RunSnapshot, RunEvent, ProfileId, TaskDraftVersion } from "../shared/contracts.js";

export type AppState = {
  phase: "booting" | "missing_session" | "onboarding" | "office" | "fatal";
  bootstrap: BootstrapResponse | null;
  selectedProjectId: string | null;
  selectedActorId: ProfileId;
  selectedTaskId: string | null;
  run: RunSnapshot | null;
  draft: TaskDraftVersion | null;
  events: RunEvent[];
  reduceMotion: boolean;
  error: string | null;
};

export type AppAction =
  | { type: "bootstrapped"; value: BootstrapResponse }
  | { type: "missing_session" }
  | { type: "setup_opened" }
  | { type: "project_selected"; projectId: string }
  | { type: "run_snapshot"; run: RunSnapshot | null }
  | { type: "draft_loaded"; value: TaskDraftVersion | null }
  | { type: "event_received"; event: RunEvent }
  | { type: "actor_selected"; actorId: ProfileId }
  | { type: "task_selected"; taskId: string | null }
  | { type: "reduce_motion"; value: boolean }
  | { type: "fatal"; message: string };

const initialState: AppState = {
  phase: "booting",
  bootstrap: null,
  selectedProjectId: null,
  selectedActorId: "worker-1",
  selectedTaskId: null,
  run: null,
  draft: null,
  events: [],
  reduceMotion: false,
  error: null,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "bootstrapped": {
      const selectedProject = action.value.activeRun
        ? action.value.projects.find((project) => project.id === action.value.activeRun?.projectId)
        : (action.value.projects.find((project) => project.id === state.selectedProjectId) ??
          action.value.projects[0]);
      const activeProject = action.value.activeRun?.projectId ?? selectedProject?.id ?? null;
      const phase = action.value.activeRun
        ? "office"
        : selectedProject?.setupComplete
          ? "office"
          : "onboarding";
      return {
        ...state,
        phase,
        bootstrap: action.value,
        selectedProjectId: activeProject,
        run: action.value.activeRun,
      };
    }
    case "missing_session":
      return {
        ...state,
        phase: "missing_session",
      };
    case "setup_opened":
      return {
        ...state,
        phase: "onboarding",
      };
    case "project_selected":
      return {
        ...state,
        phase: "office",
        selectedProjectId: action.projectId,
      };
    case "run_snapshot": {
      const resetEvents = action.run?.id !== state.run?.id;
      return {
        ...state,
        run: action.run,
        events: resetEvents ? [] : state.events,
      };
    }
    case "draft_loaded":
      return {
        ...state,
        draft: action.value,
      };
    case "event_received": {
      // Deduplicate and cap to 2000
      const exists = state.events.some((e) => e.sequence === action.event.sequence);
      if (exists) return state;
      const combined = [...state.events, action.event].sort((a, b) => a.sequence - b.sequence);
      const capped = combined.slice(-2000);
      return {
        ...state,
        events: capped,
      };
    }
    case "actor_selected":
      return {
        ...state,
        selectedActorId: action.actorId,
      };
    case "task_selected":
      return {
        ...state,
        selectedTaskId: action.taskId,
      };
    case "reduce_motion":
      return {
        ...state,
        reduceMotion: action.value,
      };
    case "fatal":
      return {
        ...state,
        phase: "fatal",
        error: action.message,
      };
    default:
      return state;
  }
}

const StateContext = createContext<AppState | undefined>(undefined);
const DispatchContext = createContext<React.Dispatch<AppAction> | undefined>(undefined);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(StateContext);
  if (!context) throw new Error("useAppState must be used within AppStoreProvider");
  return context;
}

export function useAppDispatch() {
  const context = useContext(DispatchContext);
  if (!context) throw new Error("useAppDispatch must be used within AppStoreProvider");
  return context;
}
