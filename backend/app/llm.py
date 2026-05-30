import json
import os
from typing import Dict, List, Optional, Tuple
from urllib import error as urlerror
from urllib import request as urlrequest


DEFAULT_TIMEOUT = 90
DEFAULT_TEMPERATURE = 0.2


def _post_json(
    url: str,
    payload: dict,
    headers: Optional[dict] = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> dict:
    data = json.dumps(payload).encode("utf-8")

    req = urlrequest.Request(
        url,
        data=data,
        method="POST",
    )

    req.add_header("Content-Type", "application/json")

    if headers:
        for key, value in headers.items():
            req.add_header(key, value)

    try:
        with urlrequest.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}

    except urlerror.HTTPError as error:
        body = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {error.code}: {body}")

    except urlerror.URLError as error:
        raise RuntimeError(f"Connection failed: {error}")


def _build_system_prompt() -> str:
    return (
        "You are SupportForge AI, an advanced AI business support assistant. "
        "Your job is to answer clearly, accurately, and professionally. "
        "Always prioritize retrieved document context when available. "
        "Never invent unsupported facts. "
        "If the document context is insufficient, clearly mention the limitation. "
        "Provide concise but useful answers. "
        "Use structured reasoning when needed."
    )


def _build_user_prompt(question: str, context: str) -> str:
    clean_question = question.strip()

    clean_context = (
        context.strip()
        if context.strip()
        else "No retrieved document context available."
    )

    return f"""
Document Context:
{clean_context}

User Question:
{clean_question}
"""


def _clip_context(context: str) -> str:
    max_chars = int(os.getenv("RAG_MAX_CONTEXT_CHARS", "12000"))

    if len(context) <= max_chars:
        return context

    return context[:max_chars] + "\n\n[Context truncated]"


def _extract_gemini_text(response: dict) -> str:
    candidates = response.get("candidates", [])

    if not candidates:
        return ""

    content = candidates[0].get("content", {})
    parts = content.get("parts", [])

    texts: List[str] = []

    for part in parts:
        text = part.get("text", "")

        if text:
            texts.append(text)

    return "\n".join(texts).strip()


def _generate_with_ollama(
    question: str,
    context: str,
) -> Tuple[str, str]:
    base_url = os.getenv(
        "OLLAMA_BASE_URL",
        "http://127.0.0.1:11434",
    ).rstrip("/")

    model = os.getenv("OLLAMA_MODEL", "").strip()

    if not model:
        raise RuntimeError("OLLAMA_MODEL is not configured")

    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": _build_system_prompt(),
            },
            {
                "role": "user",
                "content": _build_user_prompt(question, context),
            },
        ],
        "stream": False,
        "options": {
            "temperature": DEFAULT_TEMPERATURE,
        },
    }

    response = _post_json(
        f"{base_url}/api/chat",
        payload,
    )

    message = response.get("message", {}) or {}

    content = message.get("content", "").strip()

    if not content:
        content = response.get("response", "").strip()

    if not content:
        raise RuntimeError("Ollama returned an empty response")

    return content, f"ollama:{model}"


def _generate_with_gemini(
    question: str,
    context: str,
) -> Tuple[str, str]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()

    model = os.getenv(
        "GEMINI_MODEL",
        "gemini-2.5-flash",
    ).strip()

    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    payload = {
        "systemInstruction": {
            "parts": [
                {
                    "text": _build_system_prompt(),
                }
            ]
        },
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": _build_user_prompt(question, context),
                    }
                ],
            }
        ],
        "generationConfig": {
            "temperature": DEFAULT_TEMPERATURE,
        },
    }

    headers = {
        "x-goog-api-key": api_key,
    }

    response = _post_json(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        payload,
        headers=headers,
    )

    content = _extract_gemini_text(response)

    if not content:
        raise RuntimeError("Gemini returned an empty response")

    return content, f"gemini:{model}"


def _generate_with_groq(
    question: str,
    context: str,
) -> Tuple[str, str]:
    api_key = os.getenv("GROQ_API_KEY", "").strip()

    model = os.getenv("GROQ_MODEL", "").strip()

    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not configured")

    if not model:
        raise RuntimeError("GROQ_MODEL is not configured")

    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": _build_system_prompt(),
            },
            {
                "role": "user",
                "content": _build_user_prompt(question, context),
            },
        ],
        "temperature": DEFAULT_TEMPERATURE,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
    }

    response = _post_json(
        "https://api.groq.com/openai/v1/chat/completions",
        payload,
        headers=headers,
    )

    choices = response.get("choices", [])

    if not choices:
        raise RuntimeError("Groq returned no choices")

    message = choices[0].get("message", {}) or {}

    content = message.get("content", "").strip()

    if not content:
        raise RuntimeError("Groq returned an empty response")

    return content, f"groq:{model}"


def _call_provider(
    provider: str,
    question: str,
    context: str,
) -> Tuple[str, str]:
    if provider == "ollama":
        return _generate_with_ollama(question, context)

    if provider == "gemini":
        return _generate_with_gemini(question, context)

    if provider == "groq":
        return _generate_with_groq(question, context)

    raise RuntimeError(f"Unsupported provider: {provider}")


def generate_answer(
    question: str,
    context: str,
) -> Dict[str, str]:
    provider_order = os.getenv(
        "LLM_PROVIDER_ORDER",
        "ollama,gemini,groq",
    )

    providers = [
        item.strip().lower()
        for item in provider_order.split(",")
        if item.strip()
    ]

    prepared_context = _clip_context(context)

    errors: List[str] = []

    for provider in providers:
        try:
            answer, used_provider = _call_provider(
                provider,
                question,
                prepared_context,
            )

            return {
                "answer": answer,
                "provider": used_provider,
                "status": "success",
            }

        except Exception as error:
            errors.append(f"{provider}: {str(error)}")

    return {
        "answer": (
            "No AI provider is available right now. "
            "Please check provider configuration."
        ),
        "provider": "none",
        "status": "error",
        "details": " | ".join(errors),
    }