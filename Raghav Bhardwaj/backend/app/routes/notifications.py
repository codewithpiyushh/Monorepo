"""
backend/app/routes/notifications.py
Phase 3, Chunk 5 — Real-time notification router

Endpoints:
  GET  /api/v1/notifications/stream        SSE stream for current user (token in query param)
  GET  /api/v1/notifications/unread-count  Badge count (polling fallback)
  GET  /api/v1/notifications               List (paginated)
  POST /api/v1/notifications/{id}/read     Mark one as read
  POST /api/v1/notifications/read-all      Mark all as read
  DELETE /api/v1/notifications/{id}        Dismiss one

SSE note: Browser EventSource does not support custom headers, so JWT is
passed as a ?token= query parameter and validated server-side.
"""
import asyncio
import json
import logging
from datetime import datetime
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from ..database import get_db
from ..rbac.roles import ADMIN, PREPARER, APPROVER, CERTIFIER
from ..rbac.dependencies import role_required

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications-v1"])

_ALL_ROLES = [ADMIN, PREPARER, APPROVER, CERTIFIER]


# ─────────────────────────────────────────────────────────────────────────────
# SSE generator
# ─────────────────────────────────────────────────────────────────────────────

async def _event_generator(user_id: int, poll_secs: float = 4.0) -> AsyncGenerator[str, None]:
    """
    Long-lived async generator.
    Polls ui_notifications for new unread rows every poll_secs seconds.
    Yields Server-Sent Events.
    """
    from ..database import SessionLocal

    # Start cursor: highest existing id for this user (don't replay history)
    db = SessionLocal()
    try:
        last_id = int(db.execute(
            text("SELECT COALESCE(MAX(id), 0) FROM ui_notifications WHERE user_id = :uid"),
            {"uid": user_id},
        ).scalar() or 0)
    except Exception:
        last_id = 0
    finally:
        db.close()

    # Initial handshake
    yield f"event: connected\ndata: {{\"status\":\"ok\",\"user_id\":{user_id}}}\n\n"

    while True:
        db = SessionLocal()
        try:
            rows = db.execute(
                text("""
                    SELECT id, notification_type, title, message, icon_type,
                           is_read, action_url, action_label, metadata_json, created_at
                    FROM ui_notifications
                    WHERE user_id = :uid AND id > :last AND is_read = 0
                    ORDER BY id ASC
                    LIMIT 20
                """),
                {"uid": user_id, "last": last_id},
            ).fetchall()

            for row in rows:
                last_id = row.id
                payload = {
                    "id":                row.id,
                    "notification_type": row.notification_type,
                    "title":             row.title,
                    "message":           row.message,
                    "icon_type":         row.icon_type,
                    "is_read":           bool(row.is_read),
                    "action_url":        row.action_url,
                    "action_label":      row.action_label,
                    "created_at":        row.created_at.isoformat() if row.created_at else None,
                }
                yield f"event: notification\ndata: {json.dumps(payload)}\n\n"

            # Heartbeat to keep the connection alive through proxies
            yield f"event: heartbeat\ndata: {{\"ts\":\"{datetime.utcnow().isoformat()}\"}}\n\n"

        except Exception as exc:
            log.warning(f"[SSE] Poll error for user {user_id}: {exc}")
        finally:
            db.close()

        await asyncio.sleep(poll_secs)


# ─────────────────────────────────────────────────────────────────────────────
# SSE endpoint
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/stream")
async def notification_stream(
    token: str = Query(..., description="JWT — passed as query param (EventSource limitation)"),
):
    """
    Server-Sent Events stream.
    Client connects once after login and stays open.
    Browser receives 'notification' events as JSON; 'heartbeat' events keep the socket alive.
    """
    from ..core.security import decode_token
    from ..database import SessionLocal

    payload = decode_token(token)
    if not payload:
        return Response(content="Unauthorized", status_code=401)

    user_id_raw = payload.get("sub")
    if user_id_raw is None:
        return Response(content="Unauthorized", status_code=401)

    try:
        user_id = int(user_id_raw)
    except (ValueError, TypeError):
        return Response(content="Unauthorized", status_code=401)

    # Verify user exists and is active
    db = SessionLocal()
    try:
        from ..models.models import User
        user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
        if not user:
            return Response(content="Unauthorized", status_code=401)
    finally:
        db.close()

    return StreamingResponse(
        _event_generator(user_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",     # nginx: disable proxy buffering
            "Connection":       "keep-alive",
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# REST endpoints (polling fallback + actions)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    current_user=Depends(role_required(_ALL_ROLES)),
):
    count = db.execute(
        text("SELECT COUNT(*) FROM ui_notifications WHERE user_id = :uid AND is_read = 0"),
        {"uid": current_user.id},
    ).scalar()
    return {"count": int(count or 0)}


@router.get("")
def list_notifications(
    limit:       int  = Query(20, ge=1, le=100),
    offset:      int  = Query(0,  ge=0),
    unread_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user=Depends(role_required(_ALL_ROLES)),
):
    where  = "user_id = :uid"
    params = {"uid": current_user.id, "limit": limit, "offset": offset}
    if unread_only:
        where += " AND is_read = 0"

    rows = db.execute(
        text(f"""
            SELECT id, notification_type, title, message, icon_type,
                   is_read, action_url, action_label, metadata_json, created_at, read_at
            FROM ui_notifications
            WHERE {where}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    ).fetchall()

    total = int(db.execute(
        text(f"SELECT COUNT(*) FROM ui_notifications WHERE {where}"),
        {"uid": current_user.id},
    ).scalar() or 0)

    unread = int(db.execute(
        text("SELECT COUNT(*) FROM ui_notifications WHERE user_id = :uid AND is_read = 0"),
        {"uid": current_user.id},
    ).scalar() or 0)

    return {
        "items": [
            {
                "id":                r.id,
                "notification_type": r.notification_type,
                "title":             r.title,
                "message":           r.message,
                "icon_type":         r.icon_type,
                "is_read":           bool(r.is_read),
                "action_url":        r.action_url,
                "action_label":      r.action_label,
                "created_at":        r.created_at.isoformat() if r.created_at else None,
                "read_at":           r.read_at.isoformat()    if r.read_at    else None,
            }
            for r in rows
        ],
        "total":  total,
        "unread": unread,
    }


@router.post("/{notification_id}/read")
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required(_ALL_ROLES)),
):
    db.execute(
        text("""
            UPDATE ui_notifications
            SET is_read = 1, read_at = :now
            WHERE id = :id AND user_id = :uid
        """),
        {"id": notification_id, "uid": current_user.id, "now": datetime.utcnow()},
    )
    db.commit()
    return {"success": True}


@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user=Depends(role_required(_ALL_ROLES)),
):
    result = db.execute(
        text("""
            UPDATE ui_notifications
            SET is_read = 1, read_at = :now
            WHERE user_id = :uid AND is_read = 0
        """),
        {"uid": current_user.id, "now": datetime.utcnow()},
    )
    db.commit()
    return {"updated": result.rowcount}


@router.delete("/{notification_id}")
def dismiss_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_required(_ALL_ROLES)),
):
    db.execute(
        text("DELETE FROM ui_notifications WHERE id = :id AND user_id = :uid"),
        {"id": notification_id, "uid": current_user.id},
    )
    db.commit()
    return {"success": True}
