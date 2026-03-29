import React from 'react'
import {
  FileUpload as FileUploadUI,
  FileUploadDropzone,
  FileUploadTrigger,
  FileUploadList,
  FileUploadClear,
} from '@/components/ui/file-upload'
import { UploadIcon } from 'lucide-react'

interface FileUploadProps {
  value?: string
  placeholder?: string
  hint?: string
  accept?: string[] // file extensions without dot, e.g. ['eml', 'txt']
  multiple?: boolean
  onFile?: (path: string) => void
  onFiles?: (paths: string[]) => void
}

export function FileUpload({
  value,
  placeholder = 'Drop file here or click to browse',
  hint,
  accept,
  multiple = false,
  onFile,
  onFiles,
}: FileUploadProps): React.ReactElement {
  // Convert extension array (e.g. ['eml', 'txt']) to the comma-separated
  // accept string that FileUploadUI expects (e.g. '.eml,.txt')
  const acceptString = accept?.map((ext) => `.${ext}`).join(',')

  function handleValueChange(files: File[]) {
    if (files.length === 0) return
    const paths = files.map((f) => window.racedash.getFilePath(f))
    if (multiple && onFiles) {
      onFiles(paths)
    } else if (!multiple && onFile && paths[0]) {
      onFile(paths[0])
    }
  }

  // Derive a display label for the dropzone when a value (path) is already set
  const currentFileName = value ? (value.split(/[\\/]/).pop() ?? value) : undefined

  return (
    <FileUploadUI accept={acceptString} multiple={multiple} onValueChange={handleValueChange}>
      <FileUploadDropzone className="gap-3 py-8">
        <div className="flex flex-col items-center gap-1 text-center">
          <UploadIcon className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">{currentFileName ?? placeholder}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          {accept && (
            <p className="text-xs text-muted-foreground">
              {accept.map((e) => e.toUpperCase()).join(', ')} files accepted
            </p>
          )}
        </div>
        <FileUploadTrigger className="text-xs text-primary underline underline-offset-2 cursor-pointer bg-transparent border-0 p-0 hover:text-primary/80 transition-colors">
          Browse files
        </FileUploadTrigger>
      </FileUploadDropzone>
      <FileUploadList>
        {/* FileUploadList renders its children for each file in the store.
            Since this component is a controlled bridge, we use onValueChange
            on the root and rely on the list to render state feedback only. */}
      </FileUploadList>
      <FileUploadClear className="hidden" />
    </FileUploadUI>
  )
}
