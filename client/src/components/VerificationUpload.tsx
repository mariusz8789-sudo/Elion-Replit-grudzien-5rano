import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ShieldCheck, Upload, Clock, Check, X, Sparkles, History } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { VerificationDocument, DocumentVersion } from "@shared/schema";

interface VerificationUploadProps {
  holderType: "user" | "driver" | "company";
  holderId: string;
  docTypes: Array<{ value: string; label: string }>;
  // When true, each row gets an optional expiry-date input (used for licenses/certifications
  // that the Skills Engine's expiry-reminder sweep depends on) - identity documents don't need it.
  collectExpiry?: boolean;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  expired: "destructive",
};

export default function VerificationUpload({ holderType, holderId, docTypes, collectExpiry }: VerificationUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingDocType, setPendingDocType] = useState<string | null>(null);
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>({});
  const [historyDocId, setHistoryDocId] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<{ docId: string; fields: Record<string, unknown> } | null>(null);

  const { data: documents = [] } = useQuery<VerificationDocument[]>({
    queryKey: [`/api/verification-documents/${holderType}/${holderId}`],
  });

  const { data: versions = [] } = useQuery<DocumentVersion[]>({
    queryKey: [`/api/verification-documents/${historyDocId}/versions`],
    enabled: !!historyDocId,
  });

  // New document (no existing row for this docType yet).
  const uploadMutation = useMutation({
    mutationFn: async ({ docType, fileUrl, expiresAt }: { docType: string; fileUrl: string; expiresAt?: string }) => {
      const res = await apiRequest("POST", "/api/verification-documents", {
        holderType,
        holderId,
        docType,
        fileUrl,
        ...(expiresAt ? { expiresAt } : {}),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/verification-documents/${holderType}/${holderId}`] });
      toast({ title: "Document submitted", description: "An admin will review it shortly." });
    },
    onError: (error: any) => toast({ title: "Upload failed", description: error.message, variant: "destructive" }),
  });

  // Renewal of an existing document - keeps the same row's identity, preserves the prior file
  // as a version, and resets it to pending review.
  const renewMutation = useMutation({
    mutationFn: async ({ docId, fileUrl }: { docId: string; fileUrl: string }) => {
      const res = await apiRequest("POST", `/api/verification-documents/${docId}/renew`, { fileUrl });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/verification-documents/${holderType}/${holderId}`] });
      toast({ title: "Document renewed", description: "Your update is now pending review." });
    },
    onError: (error: any) => toast({ title: "Renewal failed", description: error.message, variant: "destructive" }),
  });

  const ocrMutation = useMutation({
    mutationFn: async (docId: string) => {
      const res = await apiRequest("POST", `/api/verification-documents/${docId}/ocr`, {});
      return res.json() as Promise<{ document: VerificationDocument; extracted: Record<string, unknown> }>;
    },
    onSuccess: (data, docId) => {
      queryClient.invalidateQueries({ queryKey: [`/api/verification-documents/${holderType}/${holderId}`] });
      setOcrResult({ docId, fields: data.extracted });
    },
    onError: (error: any) => toast({ title: "OCR unavailable", description: error.message, variant: "destructive" }),
  });

  const triggerUpload = (docType: string) => {
    setPendingDocType(docType);
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingDocType) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const fileUrl = reader.result as string;
      const existing = statusFor(pendingDocType);
      if (existing) {
        renewMutation.mutate({ docId: existing.id, fileUrl });
      } else {
        uploadMutation.mutate({ docType: pendingDocType, fileUrl, expiresAt: expiryDates[pendingDocType] || undefined });
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const statusFor = (docType: string) => {
    const docsForType = documents.filter((d) => d.docType === docType);
    return docsForType[0];
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" /> Identity Verification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelect} className="hidden" />
        {docTypes.map(({ value, label }) => {
          const doc = statusFor(value);
          const isHistoryOpen = historyDocId === doc?.id;
          const isOcrOpen = ocrResult?.docId === doc?.id;
          return (
            <div key={value} className="p-3 border rounded-md space-y-2" data-testid={`row-doc-${value}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="font-medium">{label}</span>
                <div className="flex items-center gap-2">
                  {doc && (
                    <Badge variant={STATUS_VARIANT[doc.status] ?? "secondary"} className="gap-1">
                      {doc.status === "approved" && <Check className="w-3 h-3" />}
                      {doc.status === "rejected" && <X className="w-3 h-3" />}
                      {doc.status === "pending" && <Clock className="w-3 h-3" />}
                      {doc.status}
                      {doc.expiresAt && ` · expires ${new Date(doc.expiresAt).toLocaleDateString()}`}
                    </Badge>
                  )}
                  {doc?.docNumber && <Badge variant="outline">#{doc.docNumber}</Badge>}
                  {collectExpiry && !doc && (
                    <Input
                      type="date"
                      className="w-40 h-8"
                      value={expiryDates[value] || ""}
                      onChange={(e) => setExpiryDates((prev) => ({ ...prev, [value]: e.target.value }))}
                      data-testid={`input-expiry-${value}`}
                    />
                  )}
                  {doc && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => ocrMutation.mutate(doc.id)}
                      disabled={ocrMutation.isPending}
                      data-testid={`button-ocr-${value}`}
                      title="AI-extract document fields"
                    >
                      <Sparkles className="w-3 h-3" />
                    </Button>
                  )}
                  {doc && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setHistoryDocId(isHistoryOpen ? null : doc.id)}
                      data-testid={`button-history-${value}`}
                      title="Version history"
                    >
                      <History className="w-3 h-3" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => triggerUpload(value)}
                    disabled={uploadMutation.isPending || renewMutation.isPending}
                    data-testid={`button-upload-${value}`}
                  >
                    <Upload className="w-3 h-3 mr-1" /> {doc ? "Renew" : "Upload"}
                  </Button>
                </div>
              </div>
              {isOcrOpen && (
                <div className="text-xs bg-muted p-2 rounded space-y-1" data-testid={`ocr-result-${value}`}>
                  <p className="font-medium">AI-extracted (review before relying on it):</p>
                  {Object.entries(ocrResult!.fields).map(([k, v]) => (
                    <p key={k}>{k}: {v == null ? "-" : String(v)}</p>
                  ))}
                </div>
              )}
              {isHistoryOpen && (
                <div className="text-xs bg-muted p-2 rounded space-y-1" data-testid={`history-${value}`}>
                  {versions.length === 0 && <p className="text-muted-foreground">No prior versions.</p>}
                  {versions.map((v) => (
                    <p key={v.id}>{new Date(v.createdAt).toLocaleString()} · {v.note ?? "renewal"}</p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
