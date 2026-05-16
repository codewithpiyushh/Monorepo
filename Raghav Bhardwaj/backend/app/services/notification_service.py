import smtplib
import mimetypes
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from pathlib import Path
from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.models import NotificationEvent


def _queue_event(db: Session, event_type: str, workflow_id: int | None, recipient_email: str | None, subject: str, body: str):
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
    return event


def send_email(
    db: Session,
    *,
    event_type: str,
    workflow_id: int | None,
    recipient_email: str | None,
    subject: str,
    body: str,
    attachments: list[str] | None = None,
):
    event = _queue_event(db, event_type, workflow_id, recipient_email, subject, body)
    # If SMTP is not configured, keep a safe local audit trail.
    if not settings.SMTP_HOST or not recipient_email:
        event.status = "SENT"
        event.sent_at = datetime.utcnow()
        db.commit()
        db.refresh(event)
        return event

    try:
        msg = MIMEMultipart()
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM_EMAIL
        msg["To"] = recipient_email
        msg.attach(MIMEText(body, "plain", "utf-8"))
        for file_path in attachments or []:
            p = Path(file_path)
            if not p.exists():
                continue
            mime, _ = mimetypes.guess_type(str(p))
            maintype, subtype = (mime.split("/", 1) if mime else ("application", "octet-stream"))
            with p.open("rb") as f:
                part = MIMEBase(maintype, subtype)
                part.set_payload(f.read())
                encoders.encode_base64(part)
                part.add_header("Content-Disposition", f'attachment; filename="{p.name}"')
                msg.attach(part)
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if settings.SMTP_USERNAME:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_FROM_EMAIL, [recipient_email], msg.as_string())
        event.status = "SENT"
        event.sent_at = datetime.utcnow()
    except Exception as exc:
        event.status = "FAILED"
        event.error_message = str(exc)
    db.commit()
    db.refresh(event)
    return event
