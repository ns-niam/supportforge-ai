"use client";

import { useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
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

      const assistantMessage: Message = {
        role: "assistant",
        content: data.reply || "No response received.",
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Failed to connect to the backend.",
        },
      ]);
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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Upload failed");
      }

      setUploadStatus(
        `Uploaded: ${data.filename} | Chunks: ${data.total_chunks || 0}`
      );
    } catch (error) {
      setUploadStatus(
        error instanceof Error ? error.message : "Upload failed"
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6">
        <header className="mb-6 flex items-center justify-between border-b border-zinc-800 pb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              SupportForge AI
            </h1>

            <p className="mt-1 text-sm text-zinc-400">
              AI Customer Support & Knowledge Assistant Platform
            </p>
          </div>

          <div className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300">
            Dashboard
          </div>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
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
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500" />

                  <span className="text-sm">
                    Backend connection active
                  </span>
                </div>
              </div>
            </div>
          </aside>

          <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="flex flex-col rounded-3xl border border-zinc-800 bg-zinc-950">
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
              </div>

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
            </div>

            <div className="space-y-6">
              <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
                <h3 className="text-lg font-semibold">
                  Project Overview
                </h3>

                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  SupportForge AI helps businesses upload documents,
                  extract knowledge, and answer customer questions
                  using AI-powered retrieval.
                </p>
              </div>

              <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
                <h3 className="text-lg font-semibold">Features</h3>

                <ul className="mt-4 space-y-3 text-sm text-zinc-400">
                  <li>PDF upload and extraction</li>
                  <li>Document chunking for RAG</li>
                  <li>Vector retrieval system</li>
                  <li>Chat interface</li>
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
                </ul>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}