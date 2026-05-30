"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
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
  reply?: string;
  status?: string;
  provider?: string;
  sources?: SourceItem[];
  details?: string;
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

export default function Home() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Welcome to SupportForge AI. Upload a PDF or ask a question to get started.",
    },
  ]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [backendStatus, setBackendStatus] = useState("checking");
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);

  const [lastProvider, setLastProvider] = useState("");
  const [lastSources, setLastSources] = useState<SourceItem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>("");

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
        label: "Provider",
        value: lastProvider || "—",
      },
      {
        label: "Sources",
        value: String(lastSources.length),
      },
    ],
    [backendStatus, documents.length, lastProvider, lastSources.length]
  );

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  useEffect(() => {
    void loadDashboardData();

    const interval = window.setInterval(() => {
      void loadDashboardData();
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  const handleSendMessage = async () => {
    const trimmed = message.trim();

    if (!trimmed || isSending) return;

    const userMessage: Message = {
      role: "user",
      content: trimmed,
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
        }),
      });

    const data = await response.json();

const replyText =
  typeof data.reply === "string"
    ? data.reply
    : typeof data.answer === "string"
      ? data.answer
      : typeof data.reply?.answer === "string"
        ? data.reply.answer
        : "No response received.";

const providerText =
  typeof data.provider === "string"
    ? data.provider
    : typeof data.reply?.provider === "string"
      ? data.reply.provider
      : "";

const sourcesText = Array.isArray(data.sources) ? data.sources : [];

const assistantMessage: Message = {
       role: "assistant",
       content: replyText,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setLastProvider(providerText);
      setLastSources(sourcesText);
      setLastUpdated(new Date().toLocaleString());
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Failed to connect to the backend.",
        },
      ]);
      setLastProvider("");
      setLastSources([]);
    } finally {
      setIsSending(false);
    }
  };

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
        throw new Error(data.details || data.status || "Upload failed");
      }

      setUploadStatus(
        `Uploaded: ${data.filename || selectedFile.name} | Chunks: ${data.total_chunks || 0}`
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

  const formatScore = (score: number) => score.toFixed(3);

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6">
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
          </div>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[300px_1fr_320px]">
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
                    className="mt-4 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
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
                    className="mt-4 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
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

          <section className="flex flex-col rounded-3xl border border-zinc-800 bg-zinc-950">
            <div className="border-b border-zinc-800 px-6 py-4">
              <h2 className="text-lg font-semibold">AI Chat</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Ask questions about uploaded documents.
              </p>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "ml-auto bg-white text-black"
                      : "bg-zinc-800 text-white"
                  }`}
                >
                  {msg.content}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {lastProvider && (
              <div className="border-t border-zinc-800 px-6 py-4">
                <div className="rounded-2xl border border-zinc-800 bg-black p-4 text-sm text-zinc-300">
                  <p>
                    Response generated by:{" "}
                    <span className="text-white">{lastProvider}</span>
                  </p>

                  {lastSources.length > 0 && (
                    <div className="mt-4">
                      <p className="mb-2 text-zinc-300">Sources:</p>
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
                  )}
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
                  className="flex-1 rounded-2xl border border-zinc-700 bg-black px-4 py-3 text-sm outline-none placeholder:text-zinc-500"
                />

                <button
                  onClick={handleSendMessage}
                  disabled={isSending}
                  className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSending ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </section>

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
                <li>Multi-provider LLM fallback</li>
                <li>Source-aware chat responses</li>
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
                <li>Sentence Transformers</li>
                <li>Ollama / Gemini / Groq</li>
              </ul>
            </div>

            {/* Future upgrade: conversation memory
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
              <h3 className="text-lg font-semibold">Memory</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Later we can add session memory, follow-up question context,
                and user workspace history.
              </p>
            </div>
            */}

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
          </aside>
        </div>
      </div>
    </main>
  );
}