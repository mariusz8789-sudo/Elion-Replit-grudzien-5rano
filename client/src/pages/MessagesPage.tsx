import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Inbox, Send, Archive, ArchiveRestore, Search, Tag, FileText, LifeBuoy, Loader2, Plus, X } from "lucide-react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import type { Conversation, Message, MessageTemplate } from "@shared/schema";

const TYPE_LABEL: Record<string, string> = { direct: "Direct", support: "Support", company: "Company" };

export default function MessagesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<Message & { conversationSubject: string | null }> | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateBody, setNewTemplateBody] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);

  const { data: conversations = [], isLoading } = useQuery<Array<Conversation & { unreadCount: number }>>({
    queryKey: ["/api/conversations", showArchived],
    queryFn: async () => {
      const res = await fetch(`/api/conversations?includeArchived=${showArchived}`);
      return res.ok ? res.json() : [];
    },
    refetchInterval: 15_000,
  });

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: [`/api/conversations/${selectedId}/messages`],
    enabled: !!selectedId,
    refetchInterval: selectedId ? 8_000 : false,
  });

  const { data: templates = [] } = useQuery<MessageTemplate[]>({
    queryKey: ["/api/message-templates"],
  });

  const selected = conversations.find((c) => c.id === selectedId);

  const openConversation = (id: string) => {
    setSelectedId(id);
    apiRequest("POST", `/api/conversations/${id}/read`, {}).then(() =>
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", showArchived] })
    );
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/conversations/${selectedId}/messages`, { content: draft });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/conversations/${selectedId}/messages`] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", showArchived] });
      setDraft("");
    },
    onError: (error: any) => toast({ title: "Failed to send", description: error.message, variant: "destructive" }),
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      await apiRequest("POST", `/api/conversations/${id}/archive`, { archived });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", showArchived] });
      if (!showArchived) setSelectedId(null);
    },
  });

  const labelMutation = useMutation({
    mutationFn: async () => {
      if (!selected || !labelInput.trim()) return;
      const nextLabels = Array.from(new Set([...(selected.labels ?? []), labelInput.trim()]));
      await apiRequest("PATCH", `/api/conversations/${selected.id}/labels`, { labels: nextLabels });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", showArchived] });
      setLabelInput("");
    },
  });

  const supportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/conversations/support", { subject: "Support request" });
      return res.json() as Promise<Conversation>;
    },
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", showArchived] });
      setSelectedId(conversation.id);
      toast({ title: "Support conversation started" });
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/message-templates", { name: newTemplateName, body: newTemplateBody });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/message-templates"] });
      setNewTemplateName("");
      setNewTemplateBody("");
    },
    onError: (error: any) => toast({ title: "Failed to save template", description: error.message, variant: "destructive" }),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/message-templates/${id}`, {});
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/message-templates"] }),
  });

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const res = await fetch(`/api/messages/search?q=${encodeURIComponent(searchQuery)}`);
    setSearchResults(res.ok ? await res.json() : []);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-3xl font-bold font-[Outfit] flex items-center gap-2">
            <Inbox className="w-7 h-7" />Messages
          </h1>
          <Button onClick={() => supportMutation.mutate()} disabled={supportMutation.isPending} data-testid="button-contact-support">
            <LifeBuoy className="w-4 h-4 mr-2" />Contact Support
          </Button>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search messages..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              data-testid="input-search-messages"
            />
          </div>
          <Button variant="outline" onClick={handleSearch} data-testid="button-search-messages">Search</Button>
          <Button variant={showArchived ? "default" : "outline"} onClick={() => setShowArchived((v) => !v)} data-testid="button-toggle-archived">
            {showArchived ? "Showing Archived" : "Show Archived"}
          </Button>
        </div>

        {searchResults && (
          <Card>
            <CardHeader><CardTitle className="text-base">Search Results</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {searchResults.length === 0 && <p className="text-sm text-muted-foreground">No matches.</p>}
              {searchResults.map((m) => (
                <div key={m.id} className="text-sm p-2 border rounded" data-testid={`search-result-${m.id}`}>
                  <p className="text-xs text-muted-foreground">{m.conversationSubject ?? "Conversation"} · {format(new Date(m.createdAt), "PPp")}</p>
                  <p>{m.content}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="md:col-span-1">
            <CardHeader><CardTitle className="text-base">Conversations</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
              {isLoading && <div className="h-20 bg-muted animate-pulse rounded-lg" />}
              {!isLoading && conversations.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-conversations">No conversations yet.</p>
              )}
              {conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openConversation(c.id)}
                  className={`w-full text-left p-3 rounded-lg border hover-elevate ${selectedId === c.id ? "border-primary" : ""}`}
                  data-testid={`conversation-${c.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{c.subject || "(no subject)"}</span>
                    {c.unreadCount > 0 && <Badge className="shrink-0">{c.unreadCount}</Badge>}
                  </div>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-xs">{TYPE_LABEL[c.type] ?? c.type}</Badge>
                    {c.labels?.map((l) => <Badge key={l} variant="secondary" className="text-xs">{l}</Badge>)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{format(new Date(c.lastMessageAt), "PPp")}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="md:col-span-2 flex flex-col">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{selected?.subject || "Select a conversation"}</CardTitle>
              {selected && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => archiveMutation.mutate({ id: selected.id, archived: !showArchived })}
                  data-testid="button-archive-conversation"
                >
                  {showArchived ? <ArchiveRestore className="w-4 h-4 mr-1" /> : <Archive className="w-4 h-4 mr-1" />}
                  {showArchived ? "Unarchive" : "Archive"}
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex-1 flex flex-col space-y-3">
              {!selected && <p className="text-sm text-muted-foreground py-12 text-center">Pick a conversation on the left.</p>}
              {selected && (
                <>
                  <div className="flex-1 space-y-2 max-h-80 overflow-y-auto border rounded-lg p-3">
                    {messages.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={`p-2 rounded max-w-[80%] text-sm ${m.senderId === user?.id ? "bg-primary/10 ml-auto" : "bg-muted"}`}
                        data-testid={`message-${m.id}`}
                      >
                        <p>{m.content}</p>
                        <p className="text-xs text-muted-foreground mt-1">{format(new Date(m.createdAt), "p")}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Add label..."
                      value={labelInput}
                      onChange={(e) => setLabelInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && labelMutation.mutate()}
                      className="h-8 w-40"
                      data-testid="input-add-label"
                    />
                    {templates.length > 0 && (
                      <Select onValueChange={(v) => setDraft(templates.find((t) => t.id === v)?.body ?? "")}>
                        <SelectTrigger className="h-8 w-40" data-testid="select-message-template">
                          <SelectValue placeholder="Use template" />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{t.name}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendMutation.mutate()}
                      placeholder="Type a reply..."
                      data-testid="input-reply"
                    />
                    <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending || !draft.trim()} data-testid="button-send-reply">
                      {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4" />Templates</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setShowTemplates((v) => !v)} data-testid="button-toggle-templates">
              {showTemplates ? "Hide" : "Manage"}
            </Button>
          </CardHeader>
          {showTemplates && (
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <Badge key={t.id} variant="secondary" className="flex items-center gap-1 pr-1">
                    {t.name}
                    <button type="button" onClick={() => deleteTemplateMutation.mutate(t.id)} data-testid={`button-delete-template-${t.id}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
                {templates.length === 0 && <p className="text-sm text-muted-foreground">No templates yet.</p>}
              </div>
              <div className="grid md:grid-cols-3 gap-2 items-end">
                <Input placeholder="Template name" value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} data-testid="input-template-name" />
                <Input placeholder="Template body" className="md:col-span-1" value={newTemplateBody} onChange={(e) => setNewTemplateBody(e.target.value)} data-testid="input-template-body" />
                <Button onClick={() => createTemplateMutation.mutate()} disabled={!newTemplateName.trim() || !newTemplateBody.trim()} data-testid="button-create-template">
                  <Plus className="w-4 h-4 mr-1" />Add
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
