from __future__ import annotations

from dataclasses import dataclass, field
from threading import Lock
from time import time
from typing import Dict, List, Literal, Optional
from uuid import uuid4

# Future upgrade:
# Replace this in-memory store with Redis/PostgreSQL for persistence.
# Right now this is perfect for MVP and fast demos.

Role = Literal["user", "assistant"]


@dataclass
class MemoryMessage:
    role: Role
    content: str
    timestamp: float = field(default_factory=time)


@dataclass
class ConversationSession:
    session_id: str
    messages: List[MemoryMessage] = field(default_factory=list)
    updated_at: float = field(default_factory=time)


class ConversationMemory:
    def __init__(
        self,
        max_messages_per_session: int = 20,
        max_sessions: int = 500,
        ttl_seconds: int = 60 * 60 * 24,
    ) -> None:
        self._max_messages_per_session = max_messages_per_session
        self._max_sessions = max_sessions
        self._ttl_seconds = ttl_seconds
        self._sessions: Dict[str, ConversationSession] = {}
        self._lock = Lock()

    def new_session_id(self) -> str:
        return str(uuid4())

    def get_or_create_session(self, session_id: Optional[str] = None) -> ConversationSession:
        with self._lock:
            if not session_id:
                session_id = self.new_session_id()

            session = self._sessions.get(session_id)

            if session is None:
                session = ConversationSession(session_id=session_id)
                self._sessions[session_id] = session

            session.updated_at = time()
            self._prune_locked()
            return session

    def add_message(self, session_id: str, role: Role, content: str) -> None:
        with self._lock:
            session = self._sessions.get(session_id)

            if session is None:
                session = ConversationSession(session_id=session_id)
                self._sessions[session_id] = session

            session.messages.append(MemoryMessage(role=role, content=content))
            session.updated_at = time()

            if len(session.messages) > self._max_messages_per_session:
                session.messages = session.messages[-self._max_messages_per_session :]

            self._prune_locked()

    def get_recent_messages(self, session_id: str, limit: int = 6) -> List[MemoryMessage]:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return []
            return session.messages[-limit:]

    def build_context(self, session_id: str, limit: int = 6) -> str:
        recent_messages = self.get_recent_messages(session_id, limit=limit)

        if not recent_messages:
            return ""

        lines: List[str] = ["Conversation Memory:"]

        for item in recent_messages:
            speaker = "User" if item.role == "user" else "Assistant"
            lines.append(f"{speaker}: {item.content}")

        return "\n".join(lines).strip()

    def clear_session(self, session_id: str) -> None:
        with self._lock:
            if session_id in self._sessions:
                del self._sessions[session_id]

    def _prune_locked(self) -> None:
        now = time()

        stale_session_ids = [
            session_id
            for session_id, session in self._sessions.items()
            if now - session.updated_at > self._ttl_seconds
        ]

        for session_id in stale_session_ids:
            del self._sessions[session_id]

        if len(self._sessions) <= self._max_sessions:
            return

        sorted_sessions = sorted(
            self._sessions.items(),
            key=lambda item: item[1].updated_at,
        )

        overflow_count = len(self._sessions) - self._max_sessions

        for session_id, _ in sorted_sessions[:overflow_count]:
            if session_id in self._sessions:
                del self._sessions[session_id]


conversation_memory = ConversationMemory()