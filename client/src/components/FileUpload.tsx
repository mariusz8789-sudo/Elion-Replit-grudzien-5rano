import { useState } from "react";
import { Upload, File, X, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onUpload?: (files: File[]) => void;
  maxSize?: number;
}

export default function FileUpload({ onUpload, maxSize = 10 }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<Array<{ name: string; size: number; status: 'uploading' | 'done' }>>([]);
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  };
  
  const handleFiles = (fileList: File[]) => {
    const newFiles = fileList.map(f => ({
      name: f.name,
      size: f.size,
      status: 'uploading' as const
    }));
    
    setFiles(prev => [...prev, ...newFiles]);
    
    setTimeout(() => {
      setFiles(prev => prev.map(f => ({ ...f, status: 'done' as const })));
      onUpload?.(fileList);
    }, 1500);
  };
  
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files));
    }
  };
  
  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };
  
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };
  
  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center transition-colors",
          isDragging ? "border-accent bg-accent/5" : "border-border hover:border-accent/50"
        )}
        data-testid="dropzone-upload"
      >
        <Upload className={cn(
          "w-12 h-12 mx-auto mb-4",
          isDragging ? "text-accent" : "text-muted-foreground"
        )} />
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Drop files here or click to upload
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Maximum file size: {maxSize}MB. Files are encrypted before upload.
        </p>
        <input
          type="file"
          multiple
          onChange={handleFileInput}
          className="hidden"
          id="file-input"
          data-testid="input-file"
        />
        <Button
          variant="outline"
          onClick={() => document.getElementById('file-input')?.click()}
          data-testid="button-browse"
        >
          Browse Files
        </Button>
      </div>
      
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 rounded-lg border border-card-border bg-card hover-elevate"
              data-testid={`file-item-${index}`}
            >
              <File className="w-8 h-8 text-accent flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(file.size)}
                </p>
              </div>
              {file.status === 'done' ? (
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              ) : (
                <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
              )}
              <Button
                variant="ghost"
                size="icon"
                className="flex-shrink-0"
                onClick={() => removeFile(index)}
                data-testid={`button-remove-${index}`}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
