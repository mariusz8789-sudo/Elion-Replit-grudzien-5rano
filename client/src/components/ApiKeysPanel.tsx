import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Key, Plus, Trash2, Copy } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ApiKey } from "@shared/schema";

const AVAILABLE_SCOPES = ["bookings:read", "bookings:write", "company:read", "webhooks:manage"];

export default function ApiKeysPanel({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["bookings:read"]);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);

  const { data: keys = [] } = useQuery<ApiKey[]>({
    queryKey: [`/api/companies/${companyId}/api-keys`],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/api-keys`, { name, scopes });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/api-keys`] });
      setNewRawKey(data.rawKey);
      setName("");
      toast({ title: "API key created", description: "Copy it now — it won't be shown again." });
    },
    onError: (error: any) => toast({ title: "Failed to create key", description: error.message, variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/companies/${companyId}/api-keys/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/api-keys`] }),
  });

  const toggleScope = (scope: string) => {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="w-5 h-5" /> Partner API Keys
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Use these keys to integrate your ERP/CRM with the Point to Point Partner API. See{" "}
          <a href="/partner/v1/docs" target="_blank" rel="noopener noreferrer" className="underline">
            API documentation
          </a>
          .
        </p>

        {newRawKey && (
          <div className="p-3 bg-muted rounded-md flex items-center justify-between gap-2">
            <code className="text-xs break-all">{newRawKey}</code>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                navigator.clipboard.writeText(newRawKey);
                toast({ title: "Copied to clipboard" });
              }}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <Label>New key name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SAP integration" data-testid="input-api-key-name" />
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_SCOPES.map((scope) => (
              <Badge
                key={scope}
                variant={scopes.includes(scope) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleScope(scope)}
                data-testid={`badge-scope-${scope}`}
              >
                {scope}
              </Badge>
            ))}
          </div>
          <Button onClick={() => createMutation.mutate()} disabled={!name || createMutation.isPending} data-testid="button-create-api-key">
            <Plus className="w-4 h-4 mr-1" /> Create Key
          </Button>
        </div>

        <div className="space-y-2">
          {keys.map((key) => (
            <div key={key.id} className="flex items-center justify-between p-3 border rounded-md" data-testid={`row-api-key-${key.id}`}>
              <div>
                <p className="font-medium">{key.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{key.keyPrefix}...</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => revokeMutation.mutate(key.id)} data-testid={`button-revoke-key-${key.id}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
