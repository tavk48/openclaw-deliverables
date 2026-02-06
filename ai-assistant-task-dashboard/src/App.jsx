import React, { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEYS = {
  tasks: "aatd.tasks",
  archived: "aatd.archived",
  currentTaskId: "aatd.currentTaskId",
  messages: "aatd.messages",
  settings: "aatd.settings"
};

const STATUS = {
  BACKLOG: "backlog",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed"
};

const STATUS_LABELS = {
  [STATUS.BACKLOG]: "Backlog",
  [STATUS.IN_PROGRESS]: "In Progress",
  [STATUS.COMPLETED]: "Completed"
};

const STATUS_STYLES = {
  [STATUS.BACKLOG]: "bg-slate-700 text-slate-100",
  [STATUS.IN_PROGRESS]: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  [STATUS.COMPLETED]: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
};

const DEFAULT_SETTINGS = {
  autoStartNext: true,
  useAnthropic: true
};

const nowIso = () => new Date().toISOString();

const generateId = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `task_${Date.now()}_${Math.random().toString(16).slice(2)}`);

const formatTimestamp = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  });

const formatDuration = (seconds) => {
  if (!seconds) return "0m";
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return hrs > 0 ? `${hrs}h ${remMins}m` : `${remMins}m`;
};

const getLocal = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const setLocal = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const defaultTaskFromTitle = (title, description = "") => ({
  id: generateId(),
  title,
  description,
  createdAt: nowIso(),
  status: STATUS.BACKLOG,
  timeSpentSec: 0,
  startedAt: null,
  completedAt: null
});

const naiveTaskSplit = (message) => {
  const cleaned = message
    .replace(/\n+/g, " ")
    .replace(/please/gi, "")
    .replace(/could you/gi, "")
    .replace(/can you/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return [];

  const candidates = cleaned
    .split(/(?:,|;|\band\b|\bthen\b|\bafter that\b|\bnext\b)/gi)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return candidates.length ? candidates : [cleaned];
};

const mergeById = (existing, incoming) => {
  const map = new Map(existing.map((task) => [task.id, task]));
  incoming.forEach((task) => {
    map.set(task.id, { ...map.get(task.id), ...task });
  });
  return Array.from(map.values());
};

const sortByCreated = (tasks) =>
  [...tasks].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

const App = () => {
  const [tasks, setTasks] = useState(() => getLocal(STORAGE_KEYS.tasks, []));
  const [archived, setArchived] = useState(() =>
    getLocal(STORAGE_KEYS.archived, [])
  );
  const [currentTaskId, setCurrentTaskId] = useState(() =>
    getLocal(STORAGE_KEYS.currentTaskId, null)
  );
  const [messages, setMessages] = useState(() =>
    getLocal(STORAGE_KEYS.messages, [])
  );
  const [settings, setSettings] = useState(() =>
    getLocal(STORAGE_KEYS.settings, DEFAULT_SETTINGS)
  );
  const [input, setInput] = useState("");
  const [statusText, setStatusText] = useState("Idle");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [error, setError] = useState(null);
  const tickRef = useRef(null);

  const currentTask = useMemo(
    () => tasks.find((task) => task.id === currentTaskId),
    [tasks, currentTaskId]
  );

  useEffect(() => {
    setLocal(STORAGE_KEYS.tasks, tasks);
  }, [tasks]);

  useEffect(() => {
    setLocal(STORAGE_KEYS.archived, archived);
  }, [archived]);

  useEffect(() => {
    setLocal(STORAGE_KEYS.currentTaskId, currentTaskId);
  }, [currentTaskId]);

  useEffect(() => {
    setLocal(STORAGE_KEYS.messages, messages);
  }, [messages]);

  useEffect(() => {
    setLocal(STORAGE_KEYS.settings, settings);
  }, [settings]);

  useEffect(() => {
    tickRef.current = setInterval(() => {
      setTasks((prev) => [...prev]);
    }, 1000);

    return () => clearInterval(tickRef.current);
  }, []);

  useEffect(() => {
    const state = currentTask ? `Working on: ${currentTask.title}` : "Idle";
    setStatusText(state);
  }, [currentTask]);

  const trackTime = (taskId, active) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId) return task;
        if (active) {
          return {
            ...task,
            startedAt: task.startedAt || nowIso()
          };
        }
        if (task.startedAt) {
          const elapsed = Math.floor(
            (Date.now() - new Date(task.startedAt).getTime()) / 1000
          );
          return {
            ...task,
            startedAt: null,
            timeSpentSec: (task.timeSpentSec || 0) + elapsed
          };
        }
        return task;
      })
    );
  };

  const setInProgress = (taskId) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id === taskId) {
          return { ...task, status: STATUS.IN_PROGRESS };
        }
        if (task.status !== STATUS.COMPLETED) {
          return { ...task, status: STATUS.BACKLOG, startedAt: null };
        }
        return task;
      })
    );
    if (currentTaskId && currentTaskId !== taskId) {
      trackTime(currentTaskId, false);
    }
    setCurrentTaskId(taskId);
    trackTime(taskId, true);
  };

  const completeTask = (taskId) => {
    trackTime(taskId, false);
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: STATUS.COMPLETED,
              completedAt: nowIso(),
              startedAt: null
            }
          : task
      )
    );
    if (currentTaskId === taskId) {
      setCurrentTaskId(null);
      if (settings.autoStartNext) {
        const next = sortByCreated(
          tasks.filter((task) => task.status === STATUS.BACKLOG)
        )[0];
        if (next) setTimeout(() => setInProgress(next.id), 200);
      }
    }
  };

  const deleteTask = (taskId) => {
    if (currentTaskId === taskId) {
      setCurrentTaskId(null);
    }
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
  };

  const archiveTask = (taskId) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    setArchived((prev) => [{ ...task, archivedAt: nowIso() }, ...prev]);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    if (currentTaskId === taskId) setCurrentTaskId(null);
  };

  const updateTaskStatus = (taskId, status) => {
    if (status === STATUS.IN_PROGRESS) {
      setInProgress(taskId);
      return;
    }
    if (status === STATUS.COMPLETED) {
      completeTask(taskId);
      return;
    }
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, status, startedAt: null } : task
      )
    );
    if (currentTaskId === taskId) setCurrentTaskId(null);
  };

  const handleDrop = (status, taskId) => {
    setDraggingId(null);
    updateTaskStatus(taskId, status);
  };

  const updateFromApi = async (incoming) => {
    if (!incoming) return;
    if (incoming.tasks) {
      setTasks((prev) => mergeById(prev, incoming.tasks));
    }
    if (incoming.archived) {
      setArchived((prev) => mergeById(prev, incoming.archived));
    }
    if (incoming.currentTaskId) {
      setCurrentTaskId(incoming.currentTaskId);
    }
  };

  // Optional API sync (wire this to your backend to persist task state)
  const syncToApi = async (payload) => {
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn("API sync failed", err);
    }
  };

  // Task parsing via Anthropic proxy (never call Anthropic directly from the browser)
  const parseTasksWithAnthropic = async (message) => {
    if (!settings.useAnthropic) return null;
    try {
      const response = await fetch("/api/anthropic/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          userMessage: message,
          context: messages.slice(-6)
        })
      });

      if (!response.ok) throw new Error("Anthropic parse failed");
      const data = await response.json();
      return data.tasks;
    } catch (err) {
      console.warn("Anthropic parse error", err);
      return null;
    }
  };

  const createTasksFromMessage = async (messageText) => {
    setError(null);
    const trimmed = messageText.trim();
    if (!trimmed) return;

    const messageEntry = {
      id: generateId(),
      text: trimmed,
      createdAt: nowIso()
    };
    setMessages((prev) => [...prev, messageEntry]);

    let taskTitles = await parseTasksWithAnthropic(trimmed);

    if (!taskTitles || !taskTitles.length) {
      taskTitles = naiveTaskSplit(trimmed);
    }

    const newTasks = taskTitles.map((title) => defaultTaskFromTitle(title));

    setTasks((prev) => [...prev, ...newTasks]);

    if (!currentTaskId && newTasks.length) {
      setTimeout(() => setInProgress(newTasks[0].id), 100);
    }

    await syncToApi({ tasks: newTasks, message: messageEntry });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const text = input;
    setInput("");
    await createTasksFromMessage(text);
  };

  const connectLive = () => {
    try {
      const events = new EventSource("/api/stream");
      setLiveConnected(true);
      events.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "user_message") {
            createTasksFromMessage(payload.text);
          }
          if (payload.type === "assistant_state") {
            if (payload.currentTaskId) setInProgress(payload.currentTaskId);
            if (payload.completedTaskId) completeTask(payload.completedTaskId);
          }
          if (payload.type === "sync") updateFromApi(payload.data);
        } catch (err) {
          console.warn("Live update error", err);
        }
      };
      events.onerror = () => {
        setLiveConnected(false);
        events.close();
      };
    } catch (err) {
      setError("Live connection failed.");
    }
  };

  const backlog = tasks.filter((task) => task.status === STATUS.BACKLOG);
  const inProgress = tasks.filter((task) => task.status === STATUS.IN_PROGRESS);
  const completed = tasks.filter((task) => task.status === STATUS.COMPLETED);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              AI Assistant Dashboard
            </p>
            <h1 className="text-2xl font-semibold">Task Management</h1>
            <p className="text-sm text-slate-400">
              Live view of tasks detected from your chat.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-full bg-slate-900 px-4 py-2 text-sm">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                currentTask ? "bg-amber-400 animate-pulse" : "bg-slate-500"
              }`}
            />
            <span>{statusText}</span>
            <span
              className={`ml-2 h-2 w-2 rounded-full ${
                liveConnected ? "bg-emerald-400" : "bg-slate-600"
              }`}
            />
            <span className="text-xs text-slate-400">
              {liveConnected ? "Live" : "Offline"}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <form onSubmit={handleSubmit} className="flex flex-1 gap-3">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                placeholder="Send a task request (e.g., Analyze data, create report, send summary)"
              />
              <button
                type="submit"
                className="rounded-xl bg-indigo-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
              >
                Add
              </button>
            </form>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.autoStartNext}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      autoStartNext: event.target.checked
                    }))
                  }
                />
                Auto-start next task
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.useAnthropic}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      useAnthropic: event.target.checked
                    }))
                  }
                />
                Use Anthropic parsing
              </label>
              <button
                type="button"
                onClick={connectLive}
                className="rounded-full border border-slate-700 px-3 py-1 text-xs hover:border-indigo-400"
              >
                Connect Live
              </button>
              <button
                type="button"
                onClick={() => setArchiveOpen(true)}
                className="rounded-full border border-slate-700 px-3 py-1 text-xs hover:border-emerald-400"
              >
                View Archive ({archived.length})
              </button>
            </div>
          </div>
          {error && (
            <p className="mt-3 text-xs text-rose-400">{error}</p>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          {[STATUS.BACKLOG, STATUS.IN_PROGRESS, STATUS.COMPLETED].map((status) => {
            const list =
              status === STATUS.BACKLOG
                ? backlog
                : status === STATUS.IN_PROGRESS
                ? inProgress
                : completed;

            return (
              <div
                key={status}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => draggingId && handleDrop(status, draggingId)}
              >
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                    {STATUS_LABELS[status]}
                  </h2>
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-xs">
                    {list.length}
                  </span>
                </div>

                <div className="flex flex-col gap-4">
                  {list.length === 0 && (
                    <p className="rounded-xl border border-dashed border-slate-700 p-4 text-xs text-slate-500">
                      Drop tasks here or add a new request.
                    </p>
                  )}
                  {list.map((task) => {
                    const isActive = task.id === currentTaskId;
                    const timeSpent =
                      task.startedAt && isActive
                        ? task.timeSpentSec +
                          Math.floor(
                            (Date.now() -
                              new Date(task.startedAt).getTime()) /
                              1000
                          )
                        : task.timeSpentSec;

                    return (
                      <article
                        key={task.id}
                        draggable
                        onDragStart={() => setDraggingId(task.id)}
                        onDragEnd={() => setDraggingId(null)}
                        className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-4 shadow-lg transition hover:border-indigo-400"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-base font-semibold">
                              {task.title}
                            </h3>
                            {task.description && (
                              <p className="mt-1 text-xs text-slate-400">
                                {task.description}
                              </p>
                            )}
                          </div>
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] ${
                              STATUS_STYLES[task.status]
                            }`}
                          >
                            {STATUS_LABELS[task.status]}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                          <span>Created {formatTimestamp(task.createdAt)}</span>
                          <span>Time: {formatDuration(timeSpent)}</span>
                          {isActive && (
                            <span className="rounded-full bg-amber-400/20 px-2 py-1 text-amber-200">
                              Active
                            </span>
                          )}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <button
                            className="rounded-lg border border-slate-700 px-3 py-1 text-xs hover:border-indigo-400"
                            onClick={() => setInProgress(task.id)}
                          >
                            Start
                          </button>
                          <button
                            className="rounded-lg border border-slate-700 px-3 py-1 text-xs hover:border-emerald-400"
                            onClick={() => completeTask(task.id)}
                          >
                            Complete
                          </button>
                          <select
                            value={task.status}
                            onChange={(event) =>
                              updateTaskStatus(task.id, event.target.value)
                            }
                            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                          >
                            <option value={STATUS.BACKLOG}>Backlog</option>
                            <option value={STATUS.IN_PROGRESS}>In Progress</option>
                            <option value={STATUS.COMPLETED}>Completed</option>
                          </select>
                          {task.status === STATUS.COMPLETED && (
                            <button
                              className="rounded-lg border border-emerald-500/40 px-3 py-1 text-xs text-emerald-200 hover:border-emerald-300"
                              onClick={() => archiveTask(task.id)}
                            >
                              Archive ✓
                            </button>
                          )}
                          <button
                            className="rounded-lg border border-rose-500/40 px-3 py-1 text-xs text-rose-300 hover:border-rose-400"
                            onClick={() => deleteTask(task.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      </main>

      {archiveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Completed Archive</h2>
              <button
                className="text-sm text-slate-400 hover:text-slate-200"
                onClick={() => setArchiveOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto">
              {archived.length === 0 && (
                <p className="text-sm text-slate-500">No archived tasks.</p>
              )}
              {archived.map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{task.title}</p>
                    <span className="text-xs text-slate-500">
                      Archived {formatTimestamp(task.archivedAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Completed {formatTimestamp(task.completedAt || task.createdAt)}
                    · Time {formatDuration(task.timeSpentSec)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
