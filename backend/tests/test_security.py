from datetime import timedelta

from app.core.security import SecurityUtils


def test_password_hash_roundtrip():
    hashed = SecurityUtils.hash_password("secret123")
    assert hashed != "secret123"
    assert SecurityUtils.verify_password("secret123", hashed)
    assert not SecurityUtils.verify_password("wrong", hashed)


def test_token_roundtrip():
    token = SecurityUtils.create_access_token({"sub": "u1", "role": "student"})
    payload = SecurityUtils.verify_token(token)
    assert payload["sub"] == "u1"
    assert payload["role"] == "student"


def test_expired_token_is_rejected():
    token = SecurityUtils.create_access_token({"sub": "u1"}, expires_delta=timedelta(seconds=-5))
    assert SecurityUtils.verify_token(token) is None


def test_tampered_token_is_rejected():
    token = SecurityUtils.create_access_token({"sub": "u1"})
    assert SecurityUtils.verify_token(token[:-2] + "xx") is None
    assert SecurityUtils.verify_token("not-a-jwt") is None