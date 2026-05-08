import { useEffect, useState } from 'react'
import { datasetsAPI } from '../api'
import Modal from './Modal'
import UploadStep from './UploadStep'

export default function ProjectWorkflowModal({ project, open, onClose, onContinue }) {
  const [datasets, setDatasets] = useState({ source: null, target: null })

  useEffect(() => {
    if (!open || !project) return

    const loadDatasets = async () => {
      try {
        const list = await datasetsAPI.list(project.id)
        const source = list.find((d) => d.dataset_type === 'source') || null
        const target = list.find((d) => d.dataset_type === 'target') || null
        setDatasets({ source, target })
      } catch {
        setDatasets({ source: null, target: null })
      }
    }

    loadDatasets()
  }, [open, project])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${project?.name} - Data Uploads`}
      subtitle="Upload source and target CSV/XLSX files, then continue to mapping."
      size="xl"
    >
      <UploadStep
        project={project}
        datasets={Object.values(datasets).filter(Boolean)}
        onNext={(nextDatasets) => {
          setDatasets({ source: nextDatasets.source, target: nextDatasets.target })
          onContinue?.(project.id)
        }}
      />
    </Modal>
  )
}
