import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, Trash2, Link as LinkIcon, Copy } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ResourceAvailability, ResourceTimeOff } from "@shared/schema";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type EntityType = "worker" | "vehicle" | "warehouse" | "company";

const TIME_OFF_TYPES: Record<EntityType, Array<{ value: string; label: string }>> = {
  worker: [
    { value: "vacation", label: "Vacation" },
    { value: "sick_leave", label: "Sick leave" },
    { value: "other", label: "Other" },
  ],
  vehicle: [
    { value: "maintenance", label: "Maintenance" },
    { value: "reservation", label: "Reservation" },
    { value: "other", label: "Other" },
  ],
  warehouse: [
    { value: "reservation", label: "Reservation" },
    { value: "blackout", label: "Blackout" },
    { value: "other", label: "Other" },
  ],
  company: [
    { value: "blackout", label: "Company blackout" },
    { value: "other", label: "Other" },
  ],
};

interface EntityCalendarCardProps {
  entityType: EntityType;
  entityId: string;
  title?: string;
}

export default function EntityCalendarCard({ entityType, entityId, title }: EntityCalendarCardProps) {
  const { toast } = useToast();
  const defaultType = TIME_OFF_TYPES[entityType][0].value;
  const [timeOffForm, setTimeOffForm] = useState({ type: defaultType, startDate: "", endDate: "", note: "" });
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const { data: availability = [] } = useQuery<ResourceAvailability[]>({
    queryKey: [`/api/calendar/${entityType}/${entityId}/availability`],
  });
  const { data: timeOff = [] } = useQuery<ResourceTimeOff[]>({
    queryKey: [`/api/calendar/${entityType}/${entityId}/time-off`],
  });

  const [slots, setSlots] = useState<Record<number, { active: boolean; startTime: string; endTime: string }> | null>(null);
  const activeSlots = slots ?? Object.fromEntries(
    Array.from({ length: 7 }, (_, i) => {
      const existing = availability.find((a) => a.dayOfWeek === i);
      return [i, existing ? { active: existing.active ?? true, startTime: existing.startTime, endTime: existing.endTime } : { active: false, startTime: "09:00", endTime: "17:00" }];
    })
  );

  const saveAvailabilityMutation = useMutation({
    mutationFn: async () => {
      const payload = Object.entries(activeSlots)
        .filter(([, s]) => s.active)
        .map(([day, s]) => ({ dayOfWeek: Number(day), startTime: s.startTime, endTime: s.endTime, active: true }));
      await apiRequest("POST", `/api/calendar/${entityType}/${entityId}/availability`, { slots: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/calendar/${entityType}/${entityId}/availability`] });
      toast({ title: "Schedule saved" });
    },
    onError: (error: any) => toast({ title: "Failed to save", description: error.message, variant: "destructive" }),
  });

  const addTimeOffMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/calendar/${entityType}/${entityId}/time-off`, timeOffForm);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/calendar/${entityType}/${entityId}/time-off`] });
      setTimeOffForm({ type: defaultType, startDate: "", endDate: "", note: "" });
      toast({ title: "Added to calendar" });
    },
    onError: (error: any) => toast({ title: "Failed to add", description: error.message, variant: "destructive" }),
  });

  const deleteTimeOffMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/calendar/${entityType}/${entityId}/time-off/${id}`, {});
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/calendar/${entityType}/${entityId}/time-off`] }),
  });

  const shareMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/calendar/${entityType}/${entityId}/share-token`, {});
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => setShareUrl(`${window.location.origin}${data.url}`),
  });

  const copyShareUrl = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    toast({ title: "Link copied", description: "Subscribe to it from Google Calendar, Outlook, or Apple Calendar." });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CalendarIcon className="w-5 h-5" />{title ?? "Calendar"}</CardTitle>
        <CardDescription>Weekly availability, time off, and a subscribable calendar link.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          {DAYS.map((day, i) => (
            <div key={day} className="flex items-center gap-3" data-testid={`row-availability-${entityType}-${i}`}>
              <Switch
                checked={activeSlots[i]?.active ?? false}
                onCheckedChange={(checked) => setSlots({ ...activeSlots, [i]: { ...activeSlots[i], active: checked } })}
                data-testid={`switch-day-${entityType}-${i}`}
              />
              <span className="w-24 text-sm">{day}</span>
              <Input
                type="time"
                className="w-28 h-8"
                value={activeSlots[i]?.startTime ?? "09:00"}
                disabled={!activeSlots[i]?.active}
                onChange={(e) => setSlots({ ...activeSlots, [i]: { ...activeSlots[i], startTime: e.target.value } })}
              />
              <span className="text-muted-foreground text-xs">to</span>
              <Input
                type="time"
                className="w-28 h-8"
                value={activeSlots[i]?.endTime ?? "17:00"}
                disabled={!activeSlots[i]?.active}
                onChange={(e) => setSlots({ ...activeSlots, [i]: { ...activeSlots[i], endTime: e.target.value } })}
              />
            </div>
          ))}
          <Button size="sm" onClick={() => saveAvailabilityMutation.mutate()} disabled={saveAvailabilityMutation.isPending} data-testid={`button-save-availability-${entityType}`}>
            Save Schedule
          </Button>
        </div>

        <div className="space-y-3 pt-4 border-t">
          <div className="grid grid-cols-2 gap-2">
            <Select value={timeOffForm.type} onValueChange={(v) => setTimeOffForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger className="h-8" data-testid={`select-timeoff-type-${entityType}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_OFF_TYPES[entityType].map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input className="h-8" placeholder="Note (optional)" value={timeOffForm.note} onChange={(e) => setTimeOffForm((f) => ({ ...f, note: e.target.value }))} />
            <Input className="h-8" type="date" value={timeOffForm.startDate} onChange={(e) => setTimeOffForm((f) => ({ ...f, startDate: e.target.value }))} data-testid={`input-timeoff-start-${entityType}`} />
            <Input className="h-8" type="date" value={timeOffForm.endDate} onChange={(e) => setTimeOffForm((f) => ({ ...f, endDate: e.target.value }))} data-testid={`input-timeoff-end-${entityType}`} />
          </div>
          <Button
            size="sm"
            onClick={() => addTimeOffMutation.mutate()}
            disabled={!timeOffForm.startDate || !timeOffForm.endDate || addTimeOffMutation.isPending}
            data-testid={`button-add-timeoff-${entityType}`}
          >
            Add
          </Button>
          <div className="space-y-1">
            {timeOff.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-2 border rounded text-sm" data-testid={`row-timeoff-${t.id}`}>
                <span>
                  <Badge variant="outline" className="text-xs mr-2">{t.type}</Badge>
                  {new Date(t.startDate).toLocaleDateString()} - {new Date(t.endDate).toLocaleDateString()}
                  {t.note && <span className="text-muted-foreground ml-1">({t.note})</span>}
                </span>
                <Button size="icon" variant="ghost" onClick={() => deleteTimeOffMutation.mutate(t.id)} data-testid={`button-delete-timeoff-${t.id}`}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t space-y-2">
          <Button size="sm" variant="outline" onClick={() => shareMutation.mutate()} disabled={shareMutation.isPending} data-testid={`button-get-calendar-link-${entityType}`}>
            <LinkIcon className="w-3 h-3 mr-1" />Get Calendar Link
          </Button>
          {shareUrl && (
            <div className="flex items-center gap-2">
              <Input readOnly value={shareUrl} className="h-8 text-xs" data-testid={`input-share-url-${entityType}`} />
              <Button size="icon" variant="ghost" onClick={copyShareUrl} data-testid={`button-copy-share-url-${entityType}`}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
