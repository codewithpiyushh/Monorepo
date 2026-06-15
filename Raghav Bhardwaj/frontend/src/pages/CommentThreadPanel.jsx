/**
 * CommentThreadPanel
 * ───────────────────
 * Vertical chat sidebar for BalanceReconciliationPage.jsx.
 *
 * Features:
 *  • Human chat bubbles (DISCUSSION, QUESTION, RESPONSE, AUDITOR_NOTE)
 *  • SYSTEM_EVENT entries rendered as centered gray timeline markers
 *  • Dropdown filter by comment_type
 *  • @mention highlighting in content
 *  • Attachment ID input (Evidence Manager link)
 *  • Thread reply (parent_comment_id)
 *  • Read-receipt badge (unread count in panel header)
 *  • Full freeze when balance is CERTIFIED or CLOSED
 *  • No Edit or Delete buttons — ever
 *
 * Usage:
 *   import CommentThreadPanel from './CommentThreadPanel'
 *   <CommentThreadPanel balance={selectedBalance} />
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  MessageCircle, Send, Paperclip, Filter,
  User, Zap, Lock, ChevronDown, CornerDownRight,
  AlertCircle, BookOpen,
} from 'lucide-react'
import { commentsAPI } from '../api/commentsAPI'
import { useAuthStore }  from '../store/authStore'
import { normalizeRole } from '../utils/roles'

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const FROZEN_STATES   = ['CERTIFIED', 'CLOSED']
const COMMENT_TYPES   = ['DISCUSSION', 'QUESTION', 'RESPONSE', 'AUDITOR_NOTE', 'SYSTEM_EVENT']
const HUMAN_TYPES     = ['DISCUSSION', 'QUESTION', 'RESPONSE', 'AUDITOR_NOTE']

const TYPE_META = {
  DISCUSSION:   { label: 'Discussion',    color: 'var(--accent)',  icon: MessageCircle },
  QUESTION:     { label: 'Question',      color: '#F59E0B',        icon: AlertCircle },
  RESPONSE:     { label: 'Response',      color: '#10B981',        icon: CornerDownRight },
  AUDITOR_NOTE: { label: 'Auditor Note',  color: '#7C3AED',        icon: BookOpen },
  SYSTEM_EVENT: { label: 'System Event',  color: 'var(--text-disabled)', icon: Zap },
}

const fmtTime = (ts) => {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch { return ts }
}

// ─────────────────────────────────────────────────────────────
// @mention highlighter
// ─────────────────────────────────────────────────────────────
function HighlightedContent({ content }) {
  const parts = content.split(/(@\w+)/g)
  return (
    <span>
      {parts.map((p, i) =>
        p.startsWith('@') ? (
          <span key={i} style={{
            color: 'var(--accent)', fontWeight: 600,
            background: 'var(--accent)15', borderRadius: 4, padding: '0 2px',
          }}>{p}</span>
        ) : p
      )}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
// System event row
// ─────────────────────────────────────────────────────────────
function SystemEventRow({ comment }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 0', margin: '4px 0',
    }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border-0)' }} />
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        fontSize: 10, color: 'var(--text-disabled)', whiteSpace: 'nowrap',
        maxWidth: '80%',
      }}>
        <Zap size={9} color="var(--text-disabled)" />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {comment.content}
        </span>
        <span style={{ flexShrink: 0, opacity: 0.6 }}>{fmtTime(comment.created_at)}</span>
      </div>
      <div style={{ flex: 1, height: 1, background: 'var(--border-0)' }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Human comment bubble
// ─────────────────────────────────────────────────────────────
function CommentBubble({ comment, currentUserId, onReply }) {
  const isMine    = comment.user_id === currentUserId
  const meta      = TYPE_META[comment.comment_type] || TYPE_META.DISCUSSION
  const isReply   = Boolean(comment.parent_comment_id)

  return (
    <div style={{
      display: 'flex',
      flexDirection: isMine ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginBottom: 12,
      paddingLeft: isReply ? 24 : 0,
    }}>
      {/* Avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: `${meta.color}22`,
        border: `1.5px solid ${meta.color}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginTop: 2,
      }}>
        <User size={12} color={meta.color} />
      </div>

      {/* Bubble */}
      <div style={{ maxWidth: '75%' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
          flexDirection: isMine ? 'row-reverse' : 'row',
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
            {comment.author_username || 'Unknown'}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99,
            color: meta.color, background: `${meta.color}18`,
            border: `1px solid ${meta.color}33`,
          }}>{meta.label}</span>
          <span style={{ fontSize: 10, color: 'var(--text-disabled)' }}>
            {fmtTime(comment.created_at)}
          </span>
          {comment.read_count > 0 && (
            <span style={{ fontSize: 9, color: 'var(--text-disabled)' }}>
              · {comment.read_count} read
            </span>
          )}
        </div>

        {/* Content */}
        <div style={{
          padding: '8px 12px', borderRadius: isMine ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
          background: isMine ? 'var(--accent)18' : 'var(--surface-2)',
          border: `1px solid ${isMine ? 'var(--accent)33' : 'var(--border-0)'}`,
          fontSize: 12, lineHeight: 1.55, color: 'var(--text-primary)',
        }}>
          {isReply && (
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
              <CornerDownRight size={9} /> Reply
            </div>
          )}
          <HighlightedContent content={comment.content} />
          {comment.attachment_id && (
            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Paperclip size={9} /> Evidence #{comment.attachment_id}
            </div>
          )}
        </div>

        {/* Mentions */}
        {comment.mentions?.length > 0 && (
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 3 }}>
            Mentioned: {comment.mentions.map(m => `@${m.username}`).join(', ')}
          </div>
        )}

        {/* Reply button — no edit, no delete */}
        <button
          onClick={() => onReply(comment)}
          style={{
            marginTop: 4, fontSize: 10, background: 'none', border: 'none',
            color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px 0',
            display: 'flex', alignItems: 'center', gap: 3,
          }}
        >
          <CornerDownRight size={9} /> Reply
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Type filter dropdown
// ─────────────────────────────────────────────────────────────
function TypeFilter({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          height: 28, padding: '0 10px', fontSize: 11,
          background: value ? 'var(--accent)18' : 'var(--surface-2)',
          border: `1px solid ${value ? 'var(--accent)44' : 'var(--border-1)'}`,
          borderRadius: 6, color: value ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer',
        }}
      >
        <Filter size={11} />
        {value ? TYPE_META[value]?.label : 'All types'}
        <ChevronDown size={10} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 32, right: 0, zIndex: 100,
          background: 'var(--surface-0)', border: '1px solid var(--border-1)',
          borderRadius: 8, padding: '4px 0', minWidth: 160,
          boxShadow: '0 4px 16px rgba(0,0,0,.12)',
        }}>
          <button
            onClick={() => { onChange(null); setOpen(false) }}
            style={{ width: '100%', padding: '6px 12px', fontSize: 11, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            All types
          </button>
          {COMMENT_TYPES.map(t => {
            const m = TYPE_META[t]
            return (
              <button
                key={t}
                onClick={() => { onChange(t); setOpen(false) }}
                style={{
                  width: '100%', padding: '6px 12px', fontSize: 11, textAlign: 'left',
                  background: value === t ? `${m.color}12` : 'none',
                  border: 'none', cursor: 'pointer', color: m.color,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <m.icon size={10} color={m.color} /> {m.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Comment input
// ─────────────────────────────────────────────────────────────
function CommentInput({ balanceId, isFrozen, replyTo, onCancelReply, onPosted, role }) {
  const [content,      setContent]      = useState('')
  const [commentType,  setCommentType]  = useState('DISCUSSION')
  const [attachmentId, setAttachmentId] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => commentsAPI.post(balanceId, {
      content:           content.trim(),
      comment_type:      commentType,
      parent_comment_id: replyTo?.id || null,
      attachment_id:     attachmentId ? Number(attachmentId) : null,
    }),
    onSuccess: () => {
      toast.success('Comment posted')
      setContent(''); setAttachmentId('')
      if (onCancelReply) onCancelReply()
      qc.invalidateQueries({ queryKey: ['comments', balanceId] })
      if (onPosted) onPosted()
    },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Failed to post'),
  })

  if (isFrozen) {
    return (
      <div style={{
        padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--surface-2)', borderTop: '1px solid var(--border-0)',
      }}>
        <Lock size={13} color="var(--text-disabled)" />
        <span style={{ fontSize: 11, color: 'var(--text-disabled)' }}>
          Thread frozen — balance is certified. This is a read-only audit record.
        </span>
      </div>
    )
  }

  const allowedTypes = role === 'auditor'
    ? ['AUDITOR_NOTE']
    : HUMAN_TYPES

  return (
    <div style={{ borderTop: '1px solid var(--border-0)', padding: '10px 12px', background: 'var(--surface-0)' }}>
      {/* Reply indicator */}
      {replyTo && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 8px', marginBottom: 6,
          background: 'var(--accent)12', borderRadius: 6, fontSize: 11, color: 'var(--accent)',
        }}>
          <span><CornerDownRight size={9} style={{ display: 'inline', marginRight: 4 }} />
            Replying to @{replyTo.author_username}
          </span>
          <button onClick={onCancelReply} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 2, fontSize: 10 }}>✕</button>
        </div>
      )}

      {/* Type selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
        {allowedTypes.map(t => (
          <button
            key={t}
            onClick={() => setCommentType(t)}
            style={{
              height: 22, padding: '0 8px', fontSize: 9, fontWeight: 600,
              borderRadius: 99, cursor: 'pointer',
              background: commentType === t ? TYPE_META[t].color : 'var(--surface-2)',
              color: commentType === t ? '#fff' : 'var(--text-tertiary)',
              border: `1px solid ${commentType === t ? TYPE_META[t].color : 'var(--border-0)'}`,
            }}
          >
            {TYPE_META[t].label}
          </button>
        ))}
      </div>

      {/* Text area */}
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && content.trim()) {
            e.preventDefault()
            mutation.mutate()
          }
        }}
        rows={3}
        placeholder="Write a comment… Use @username to mention. Ctrl+Enter to send."
        style={{
          width: '100%', boxSizing: 'border-box', padding: '8px 10px',
          fontSize: 12, borderRadius: 8, resize: 'none',
          border: '1px solid var(--border-1)', background: 'var(--surface-2)',
          color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none',
        }}
      />

      {/* Footer: attachment + send */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        {/* Attachment input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
          <Paperclip size={12} color="var(--text-tertiary)" />
          <input
            type="number"
            value={attachmentId}
            onChange={e => setAttachmentId(e.target.value)}
            placeholder="Evidence ID"
            style={{
              width: 100, height: 26, padding: '0 6px', fontSize: 11,
              background: 'var(--surface-2)', border: '1px solid var(--border-0)',
              borderRadius: 5, color: 'var(--text-secondary)',
            }}
          />
        </div>

        <span style={{ fontSize: 10, color: 'var(--text-disabled)' }}>Ctrl+Enter</span>

        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !content.trim()}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            height: 30, padding: '0 14px', fontSize: 12, fontWeight: 600,
            background: 'var(--accent)', border: 'none', borderRadius: 6,
            color: '#fff', cursor: mutation.isPending || !content.trim() ? 'not-allowed' : 'pointer',
            opacity: mutation.isPending || !content.trim() ? 0.5 : 1,
          }}
        >
          <Send size={11} /> {mutation.isPending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────
export default function CommentThreadPanel({ balance }) {
  const user       = useAuthStore(s => s.user)
  const role       = normalizeRole(user?.role)
  const balanceId  = balance?.id
  const isFrozen   = FROZEN_STATES.includes(balance?.status)

  const [filterType, setFilterType] = useState(null)
  const [replyTo,    setReplyTo]    = useState(null)
  const bottomRef = useRef()

  const { data, isLoading } = useQuery({
    queryKey: ['comments', balanceId, filterType],
    queryFn:  () => commentsAPI.list(balanceId, filterType),
    enabled:  Boolean(balanceId),
    refetchInterval: 30_000,
  })

  // Auto-scroll to bottom on new comments
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [data?.comments?.length])

  const comments = data?.comments || []
  const unread   = data?.unread   || 0

  if (!balanceId) return null

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: 400, maxHeight: 700,
      border: '1px solid var(--border-1)', borderRadius: 10, overflow: 'hidden',
      background: 'var(--surface-0)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid var(--border-0)',
        background: 'var(--surface-1)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageCircle size={14} color="var(--accent)" />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            Comments
          </span>
          {unread > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
              background: 'var(--accent)', color: '#fff',
            }}>{unread} new</span>
          )}
          {isFrozen && <Lock size={11} color="var(--text-disabled)" />}
        </div>
        <TypeFilter value={filterType} onChange={setFilterType} />
      </div>

      {/* Thread body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-tertiary)', fontSize: 12 }}>
            Loading thread…
          </div>
        ) : comments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)', fontSize: 12 }}>
            <MessageCircle size={24} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.3 }} />
            {filterType ? `No ${TYPE_META[filterType]?.label} comments` : 'No comments yet'}
            {!isFrozen && !filterType && (
              <div style={{ marginTop: 4, fontSize: 11 }}>Be the first to comment on this reconciliation</div>
            )}
          </div>
        ) : (
          comments.map(c =>
            c.comment_type === 'SYSTEM_EVENT' ? (
              <SystemEventRow key={c.id} comment={c} />
            ) : (
              <CommentBubble
                key={c.id}
                comment={c}
                currentUserId={user?.id}
                onReply={setReplyTo}
              />
            )
          )
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <CommentInput
        balanceId={balanceId}
        isFrozen={isFrozen}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        role={role}
      />
    </div>
  )
}
