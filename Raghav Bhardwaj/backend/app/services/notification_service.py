"""
backend/app/services/notification_service.py
Phase 3, Chunk 5 — Notification service (in-app + email)

Provides:
  create_ui_notification() — writes UINotification row (instant in-app via SSE)
  notify_and_email()       — creates UI notification + queues email in background thread
  send_email()             — legacy synchronous email sender (preserved for compat)

Email is non-blocking: sent in a daemon thread so FastAPI routes return immediately.
Falls back gracefully when SMTP_HOST is not configured.
"""
import smtplib
import threading
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.models import UINotification, NotificationEvent, User


# ─────────────────────────────────────────────────────────────────────────────
# HTML email template
# ─────────────────────────────────────────────────────────────────────────────

_EMAIL_HTML = """\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body {{ font-family: -apple-system,'Helvetica Neue',Arial,sans-serif; background:#0F0F17; color:#E2E8F0; margin:0; padding:0; }}
  .wrap {{ max-width:560px; margin:32px auto; background:#1A1A2E; border-radius:12px; overflow:hidden; }}
  .header {{ background:#1E1E3A; padding:24px 32px; border-bottom:2px solid #FFE600; }}
  .header h1 {{ margin:0; font-size:22px; color:#FFE600; letter-spacing:-0.5px; }}
  .header p  {{ margin:6px 0 0; font-size:13px; color:#94A3B8; }}
  .body {{ padding:28px 32px; }}
  .body h2 {{ margin:0 0 12px; font-size:16px; color:#F1F5F9; }}
  .body p  {{ margin:0 0 16px; font-size:14px; color:#94A3B8; line-height:1.6; }}
  .badge {{ display:inline-block; padding:4px 12px; border-radius:9999px; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; }}
  .alert   {{ background:#FF4D4D22; color:#FF4D4D; border:1px solid #FF4D4D44; }}
  .info    {{ background:#4D94FF22; color:#4D94FF; border:1px solid #4D94FF44; }}
  .success {{ background:#00C89122; color:#00C891; border:1px solid #00C89144; }}
  .warning {{ background:#FFE60022; color:#FFE600; border:1px solid #FFE60044; }}
  .cta {{ display:inline-block; margin-top:8px; padding:10px 22px; background:#FFE600; color:#0F0F17; border-radius:8px; text-decoration:none; font-weight:700; font-size:14px; }}
  .footer {{ padding:16px 32px; border-top:1px solid #2D2D4A; font-size:11px; color:#475569; }}
</style></head>
<body>
<div class="wrap">
  <div class="header">
    <h1>DRMS</h1>
    <p>Data Reconciliation Management System</p>
  </div>
  <div class="body">
    <span class="badge {badge_class}">{notif_type}</span>
    <h2 style="margin-top:14px">{title}</h2>
    <p>{message}</p>
    {cta_block}
  </div>
  <div class="footer">This is an automated notification from DRMS &mdash; do not reply. &copy; {year} EY.</div>
</div>
</body></html>
"""

_TYPE_META = {
    "sla_breach":          ("alert",   "SLA Breach"),
    "escalation":          ("alert",   "Escalation"),
    "approval_bottleneck": ("warning", "Approval Bottleneck"),
    "workflow_action":     ("info",    "Workflow Update"),
    "comment_mention":     ("info",    "Mentioned You"),
    "exception":           ("warning", "Exception"),
    "certification":       ("success", "Certification"),
    "fx_alert":            ("warning", "FX Alert"),
    "system":              ("info",    "System"),
}


def _build_html(notification_type: str, title: str, message: str, action_url: Optional[str]) -> str:
    badge_cls, badge_label = _TYPE_META.get(notification_type.lower(), ("info", notification_type.upper()))
    cta = (
        f'<a href="http://localhost:5173{action_url}" class="cta">View in DRMS &rarr;</a>'
        if action_url else ""
    )
    return _EMAIL_HTML.format(
        badge_class=badge_cls,
        notif_type=badge_label,
        title=title,
        message=message,
        cta_block=cta,
        year=datetime.utcnow().year,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Core: in-app UI notification writer
# ─────────────────────────────────────────────────────────────────────────────

def create_ui_notification(
    db: Session,
    *,
    user_id: int,
    notification_type: str,
    title: str,
    message: str,
    action_url: Optional[str] = None,
    action_label: Optional[str] = None,
    icon_type: str = "info",
    metadata: Optional[dict] = None,
    is_demo_data: bool = False,
) -> UINotification:
    """Write one UINotification row. SSE stream delivers it to the user within ~4 s."""
    import json
    notif = UINotification(
        user_id=user_id,
        notification_type=notification_type,
        title=title,
        message=message,
        action_url=action_url,
        action_label=action_label,
        icon_type=icon_type,
        metadata_json=json.dumps(metadata) if metadata else None,
        is_demo_data=is_demo_data,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


# ─────────────────────────────────────────────────────────────────────────────
# Core: email sender (synchronous smtplib — run in thread for non-blocking use)
# ─────────────────────────────────────────────────────────────────────────────

def _smtp_send(recipient_email: str, subject: str, body_text: str, body_html: str) -> tuple[bool, str]:
    """Blocking SMTP send. Call from a background thread. Returns (ok, error_msg)."""
    from_addr = (
        getattr(settings, "smtp_from_email", None)
        or getattr(settings, "FROM_EMAIL", None)
        or "noreply@drms.local"
    )
    smtp_host = getattr(settings, "SMTP_HOST", None)
    if not smtp_host or not recipient_email:
        return True, ""  # graceful no-op — SMTP not configured

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"[DRMS] {subject}"
        msg["From"]    = from_addr
        msg["To"]      = recipient_email
        msg.attach(MIMEText(body_text, "plain", "utf-8"))
        msg.attach(MIMEText(body_html,  "html",  "utf-8"))

        smtp_port = getattr(settings, "SMTP_PORT", 587)
        use_tls   = getattr(settings, "smtp_use_tls", True)
        username  = getattr(settings, "smtp_username", None) or getattr(settings, "SMTP_USER", None)
        password  = getattr(settings, "smtp_password", None) or getattr(settings, "SMTP_PASSWORD", None)

        with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
            if use_tls:
                server.starttls()
            if username and password:
                server.login(username, password)
            server.sendmail(from_addr, [recipient_email], msg.as_string())
        return True, ""
    except Exception as exc:
        return False, str(exc)


def _background_email_task(
    event_type: str,
    workflow_id: Optional[int],
    recipient_email: Optional[str],
    subject: str,
    body_text: str,
    body_html: str,
) -> None:
    """Run in daemon thread: write NotificationEvent audit row, then send email."""
    from ..database import SessionLocal
    db = SessionLocal()
    try:
        event = NotificationEvent(
            event_type=event_type,
            workflow_id=workflow_id,
            recipient_email=recipient_email,
            subject=subject,
            body=body_text,
            status="QUEUED",
        )
        db.add(event)
        db.commit()
        db.refresh(event)

        if recipient_email:
            ok, err = _smtp_send(recipient_email, subject, body_text, body_html)
            event.status = "SENT" if ok else "FAILED"
            if not ok:
                event.error_message = err
        else:
            event.status = "SENT"   # no email target — in-app only
        event.sent_at = datetime.utcnow()
        db.commit()
    except Exception:
        pass
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Public: combined in-app notification + async email
# ─────────────────────────────────────────────────────────────────────────────

def notify_and_email(
    db: Session,
    *,
    user_id: int,
    notification_type: str,
    title: str,
    message: str,
    action_url: Optional[str] = None,
    action_label: Optional[str] = None,
    icon_type: str = "info",
    metadata: Optional[dict] = None,
    send_email_flag: bool = True,
    is_demo_data: bool = False,
) -> UINotification:
    """
    Primary notification entrypoint for all services.

    1. Immediately creates a UINotification row (SSE stream delivers it within ~4 s).
    2. Fires email in a background daemon thread (non-blocking, does not hold the DB session).
    Returns the UINotification object.
    """
    notif = create_ui_notification(
        db,
        user_id=user_id,
        notification_type=notification_type,
        title=title,
        message=message,
        action_url=action_url,
        action_label=action_label,
        icon_type=icon_type,
        metadata=metadata,
        is_demo_data=is_demo_data,
    )

    if send_email_flag:
        user = db.query(User).filter(User.id == user_id).first()
        recipient = user.email if user else None
        html = _build_html(notification_type, title, message, action_url)
        t = threading.Thread(
            target=_background_email_task,
            args=(notification_type, None, recipient, title, message, html),
            daemon=True,
        )
        t.start()

    return notif


# ─────────────────────────────────────────────────────────────────────────────
# Legacy compat: keep old send_email() signature working
# ─────────────────────────────────────────────────────────────────────────────

def send_email(
    db: Session,
    *,
    event_type: str,
    workflow_id: Optional[int],
    recipient_email: Optional[str],
    subject: str,
    body: str,
    attachments: list | None = None,
):
    """Legacy synchronous email sender — preserved for backward compatibility with existing callers."""
    event = NotificationEvent(
        event_type=event_type,
        workflow_id=workflow_id,
        recipient_email=recipient_email,
        subject=subject,
        body=body,
        status="QUEUED",
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    from_addr = (
        getattr(settings, "smtp_from_email", None)
        or getattr(settings, "FROM_EMAIL", None)
        or "noreply@drms.local"
    )
    smtp_host = getattr(settings, "SMTP_HOST", None)
    if not smtp_host or not recipient_email:
        event.status = "SENT"
        event.sent_at = datetime.utcnow()
        db.commit()
        return event

    ok, err = _smtp_send(recipient_email, subject, body, f"<pre>{body}</pre>")
    event.status = "SENT" if ok else "FAILED"
    if not ok:
        event.error_message = err
    event.sent_at = datetime.utcnow()
    db.commit()
    db.refresh(event)
    return event
