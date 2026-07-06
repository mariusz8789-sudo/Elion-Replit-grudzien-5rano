import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Upload, Clock, Check, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { VerificationDocument } from "@shared/schema";

interface VerificationUploadProps {
  holderType: "user" | "driver" | "company";
  holderId: string;
  docTypes: Array<{ value: string; label: string }>;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  expired: "destructive",
};

export default function VerificationUpload({ holderType, holderId, docTypes }: VerificationUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingDocType, setPendingDocType] = useState<string | null>(null);

  const { data: documents = [] } = useQuery<VerificationDocument[]>({
    queryKey: [`/api/verification-documents/${holderType}/${holderId}`],
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ docType, fileUrl }: { docType: string; fileUrl: string }) => {
      const res = await apiRequest("POST", "/api/verification-documents", {
        holderType,
        holderId,
        docType,
        fileUrl,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/verification-documents/${holderType}/${holderId}`] });
      toast({ title: "Document submitted", description: "An admin will review it shortly." });
    },
    onError: (error: any) => toast({ title: "Upload failed", description: error.message, variant: "destructive" }),
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
      uploadMutation.mutate({ docType: pendingDocType, fileUrl: reader.result as string });
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
          return (
            <div key={value} className="flex items-center justify-between p-3 border rounded-md" data-testid={`row-doc-${value}`}>
              <span className="font-medium">{label}</span>
              <div className="flex items-center gap-2">
                {doc && (
                  <Badge variant={STATUS_VARIANT[doc.status] ?? "secondary"} className="gap-1">
                    {doc.status === "approved" && <Check className="w-3 h-3" />}
                    {doc.status === "rejected" && <X className="w-3 h-3" />}
                    {doc.status === "pending" && <Clock className="w-3 h-3" />}
                    {doc.status}
                  </Badge>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => triggerUpload(value)}
                  disabled={uploadMutation.isPending}
                  data-testid={`button-upload-${value}`}
                >
                  <Upload className="w-3 h-3 mr-1" /> {doc ? "Re-upload" : "Upload"}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
