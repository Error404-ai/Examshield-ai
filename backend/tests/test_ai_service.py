import httpx
import pytest

from app.services import ai_service


class FakeClient:
    def __init__(self, statuses):
        self.statuses = iter(statuses)
        self.calls = 0

    async def post(self, url, headers, json):
        self.calls += 1
        return httpx.Response(next(self.statuses), request=httpx.Request("POST", url))


@pytest.mark.asyncio
async def test_gemini_retries_transient_server_errors(monkeypatch):
    client = FakeClient([503, 500, 200])
    delays = []

    async def fake_sleep(delay):
        delays.append(delay)

    monkeypatch.setattr(ai_service.asyncio, "sleep", fake_sleep)
    response = await ai_service._post_with_retry(client, "test-model", {}, {})

    assert response.status_code == 200
    assert client.calls == 3
    assert delays == [0.5, 1.0]


@pytest.mark.asyncio
async def test_gemini_does_not_retry_client_errors(monkeypatch):
    client = FakeClient([429])
    delays = []

    async def fake_sleep(delay):
        delays.append(delay)

    monkeypatch.setattr(ai_service.asyncio, "sleep", fake_sleep)
    response = await ai_service._post_with_retry(client, "test-model", {}, {})

    assert response.status_code == 429
    assert client.calls == 1
    assert delays == []


@pytest.mark.asyncio
async def test_gemini_returns_last_response_after_retry_limit(monkeypatch):
    client = FakeClient([503, 503, 503])

    async def fake_sleep(_delay):
        return None

    monkeypatch.setattr(ai_service.asyncio, "sleep", fake_sleep)
    response = await ai_service._post_with_retry(client, "test-model", {}, {})

    assert response.status_code == 503
    assert client.calls == ai_service.TRANSIENT_RETRIES + 1
