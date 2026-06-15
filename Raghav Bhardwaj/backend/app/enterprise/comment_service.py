"""
In-Context Comment Threads Service
====================================
Business logic for reconciliation_comments, comment_mentions, comment_reads.

Rules:
- Comments are IMMUTABLE once inserted (no update, no delete)
- @username mentions are extracted from content and written to comment_mentions
- Mentions trigger a ui_notification via notification_service
- CERTIFIED and CLOSED balances block new comment creation
- System lifecycle transitions inject SYSTEM_EVENT comments automatically
- Balance list queries get comment_count, last_comment_at, last_comment_by
"""
from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..models.models import User
from ..services import audit_service, notification_service

logger = logging.getLogger(__name__)

COMMENT_TYPES  = {"DISCUSSION", "QUESTION", "RESPONSE", "SYSTEM_EVENT", "AUDITOR_NOTE"}
FROZEN_STATES  = {"CERTIFIED", "CLOSED"}
MENTION_PATTERN = re.compile(r"@(\w+)")


# ─────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.utcnow()


def _get_user(db: Session, user_id: int | None) -> User | None:
    if not user_id:
        return None
    return db.query(User).filter(User.id == user_id).first()


def _get_balance_status(db: Session, balance_id: int) -> str:
    row = db.execute(
        text("SELECT status FROM reconciliation_balances WHERE id = :id"),
        {"id": balance_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Balance {balance_id} not found")
    return row.status or "DRAFT"


def _row_to_dict(row) -> dict:
    return dict(row._mapping) if hasattr(row, "_mapping") else dict(row)


# ─────────────────────────────────────────────────────────────
# Mention extraction + notification
# ─────────────────────────────────────────────────────────────

def _extract_and_store_mentions(
    db: Session,
    comment_id: int,
    content: str,
    author_id: int | None,
) -> list[int]:
    """
    Parse @username patterns from content.
    For each valid username:
    1. Resolve to user_id
    2. Insert into comment_mentions
    3. Fire a ui_notification via notification_service.send_email()
    Returns list of mentioned user_ids.
    """
    usernames = list(set(MENTION_PATTERN.findall(content)))
    mentioned_ids = []

    for username in usernames:
        user = db.query(User).filter(User.username == username, User.is_active == True).first()
        if not user:
            continue
        if user.id == author_id:
            continue   # don't self-notify

        # Write mention record
        db.execute(
            text("""
                INSERT OR IGNORE INTO comment_mentions (comment_id, user_id, created_at)
                VALUES (:cid, :uid, :now)
            """),
            {"cid": comment_id, "uid": user.id, "now": _now()},
        )
        mentioned_ids.append(user.id)

        # UI notification (reuse existing send_email; subject signals in-app alert)
        try:
            notification_service.send_email(
                db,
                event_type="COMMENT_MENTION",
                workflow_id=None,
                recipient_email=user.email,
                subject=f"[DRMS] You were mentioned in a reconciliation comment",
                body=(
                    f"@{username}: you were mentioned in a comment on balance #{comment_id // 1}.\n\n"
                    f"'{content[:200]}{'…' if len(content) > 200 else ''}'\n\n"
                    f"Log in to DRMS to view and respond."
                ),
            )
        except Exception as exc:
            logger.warning("Mention notification failed (non-fatal): %s", exc)

    db.commit()
    return mentioned_ids


# ─────────────────────────────────────────────────────────────
# Create comment
# ─────────────────────────────────────────────────────────────

def create_comment(
    db:               Session,
    balance_id:       int,
    author_id:        int | None,
    content:          str,
    comment_type:     str              = "DISCUSSION",
    parent_comment_id: int | None      = None,
    attachment_id:    int | None       = None,
    is_system:        bool             = False,
) -> dict:
    """
    Insert an immutable comment on a balance.

    Enforces:
    - CERTIFIED / CLOSED balances block human comments (system events still allowed)
    - comment_type must be valid
    - content must be non-empty
    - Parent comment must belong to the same balance if provided
    - Extracts @mentions and notifies users
    - Writes to audit trail
    """
    if not content or not content.strip():
        raise HTTPException(status_code=400, detail="Comment content cannot be empty")

    comment_type = comment_type.upper()
    if comment_type not in COMMENT_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid comment_type '{comment_type}'. Must be one of {sorted(COMMENT_TYPES)}",
        )

    # Freeze check — human comments only (system events bypass)
    if not is_system:
        status = _get_balance_status(db, balance_id)
        if status in FROZEN_STATES:
            raise HTTPException(
                status_code=423,
                detail=(
                    f"This balance is {status}. The comment thread is frozen as a permanent "
                    "read-only audit artifact. No new comments can be added."
                ),
            )

    # Validate parent belongs to same balance
    if parent_comment_id:
        parent = db.execute(
            text("SELECT balance_id FROM reconciliation_comments WHERE id = :id"),
            {"id": parent_comment_id},
        ).fetchone()
        if not parent:
            raise HTTPException(status_code=404, detail=f"Parent comment {parent_comment_id} not found")
        if parent.balance_id != balance_id:
            raise HTTPException(
                status_code=400,
                detail="Parent comment does not belong to this balance",
            )

    now = _now()
    result = db.execute(
        text("""
            INSERT INTO reconciliation_comments
                (balance_id, user_id, parent_comment_id, content,
                 comment_type, is_system_generated, attachment_id, created_at)
            VALUES
                (:balance_id, :user_id, :parent_id, :content,
                 :comment_type, :is_system, :attachment_id, :now)
        """),
        {
            "balance_id":    balance_id,
            "user_id":       author_id,
            "parent_id":     parent_comment_id,
            "content":       content.strip(),
            "comment_type":  comment_type,
            "is_system":     1 if is_system else 0,
            "attachment_id": attachment_id,
            "now":           now,
        },
    )
    db.commit()
    comment_id = result.lastrowid

    # Extract @mentions (skip for system-generated)
    mentioned_ids = []
    if not is_system and author_id:
        mentioned_ids = _extract_and_store_mentions(db, comment_id, content, author_id)

    # Audit log
    audit_service.log_action(
        db,
        action_type="COMMENT_CREATED",
        user_id=author_id,
        entity_type="reconciliation_comment",
        entity_id=comment_id,
        metadata={
            "balance_id":    balance_id,
            "comment_type":  comment_type,
            "is_system":     is_system,
            "mention_count": len(mentioned_ids),
        },
    )

    return get_comment(db, comment_id)


def create_system_event(
    db:         Session,
    balance_id: int,
    content:    str,
) -> dict:
    """
    Convenience wrapper for lifecycle hooks.
    Creates a SYSTEM_EVENT comment with no author.
    Called from lifecycle_service.py after each state transition.
    """
    return create_comment(
        db,
        balance_id=balance_id,
        author_id=None,
        content=content,
        comment_type="SYSTEM_EVENT",
        is_system=True,
    )


# ─────────────────────────────────────────────────────────────
# Read
# ─────────────────────────────────────────────────────────────

def get_comment(db: Session, comment_id: int) -> dict:
    row = db.execute(
        text("""
            SELECT rc.*,
                   u.username       AS author_username,
                   u.email          AS author_email,
                   u.role           AS author_role
            FROM   reconciliation_comments rc
            LEFT   JOIN users u ON u.id = rc.user_id
            WHERE  rc.id = :id
        """),
        {"id": comment_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Comment {comment_id} not found")
    return _enrich_comment(_row_to_dict(row), db)


def list_comments(
    db:           Session,
    balance_id:   int,
    comment_type: str | None  = None,
    reader_id:    int | None  = None,
) -> dict:
    """
    List all comments for a balance, optionally filtered by type.
    Also marks any unread comments as read for reader_id.
    Returns flat list — parent_comment_id is used by the UI for threading.
    """
    where = "WHERE rc.balance_id = :bid"
    params: dict = {"bid": balance_id}

    if comment_type:
        where += " AND rc.comment_type = :ctype"
        params["ctype"] = comment_type.upper()

    rows = db.execute(
        text(f"""
            SELECT rc.*,
                   u.username       AS author_username,
                   u.email          AS author_email,
                   u.role           AS author_role
            FROM   reconciliation_comments rc
            LEFT   JOIN users u ON u.id = rc.user_id
            {where}
            ORDER  BY rc.created_at ASC
        """),
        params,
    ).fetchall()

    comments = [_enrich_comment(_row_to_dict(r), db) for r in rows]

    # Mark as read
    if reader_id and comments:
        comment_ids = [c["id"] for c in comments]
        for cid in comment_ids:
            db.execute(
                text("""
                    INSERT OR IGNORE INTO comment_reads (comment_id, user_id, read_at)
                    VALUES (:cid, :uid, :now)
                """),
                {"cid": cid, "uid": reader_id, "now": _now()},
            )
        db.commit()

    # Unread count for reader
    unread = 0
    if reader_id:
        unread = sum(
            1 for c in comments
            if not any(r["user_id"] == reader_id for r in c.get("reads", []))
        )

    return {
        "balance_id":    balance_id,
        "total":         len(comments),
        "unread":        unread,
        "comment_types": list({c["comment_type"] for c in comments}),
        "comments":      comments,
    }


def _enrich_comment(c: dict, db: Session) -> dict:
    """Add mentions list and read receipts to a comment dict."""
    comment_id = c["id"]

    # Mentions
    mentions = db.execute(
        text("""
            SELECT cm.user_id, u.username, u.email
            FROM   comment_mentions cm
            JOIN   users u ON u.id = cm.user_id
            WHERE  cm.comment_id = :cid
        """),
        {"cid": comment_id},
    ).fetchall()
    c["mentions"] = [{"user_id": m.user_id, "username": m.username} for m in mentions]

    # Read receipts (summary: count only to keep payload small)
    read_count = db.execute(
        text("SELECT COUNT(*) FROM comment_reads WHERE comment_id = :cid"),
        {"cid": comment_id},
    ).scalar() or 0
    c["read_count"] = read_count

    return c


# ─────────────────────────────────────────────────────────────
# Mark read
# ─────────────────────────────────────────────────────────────

def mark_read(db: Session, comment_id: int, user_id: int) -> dict:
    db.execute(
        text("""
            INSERT OR IGNORE INTO comment_reads (comment_id, user_id, read_at)
            VALUES (:cid, :uid, :now)
        """),
        {"cid": comment_id, "uid": user_id, "now": _now()},
    )
    db.commit()
    return {"comment_id": comment_id, "user_id": user_id, "marked_read": True}


# ─────────────────────────────────────────────────────────────
# Balance aggregation
# ─────────────────────────────────────────────────────────────

def get_balance_comment_summary(db: Session, balance_id: int) -> dict:
    """
    Returns comment_count, last_comment_at, last_comment_by
    for embedding in balance list/grid responses.
    """
    row = db.execute(
        text("""
            SELECT
                COUNT(*)                             AS comment_count,
                MAX(rc.created_at)                   AS last_comment_at,
                u.username                           AS last_comment_by
            FROM   reconciliation_comments rc
            LEFT   JOIN users u
                   ON u.id = (
                       SELECT user_id FROM reconciliation_comments
                       WHERE  balance_id = :bid
                       ORDER  BY created_at DESC
                       LIMIT  1
                   )
            WHERE  rc.balance_id = :bid
        """),
        {"bid": balance_id},
    ).fetchone()

    return {
        "comment_count":    row.comment_count if row else 0,
        "last_comment_at":  row.last_comment_at if row else None,
        "last_comment_by":  row.last_comment_by if row else None,
    }


def enrich_balances_with_comment_summaries(db: Session, balances: list[dict]) -> list[dict]:
    """
    Bulk-enriches a list of balance dicts with comment summary fields.
    Called from the balance list endpoint.
    """
    if not balances:
        return balances

    ids = [b["id"] for b in balances if b.get("id")]
    if not ids:
        return balances

    placeholders = ", ".join(str(i) for i in ids)
    rows = db.execute(
        text(f"""
            SELECT
                balance_id,
                COUNT(*)       AS comment_count,
                MAX(created_at) AS last_comment_at
            FROM reconciliation_comments
            WHERE balance_id IN ({placeholders})
            GROUP BY balance_id
        """),
    ).fetchall()

    summary_map = {r.balance_id: {"comment_count": r.comment_count, "last_comment_at": r.last_comment_at} for r in rows}

    for b in balances:
        s = summary_map.get(b.get("id"), {})
        b["comment_count"]   = s.get("comment_count", 0)
        b["last_comment_at"] = s.get("last_comment_at")

    return balances
