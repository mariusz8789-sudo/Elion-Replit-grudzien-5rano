import { useParams } from "wouter";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, Plane, Trash2, LinkIcon } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { DriverAvailability, DriverTimeOff, CalendarConnection } from "@shared/schema";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function DriverCalendar() {
  const { driverId } = useParams<{ driverId: string }>();
  const { toast } = useToast();

  const { data: availability = [] } = useQuery<DriverAvailability[]>({
    queryKey: [`/api/drivers/${driverId}/availability`],
    enabled: !!driverId,
  });
  const { data: timeOff = [] } = useQuery<DriverTimeOff[]>({
    queryKey: [`/api/drivers/${driverId}/time-off`],
    enabled: !!driverId,
  });
  const { data: connections = [] } = useQuery<CalendarConnection[]>({
    queryKey: [`/api/drivers/${driverId}/calendar/connections`],
    enabled: !!driverId,
  });

  const [slots, setSlots] = useState<Record<number, { active: boolean; startTime: string; endTime: string }>>(() => {
    const initial: Record<number, { active: boolean; startTime: string; endTime: string }> = {};
    for (let i = 0; i < 7; i++) {
      const existing = availability.find((a) => a.dayOfWeek === i);
      initial[i] = existing
        ? { active: existing.active ?? true, startTime: existing.startTime, endTime: existing.endTime }
        : { active: false, startTime: "09:00", endTime: "17:00" };
    }
    return initial;
  });

  const [timeOffForm, setTimeOffForm] = useState({ type: "vacation", startDate: "", endDate: "", note: "" });

  const saveAvailabilityMutation = useMutation({
    mutationFn: async () => {
      const payload = Object.entries(slots)
        .filter(([, s]) => s.active)
        .map(([day, s]) => ({ dayOfWeek: Number(day), startTime: s.startTime, endTime: s.endTime, active: true }));
      const res = await apiRequest("PUT", `/api/drivers/${driverId}/availability`, { slots: payload });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/drivers/${driverId}/availability`] });
      toast({ title: "Schedule saved" });
    },
    onError: (error: any) => toast({ title: "Failed to save", description: error.message, variant: "destructive" }),
  });

  const addTimeOffMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/drivers/${driverId}/time-off`, timeOffForm);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/drivers/${driverId}/time-off`] });
      setTimeOffForm({ type: "vacation", startDate: "", endDate: "", note: "" });
      toast({ title: "Time off added" });
    },
    onError: (error: any) => toast({ title: "Failed to add", description: error.message, variant: "destructive" }),
  });

  const deleteTimeOffMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/drivers/${driverId}/time-off/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/drivers/${driverId}/time-off`] }),
  });

  const connectCalendar = async (provider: "google" | "outlook") => {
    try {
      const res = await apiRequest("GET", `/api/drivers/${driverId}/calendar/${provider}/auth-url`);
      const data = await res.json();
      window.location.href = data.url;
    } catch (error: any) {
      toast({ title: "Connection unavailable", description: error.message, variant: "destructive" });
    }
  };

  const disconnectCalendar = async (provider: string) => {
    await apiRequest("DELETE", `/api/drivers/${driverId}/calendar/${provider}`);
    queryClient.invalidateQueries({ queryKey: [`/api/drivers/${driverId}/calendar/connections`] });
  };

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 space-y-8">
      <div>
        <h2 className="text-3xl font-extrabold flex items-center gap-2">
          <CalendarIcon className="w-7 h-7" /> Driver Availability
        </h2>
        <p className="text-muted-foreground mt-2">Set your recurring weekly hours, request time off, and sync with your calendar.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Weekly working hours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {DAYS.map((day, i) => (
            <div key={day} className="flex items-center gap-3" data-testid={`row-availability-${i}`}>
              <Switch
                checked={slots[i]?.active ?? false}
                onCheckedChange={(checked) => setSlots((prev) => ({ ...prev, [i]: { ...prev[i], active: checked } }))}
                data-testid={`switch-day-${i}`}
              />
              <span className="w-24 text-sm">{day}</span>
              <Input
                type="time"
                className="w-32"
                value={slots[i]?.startTime ?? "09:00"}
                disabled={!slots[i]?.active}
                onChange={(e) => setSlots((prev) => ({ ...prev, [i]: { ...prev[i], startTime: e.target.value } }))}
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="time"
                className="w-32"
                value={slots[i]?.endTime ?? "17:00"}
                disabled={!slots[i]?.active}
                onChange={(e) => setSlots((prev) => ({ ...prev, [i]: { ...prev[i], endTime: e.target.value } }))}
              />
            </div>
          ))}
          <Button onClick={() => saveAvailabilityMutation.mutate()} disabled={saveAvailabilityMutation.isPending} data-testid="button-save-availability">
            Save Schedule
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane className="w-5 h-5" /> Time off (vacation / sick leave)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select value={timeOffForm.type} onValueChange={(v) => setTimeOffForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger data-testid="select-timeoff-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vacation">Vacation</SelectItem>
                <SelectItem value="sick_leave">Sick leave</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Note (optional)" value={timeOffForm.note} onChange={(e) => setTimeOffForm((f) => ({ ...f, note: e.target.value }))} />
            <Input type="date" value={timeOffForm.startDate} onChange={(e) => setTimeOffForm((f) => ({ ...f, startDate: e.target.value }))} data-testid="input-timeoff-start" />
            <Input type="date" value={timeOffForm.endDate} onChange={(e) => setTimeOffForm((f) => ({ ...f, endDate: e.target.value }))} data-testid="input-timeoff-end" />
          </div>
          <Button
            onClick={() => addTimeOffMutation.mutate()}
            disabled={!timeOffForm.startDate || !timeOffForm.endDate || addTimeOffMutation.isPending}
            data-testid="button-add-timeoff"
          >
            Add Time Off
          </Button>

          <div className="space-y-2">
            {timeOff.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-3 border rounded-md" data-testid={`row-timeoff-${t.id}`}>
                <div>
                  <Badge variant="outline">{t.type}</Badge>
                  <span className="ml-2 text-sm text-muted-foreground">
                    {new Date(t.startDate).toLocaleDateString()} - {new Date(t.endDate).toLocaleDateString()}
                  </span>
                </div>
                <Button size="icon" variant="ghost" onClick={() => deleteTimeOffMutation.mutate(t.id)} data-testid={`button-delete-timeoff-${t.id}`}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="w-5 h-5" /> Calendar sync
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(["google", "outlook"] as const).map((provider) => {
            const connection = connections.find((c) => c.provider === provider);
            return (
              <div key={provider} className="flex items-center justify-between p-3 border rounded-md">
                <span className="capitalize font-medium">{provider} Calendar</span>
                {connection ? (
                  <Button variant="outline" size="sm" onClick={() => disconnectCalendar(provider)} data-testid={`button-disconnect-${provider}`}>
                    Disconnect
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => connectCalendar(provider)} data-testid={`button-connect-${provider}`}>
                    Connect
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
