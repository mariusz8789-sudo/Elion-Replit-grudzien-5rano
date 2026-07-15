import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wrench, Star, MapPin, Languages, X, Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import VerificationUpload from "@/components/VerificationUpload";
import type { Skill, WorkerProfile, WorkerSkill } from "@shared/schema";

const CERTIFICATION_DOC_TYPES = [
  { value: "SEP", label: "SEP (Electrical)" },
  { value: "Gas", label: "Gas Installation License" },
  { value: "Hydraulic", label: "Hydraulic / Plumbing License" },
  { value: "UDT", label: "UDT (Crane/Hoisting Inspection)" },
  { value: "Forklift", label: "Forklift Operator License" },
  { value: "Crane", label: "Crane Operator License" },
  { value: "HDS", label: "HDS Crane Operator License" },
  { value: "Construction", label: "Construction License" },
  { value: "ADR", label: "ADR (Dangerous Goods Transport)" },
];

const EXPERIENCE_LEVELS = ["beginner", "intermediate", "experienced", "expert"];

export default function SkillsProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [bio, setBio] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [serviceRadius, setServiceRadius] = useState("");
  const [languages, setLanguages] = useState("");
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("intermediate");
  const [yearsExperience, setYearsExperience] = useState("");

  const { data: profile, isLoading: profileLoading } = useQuery<WorkerProfile>({
    queryKey: ["/api/worker-profiles/me"],
    retry: false,
  });

  const { data: allSkills = [] } = useQuery<Skill[]>({ queryKey: ["/api/skills"] });

  const { data: profileSkills = [] } = useQuery<Array<WorkerSkill & { skill: Skill }>>({
    queryKey: [`/api/worker-profiles/${profile?.id}/skills`],
    enabled: !!profile?.id,
  });

  const createProfileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/worker-profiles", {
        bio: bio || undefined,
        hourlyRateEur: hourlyRate || undefined,
        serviceRadiusKm: serviceRadius ? Number(serviceRadius) : undefined,
        languages: languages ? languages.split(",").map((l) => l.trim()).filter(Boolean) : [],
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/worker-profiles/me"] });
      toast({ title: "Skills profile created" });
    },
    onError: (error: any) => toast({ title: "Could not create profile", description: error.message, variant: "destructive" }),
  });

  const toggleAvailableMutation = useMutation({
    mutationFn: async (available: boolean) => {
      const res = await apiRequest("PATCH", `/api/worker-profiles/${profile!.id}`, { available });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/worker-profiles/me"] }),
  });

  const addSkillMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/worker-profiles/${profile!.id}/skills`, {
        skillId: selectedSkillId,
        experienceLevel,
        yearsExperience: yearsExperience ? Number(yearsExperience) : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/worker-profiles/${profile?.id}/skills`] });
      setSelectedSkillId("");
      setYearsExperience("");
      toast({ title: "Skill added" });
    },
    onError: (error: any) => toast({ title: "Could not add skill", description: error.message, variant: "destructive" }),
  });

  const removeSkillMutation = useMutation({
    mutationFn: async (skillId: string) => {
      await apiRequest("DELETE", `/api/worker-profiles/${profile!.id}/skills/${skillId}`, {});
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/worker-profiles/${profile?.id}/skills`] }),
  });

  if (profileLoading) {
    return <div className="container mx-auto p-6"><div className="h-64 bg-muted animate-pulse rounded-lg" /></div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 rounded-lg">
          <Wrench className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Skills Profile</h1>
          <p className="text-muted-foreground">Your skills, certifications, and availability for jobs and crew matching</p>
        </div>
      </div>

      {!profile ? (
        <Card>
          <CardHeader>
            <CardTitle>Create Your Skills Profile</CardTitle>
            <CardDescription>Required before you can be matched to skilled-labor jobs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="bio">Bio</Label>
              <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell companies about your experience" data-testid="input-bio" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="rate">Hourly Rate (EUR)</Label>
                <Input id="rate" type="number" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} data-testid="input-hourly-rate" />
              </div>
              <div>
                <Label htmlFor="radius">Service Radius (km)</Label>
                <Input id="radius" type="number" value={serviceRadius} onChange={(e) => setServiceRadius(e.target.value)} data-testid="input-service-radius" />
              </div>
            </div>
            <div>
              <Label htmlFor="languages">Languages (comma-separated)</Label>
              <Input id="languages" value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="en, pl, de" data-testid="input-languages" />
            </div>
            <Button onClick={() => createProfileMutation.mutate()} disabled={createProfileMutation.isPending} data-testid="button-create-profile">
              Create Profile
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Profile Overview</span>
                <div className="flex items-center gap-2 text-sm font-normal">
                  <Label htmlFor="available-switch">Available for work</Label>
                  <Switch
                    id="available-switch"
                    checked={profile.available ?? false}
                    onCheckedChange={(checked) => toggleAvailableMutation.mutate(checked)}
                    data-testid="switch-available"
                  />
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.bio && <p className="text-sm text-muted-foreground">{profile.bio}</p>}
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="flex items-center gap-1"><Star className="w-4 h-4 text-yellow-500" />{Number(profile.rating).toFixed(1)} rating · {profile.completedJobs} jobs completed</span>
                {profile.hourlyRateEur && <span>€{profile.hourlyRateEur}/hr</span>}
                {profile.serviceRadiusKm && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{profile.serviceRadiusKm} km radius</span>}
                {(profile.languages?.length ?? 0) > 0 && (
                  <span className="flex items-center gap-1"><Languages className="w-4 h-4" />{profile.languages!.join(", ")}</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>My Skills</CardTitle>
              <CardDescription>Skills requiring a license are only matched once you hold a verified, unexpired certification below</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {profileSkills.map((ps) => (
                <div key={ps.id} className="flex items-center justify-between p-3 bg-muted rounded-lg" data-testid={`skill-${ps.skillId}`}>
                  <div>
                    <span className="font-medium">{ps.skill.name}</span>
                    {ps.skill.requiresCertification && <Badge variant="outline" className="ml-2">requires {ps.skill.requiresCertification}</Badge>}
                    <p className="text-xs text-muted-foreground">{ps.experienceLevel}{ps.yearsExperience ? ` · ${ps.yearsExperience} yrs` : ""}</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeSkillMutation.mutate(ps.skillId)} data-testid={`button-remove-skill-${ps.skillId}`}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}

              <div className="grid md:grid-cols-4 gap-2 pt-2 border-t">
                <Select value={selectedSkillId} onValueChange={setSelectedSkillId}>
                  <SelectTrigger data-testid="select-add-skill"><SelectValue placeholder="Add a skill" /></SelectTrigger>
                  <SelectContent>
                    {allSkills.filter((s) => !profileSkills.some((ps) => ps.skillId === s.id)).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={experienceLevel} onValueChange={setExperienceLevel}>
                  <SelectTrigger data-testid="select-experience-level"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPERIENCE_LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="number" placeholder="Years" value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} data-testid="input-years-experience" />
                <Button onClick={() => addSkillMutation.mutate()} disabled={!selectedSkillId || addSkillMutation.isPending} data-testid="button-add-skill">
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
            </CardContent>
          </Card>

          {user && (
            <VerificationUpload holderType="user" holderId={user.id} docTypes={CERTIFICATION_DOC_TYPES} collectExpiry />
          )}
        </>
      )}
    </div>
  );
}
