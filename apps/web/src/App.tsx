import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScenarioManifestEntry } from "@incident-commander/contracts";
import { CARD_CATALOG, type GameData } from "@incident-commander/cards";
import { ENCOUNTERS, ENCOUNTER_REGISTRY, getEncounter } from "@incident-commander/scenarios";
import { ensureGuestSession, fetchScenarios } from "./lib/api";
import { listLocalRuns, type LocalRun } from "./lib/idb";
import { startNewSession, resumeSession, type RunSession } from "./engine/session";
import { ShiftSelection } from "./screens/ShiftSelection";
import { TableScreen } from "./screens/TableScreen";
import { DebriefScreen } from "./screens/DebriefScreen";

type Route =
  | { name: "shifts" }
  | { name: "play"; runId: string }
  | { name: "debrief"; runId: string };

function parseRoute(): Route {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "play" && parts[1]) return { name: "play", runId: parts[1] };
  if (parts[0] === "runs" && parts[1] && parts[2] === "debrief") {
    return { name: "debrief", runId: parts[1] };
  }
  return { name: "shifts" };
}

const fallbackManifest: ScenarioManifestEntry[] = ENCOUNTERS.map((encounter) => ({
  id: encounter.id,
  version: encounter.version,
  engineVersion: encounter.engineVersion,
  contentHash: "local",
  title: encounter.title,
  summary: encounter.summary,
  difficulty: encounter.difficulty,
  playable: true,
}));

export function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [scenarios, setScenarios] = useState<ScenarioManifestEntry[]>(fallbackManifest);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [locals, setLocals] = useState<LocalRun[]>([]);
  const [localsReady, setLocalsReady] = useState(false);
  const [session, setSession] = useState<RunSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);

  const data: GameData = useMemo(
    () => ({ catalog: CARD_CATALOG, encounters: ENCOUNTER_REGISTRY }),
    [],
  );

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, "", path);
    setRoute(parseRoute());
  }, []);

  const refreshLocals = useCallback(async () => {
    try {
      setLocals(await listLocalRuns());
    } catch {
      setLocals([]);
    } finally {
      setLocalsReady(true);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refreshLocals();
      try {
        const guest = await ensureGuestSession();
        setGuestId(guest.guestId);
      } catch {
        setGuestId(null);
      }
      try {
        const manifest = await fetchScenarios();
        if (manifest.length > 0) setScenarios(manifest);
      } catch {
        // Offline mode keeps the bundled manifest.
      }
    })();
  }, [refreshLocals]);

  useEffect(() => {
    window.onpopstate = () => setRoute(parseRoute());
    return () => {
      window.onpopstate = null;
    };
  }, []);

  useEffect(() => {
    if (route.name !== "play" || session?.id === route.runId || resuming) return;
    if (!localsReady) return;
    const record = locals.find((item) => item.runId === route.runId);
    if (!record) {
      navigate("/");
      return;
    }
    setResuming(true);
    void (async () => {
      const resumed = await resumeSession(route.runId, guestId, data);
      if (resumed) {
        resumed.setGuestId(guestId);
        resumed.start();
        setSession(resumed);
      } else {
        setError("That saved run was created under incompatible rules and cannot be resumed.");
        navigate("/");
      }
      setResuming(false);
    })();
  }, [route, session, guestId, navigate, locals, localsReady, data, resuming]);

  const startNew = useCallback(
    async (scenarioId?: string) => {
      setBusy(true);
      setError(null);
      try {
        session?.destroy();
        const encounter = (scenarioId ? getEncounter(scenarioId) : undefined) ?? ENCOUNTERS[0];
        if (!encounter) throw new Error("No encounters are available.");
        const next = await startNewSession({ encounter, guestId, data });
        next.setGuestId(guestId);
        next.start();
        setSession(next);
        await refreshLocals();
        navigate(`/play/${next.id}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to start a run.");
      } finally {
        setBusy(false);
      }
    },
    [data, guestId, navigate, refreshLocals, session],
  );

  const resume = useCallback(
    async (runId: string) => {
      setBusy(true);
      setError(null);
      try {
        session?.destroy();
        const next = await resumeSession(runId, guestId, data);
        if (!next) {
          setError("That saved run was created under incompatible rules and cannot be resumed.");
          return;
        }
        next.setGuestId(guestId);
        next.start();
        setSession(next);
        navigate(`/play/${runId}`);
      } finally {
        setBusy(false);
      }
    },
    [data, guestId, navigate, session],
  );

  const toDebrief = useCallback(
    async (runId: string) => {
      await refreshLocals();
      navigate(`/runs/${runId}/debrief`);
    },
    [navigate, refreshLocals],
  );

  if (route.name === "play" && session?.id === route.runId) {
    return (
      <TableScreen
        session={session}
        onDebrief={() => void toDebrief(session.id)}
        onRestart={() => void startNew(session.currentState.encounterIds[0])}
        onExit={() => navigate("/")}
      />
    );
  }

  if (route.name === "debrief") {
    return (
      <DebriefScreen
        runId={route.runId}
        local={locals.find((record) => record.runId === route.runId) ?? null}
        data={data}
        onBack={() => navigate("/")}
        onRetry={() => void startNew(data.encounters[locals.find((r) => r.runId === route.runId)?.checkpoint.state.encounterIds[0] ?? ""]?.id)}
      />
    );
  }

  return (
    <ShiftSelection
      scenarios={scenarios}
      locals={locals}
      busy={busy}
      error={error}
      onStart={startNew}
      onResume={resume}
    />
  );
}
