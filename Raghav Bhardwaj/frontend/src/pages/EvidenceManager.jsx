import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { enterpriseAPI } from '../api'
import toast from 'react-hot-toast'

export default function EvidenceManager() {
  const [recordId, setRecordId] = useState('')
  const [docType, setDocType] = useState('invoice')
  const [docName, setDocName] = useState('')
  const [docPath, setDocPath] = useState('/docs/evidence.pdf')
  const [selectedFile, setSelectedFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  const { data: attachments = [], refetch } = useQuery({
    queryKey: ['attachments', recordId],
    queryFn: () => enterpriseAPI.listAttachments(recordId),
    enabled: !!recordId,
  })

  const uploadMutation = useMutation({
    mutationFn: ({ rid, payload }) => enterpriseAPI.uploadAttachment(rid, payload),
    onSuccess: () => {
      toast.success('Evidence uploaded')
      setSelectedFile(null)
      setDocName('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      refetch()
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Upload failed'),
  })

  const handleFileSelect = (file) => {
    if (!file) return
    setSelectedFile(file)
    setDocName(file.name)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="section-header"><h1 className="text-base font-semibold text-white">Attachments / Evidence Manager</h1></div>
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4 space-y-2">
          <input className="input" value={recordId} onChange={(e) => setRecordId(e.target.value)} placeholder="Reconciliation Record ID" />
          <div
            className={`border border-dashed rounded-md p-4 text-center cursor-pointer ${isDragging ? 'border-brand-600 bg-brand-900/10' : 'border-surface-700'}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragging(false)
              handleFileSelect(e.dataTransfer.files?.[0] || null)
            }}
          >
            <p className="text-sm text-slate-200">Drag and drop evidence file here</p>
            <p className="text-xs text-slate-500 mt-1">or click to browse</p>
            {selectedFile && <p className="text-xs text-slate-300 mt-2">Selected: {selectedFile.name}</p>}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input className="input" value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="document_type" />
            <input className="input" value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="document_name" />
            <input className="input" value={docPath} onChange={(e) => setDocPath(e.target.value)} placeholder="document_path" />
          </div>
          <button
            className="btn-primary"
            onClick={() =>
              uploadMutation.mutate({
                rid: Number(recordId),
                payload: { document_type: docType, document_name: docName, document_path: docPath, file: selectedFile },
              })
            }
            disabled={!recordId || !docName}
          >
            Upload Evidence
          </button>
        </div>
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-200 mb-2">Evidence List</h2>
          <div className="space-y-2 max-h-[540px] overflow-auto">
            {attachments.map((a) => (
              <div key={a.id} className="border border-surface-700 rounded-md p-3">
                <div className="text-sm text-slate-200">{a.document_name}</div>
                <div className="text-xs text-slate-400 mt-1">{a.document_type} | {a.document_status} | by:{a.uploaded_by ?? '-'}</div>
                <div className="text-xs text-slate-500 mt-1 truncate">{a.document_path}</div>
              </div>
            ))}
            {recordId && attachments.length === 0 && <p className="text-xs text-slate-500">No attachments found.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
