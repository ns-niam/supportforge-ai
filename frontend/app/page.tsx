"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Section: Types
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

type SourceItem = {
  filename: string;
  chunk_index: number;
  score: number;
};

type DocumentItem = {
  document_id: string;
  filename: string;
  uploaded_at: string;
  characters: number;
  total_chunks: number;
  preview: string;
};

type HealthResponse = {
  status?: string;
  service?: string;
  documents_loaded?: number;
};

type ChatApiResponse = {
  reply?: string | { answer?: string; status?: string };
  answer?: string;
  status?: string;
  sources?: SourceItem[];
  details?: string;
  session_id?: string;
};

type UploadApiResponse = {
  status?: string;
  filename?: string;
  total_chunks?: number;
  preview?: string;
  document_id?: string;
  characters?: number;
  details?: string;
  message?: string;
};

type DocumentsApiResponse = {
  count?: number;
  documents?: DocumentItem[];
};

// Section: Constants
const WELCOME_MESSAGE: Message = {
  id: "welcome-message",
  role: "assistant",
  content:
    "Welcome to SupportForge AI. Upload a PDF or ask a question to get started.",
  createdAt: 0,
};

// Section: Helper Utilities
const createMessageId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createSessionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const formatMessageTime = (timestamp: number) => {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
};

const renderPrettyMessage = (content: string, isUser: boolean) => {
  const sections = content
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    <div className="space-y-3">
      {sections.map((section, sectionIndex) => {
        const lines = section
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

        const isBulletList =
          lines.length > 1 && lines.every((line) => /^([-*•]|\d+\.)\s+/.test(line));

        if (isBulletList) {
          return (
            <ul key={sectionIndex} className="space-y-2">
              {lines.map((line, lineIndex) => {
                const cleanedLine = line.replace(/^([-*•]|\d+\.)\s+/, "");

                return (
                  <li
                    key={lineIndex}
                    className={`flex gap-2 text-[15px] leading-7 ${
                      isUser ? "text-black" : "text-zinc-100"
                    }`}
                  >
                    <span
                      className={`mt-2 h-1.5 w-1.5 flex-none rounded-full ${
                        isUser ? "bg-black/70" : "bg-current opacity-70"
                      }`}
                    />
                    <span className="whitespace-pre-wrap break-words">
                      {cleanedLine}
                    </span>
                  </li>
                );
              })}
            </ul>
          );
        }

        const isQuotedBlock = lines.length === 1 && lines[0].startsWith(">");

        if (isQuotedBlock) {
          return (
            <div
              key={sectionIndex}
              className={`rounded-2xl border px-4 py-3 text-[15px] leading-7 ${
                isUser
                  ? "border-black/10 bg-black/5 text-black"
                  : "border-zinc-700/60 bg-black/20 text-zinc-100"
              }`}
            >
              <span className="whitespace-pre-wrap break-words">
                {lines[0].replace(/^>\s?/, "")}
              </span>
            </div>
          );
        }

        return (
          <p
            key={sectionIndex}
            className={`whitespace-pre-wrap break-words text-[15px] leading-7 ${
              isUser ? "text-black" : "text-zinc-100"
            }`}
          >
            {section}
          </p>
        );
      })}
    </div>
  );
};

// Section: Main Component
export default function Home() {
  const [mounted, setMounted] = useState(false);

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [backendStatus, setBackendStatus] = useState("checking");
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);

  const [lastSources, setLastSources] = useState<SourceItem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [sessionId, setSessionId] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const stats = useMemo(
    () => [
      {
        label: "Documents",
        value: String(documents.length),
      },
      {
        label: "Backend",
        value: backendStatus.startsWith("online") ? "Online" : "Offline",
      },
      {
        label: "Sources",
        value: String(lastSources.length),
      },
      {
        label: "Session",
        value: sessionId ? sessionId.slice(0, 8) : "—",
      },
    ],
    [backendStatus, documents.length, lastSources.length, sessionId]
  );

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Section: Hydration Guard
  useEffect(() => {
    setMounted(true);
  }, []);

  // Section: Auto Scroll on New Messages
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Section: Session Bootstrap
  useEffect(() => {
    const existingSessionId =
      window.localStorage.getItem("supportforge_session_id");

    const nextSessionId = existingSessionId || createSessionId();

    if (!existingSessionId) {
      window.localStorage.setItem("supportforge_session_id", nextSessionId);
    }

    setSessionId(nextSessionId);
  }, []);

  // Section: Dashboard Loader
  const loadDashboardData = async () => {
    setIsLoadingDocuments(true);

    try {
      const [healthResponse, docsResponse] = await Promise.all([
        fetch("/api/health"),
        fetch("/api/documents"),
      ]);

      if (healthResponse.ok) {
        const healthData = (await healthResponse.json()) as HealthResponse;
        const loaded = healthData.documents_loaded ?? 0;
        setBackendStatus(`online · ${loaded} documents indexed`);
      } else {
        setBackendStatus("offline");
      }

      if (docsResponse.ok) {
        const docsData = (await docsResponse.json()) as DocumentsApiResponse;
        setDocuments(Array.isArray(docsData.documents) ? docsData.documents : []);
      } else {
        setDocuments([]);
      }

      setLastUpdated(new Date().toLocaleString());
    } catch {
      setBackendStatus("offline");
      setDocuments([]);
    } finally {
      setIsLoadingDocuments(false);
    }
  };

  // Section: Initial Load + Refresh Interval
  useEffect(() => {
    void loadDashboardData();

    const interval = window.setInterval(() => {
      void loadDashboardData();
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  // Section: Chat Handler
  const handleSendMessage = async () => {
    const trimmed = message.trim();

    if (!trimmed || isSending) return;

    const userMessage: Message = {
      id: createMessageId(),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessage("");
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmed,
          session_id: sessionId || undefined,
        }),
      });

      const data = (await response.json()) as ChatApiResponse;

      const responseSessionId =
        typeof data.session_id === "string" ? data.session_id : "";

      if (responseSessionId) {
        setSessionId(responseSessionId);
        window.localStorage.setItem(
          "supportforge_session_id",
          responseSessionId
        );
      }

      const replyText =
        typeof data.reply === "string"
          ? data.reply
          : data.reply &&
              typeof data.reply === "object" &&
              typeof data.reply.answer === "string"
            ? data.reply.answer
            : typeof data.answer === "string"
              ? data.answer
              : "No response received.";

      const sourcesText = Array.isArray(data.sources) ? data.sources : [];

      const assistantMessage: Message = {
        id: createMessageId(),
        role: "assistant",
        content: replyText,
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setLastSources(sourcesText);
      setLastUpdated(new Date().toLocaleString());
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: createMessageId(),
          role: "assistant",
          content: "Failed to connect to the backend.",
          createdAt: Date.now(),
        },
      ]);
      setLastSources([]);
    } finally {
      setIsSending(false);
    }
  };

  // Section: Upload Handler
  const handleUpload = async () => {
    if (!selectedFile || isUploading) return;

    const formData = new FormData();
    formData.append("file", selectedFile);

    setIsUploading(true);
    setUploadStatus("");

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as UploadApiResponse;

      if (!response.ok) {
        throw new Error(
          data.details || data.message || data.status || "Upload failed"
        );
      }

      setUploadStatus(
        `Uploaded: ${data.filename || selectedFile.name} | Chunks: ${
          data.total_chunks || 0
        }`
      );

      setSelectedFile(null);
      await loadDashboardData();
    } catch (error) {
      setUploadStatus(
        error instanceof Error ? error.message : "Upload failed"
      );
    } finally {
      setIsUploading(false);
    }
  };

  // Section: Formatting Helpers
  const formatScore = (score: number) => score.toFixed(3);

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6">
        {/* Section: Top Header */}
        <header className="mb-6 flex flex-col gap-4 border-b border-zinc-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              SupportForge AI
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              AI Customer Support & Knowledge Assistant Platform
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300">
              Dashboard
            </div>
            <div className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300">
              {backendStatus}
            </div>
            <div className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300">
              Updated {lastUpdated || "—"}
            </div>
            {sessionId && (
              <div className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300">
                Session {sessionId.slice(0, 8)}
              </div>
            )}
          </div>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[300px_1fr_320px]">
          {/* Section: Left Sidebar */}
          <aside className="space-y-6">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
              <h2 className="text-lg font-semibold">Quick Actions</h2>

              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-zinc-800 bg-black p-4">
                  <p className="text-sm text-zinc-400">Upload PDF</p>

                  <input
                    type="file"
                    accept=".pdf"
                    className="mt-3 w-full text-sm text-zinc-300 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black"
                    onChange={(e) =>
                      setSelectedFile(e.target.files?.[0] || null)
                    }
                  />

                  <button
                    onClick={handleUpload}
                    disabled={!selectedFile || isUploading}
                    className="mt-4 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isUploading ? "Uploading..." : "Upload Document"}
                  </button>

                  {uploadStatus && (
                    <p className="mt-3 text-sm text-zinc-300">
                      {uploadStatus}
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-black p-4">
                  <p className="text-sm text-zinc-400">System Status</p>
                  <div className="mt-3 flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        backendStatus.startsWith("online")
                          ? "bg-green-500"
                          : "bg-red-500"
                      }`}
                    />
                    <span className="text-sm">
                      {backendStatus.startsWith("online")
                        ? "Backend connected"
                        : "Backend offline"}
                    </span>
                  </div>

                  <button
                    onClick={loadDashboardData}
                    className="mt-4 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-900"
                  >
                    Refresh status
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
              <h2 className="text-lg font-semibold">Documents</h2>

              <div className="mt-4 text-sm text-zinc-400">
                {isLoadingDocuments ? (
                  <p>Loading document library...</p>
                ) : documents.length === 0 ? (
                  <p>No documents uploaded yet.</p>
                ) : (
                  <div className="space-y-3">
                    {documents.map((doc) => (
                      <div
                        key={doc.document_id}
                        className="rounded-2xl border border-zinc-800 bg-black p-3"
                      >
                        <p className="font-medium text-white">{doc.filename}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {doc.characters} chars · {doc.total_chunks} chunks
                        </p>
                        <p className="mt-2 text-xs text-zinc-400 line-clamp-3">
                          {doc.preview}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
              <h2 className="text-lg font-semibold">Live Stats</h2>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {stats.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-zinc-800 bg-black p-3"
                  >
                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                      {item.label}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* Section: Center Chat Panel */}
          <section className="flex flex-col rounded-3xl border border-zinc-800 bg-zinc-950">
            <div className="border-b border-zinc-800 px-6 py-4">
              <h2 className="text-lg font-semibold">AI Chat</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Ask questions about uploaded documents.
              </p>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {messages.map((msg) => {
                const isUser = msg.role === "user";

                return (
                  <div
                    key={msg.id}
                    className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`group relative max-w-[88%] rounded-[1.6rem] border px-4 py-3 shadow-2xl shadow-black/20 transition-all duration-300 ${
                        isUser
                          ? "rounded-br-md border-white/10 bg-gradient-to-br from-white to-zinc-100 text-black"
                          : "rounded-bl-md border-zinc-700/70 bg-gradient-to-br from-zinc-900 to-zinc-950 text-white"
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between gap-4">
                        <div
                          className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                            isUser
                              ? "bg-black/5 text-zinc-700"
                              : "bg-white/5 text-zinc-300"
                          }`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${
                              isUser ? "bg-black/70" : "bg-emerald-400"
                            }`}
                          />
                          <span>{isUser ? "You" : "Assistant"}</span>
                        </div>

                        <span
                          suppressHydrationWarning
                          className={`text-[11px] ${
                            isUser ? "text-zinc-600" : "text-zinc-500"
                          }`}
                        >
                          {mounted ? formatMessageTime(msg.createdAt) : ""}
                        </span>
                      </div>

                      <div
                        className={`text-[15px] ${
                          isUser ? "text-black" : "text-zinc-100"
                        }`}
                      >
                        {renderPrettyMessage(msg.content, isUser)}
                      </div>

                      <div
                        className={`pointer-events-none absolute inset-0 rounded-[1.6rem] border opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${
                          isUser ? "border-black/5" : "border-white/5"
                        }`}
                      />
                    </div>
                  </div>
                );
              })}

              {isSending && (
                <div className="flex w-full justify-start">
                  <div className="max-w-[70%] rounded-[1.6rem] border border-zinc-700/70 bg-zinc-900 px-4 py-3 shadow-2xl shadow-black/20">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                      <span className="text-sm text-zinc-300">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {lastSources.length > 0 && (
              <div className="border-t border-zinc-800 px-6 py-4">
                <div className="rounded-2xl border border-zinc-800 bg-black p-4 text-sm text-zinc-300">
                  <p className="mb-3 text-zinc-300">Document Sources</p>
                  <div className="space-y-2">
                    {lastSources.map((source, index) => (
                      <div
                        key={index}
                        className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2"
                      >
                        <span className="text-white">{source.filename}</span>
                        <span className="text-zinc-500">
                          {" "}
                          · chunk {source.chunk_index + 1} · score{" "}
                          {formatScore(source.score)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="border-t border-zinc-800 p-4">
              <div className="flex gap-3">
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSendMessage();
                    }
                  }}
                  placeholder="Type your message..."
                  className="flex-1 rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 transition focus:border-zinc-500 focus:ring-2 focus:ring-white/10"
                />

                <button
                  onClick={handleSendMessage}
                  disabled={isSending}
                  className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSending ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </section>

          {/* Section: Right Info Panel */}
          <aside className="space-y-6">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
              <h3 className="text-lg font-semibold">Project Overview</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                SupportForge AI helps businesses upload documents, extract
                knowledge, and answer customer questions using AI-powered
                retrieval and provider fallback.
              </p>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
              <h3 className="text-lg font-semibold">Features</h3>
              <ul className="mt-4 space-y-3 text-sm text-zinc-400">
                <li>PDF upload and extraction</li>
                <li>Document chunking for RAG</li>
                <li>Vector retrieval system</li>
                <li>Multi-provider fallback routing</li>
                <li>Source-aware chat responses</li>
                <li>Session memory</li>
                <li>Backend API integration</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
              <h3 className="text-lg font-semibold">Current Stack</h3>
              <ul className="mt-4 space-y-3 text-sm text-zinc-400">
                <li>Next.js</li>
                <li>Tailwind CSS</li>
                <li>FastAPI</li>
                <li>Qdrant Vector DB</li>
                <li>Sentence Embeddings</li>
                <li>Multi-provider AI routing</li>
              </ul>
            </div>

            {/* Future upgrade: streaming response UI
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
              <h3 className="text-lg font-semibold">Streaming</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Later we can stream tokens live for a more natural chat experience.
              </p>
            </div>
            */}

            {/* Future upgrade: auth and workspace system
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
              <h3 className="text-lg font-semibold">Workspaces</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Later we can add login, team workspaces, document permissions,
                and analytics dashboard.
              </p>
            </div>
            */}

            {/* Future upgrade: memory persistence
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
              <h3 className="text-lg font-semibold">Persistent Memory</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Later we can move session memory into Redis or PostgreSQL so it
                survives restarts.
              </p>
            </div>
            */}
          </aside>
        </div>
      </div>
    </main>
  );
}