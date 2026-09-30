import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, UserX, ImageIcon, Eye, EyeOff, KeyRound, Loader2, Trash2 } from "lucide-react";
import { ModuleActionCaps, PermLevel } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import {
  emptyUserForm,
  tableColumns,
  userToFormValues,
  visibleFormFields,
  type UserFormMode,
  type UserFormValues,
  type UserSchemaField,
  type UserFieldKey,
} from "@/lib/userSchemaFields";
import {
  createStaffUser,
  TEACHER_DEFAULT_MODULE_PERMISSIONS,
  ACCOUNTANT_DEFAULT_MODULE_PERMISSIONS,
  PARENT_DEFAULT_MODULE_PERMISSIONS,
  fetchAllUsers,
  fetchAllRoles,
  fetchParentStudents,
  fetchModuleRegistry,
  fetchStaffUsers,
  staffRolesOnly,
  userCreateRoles,
  roleDisplayLabel,
  assignParentStudents,
  updateStaffUser,
  deleteStaffUser,
  uploadStaffProfilePhoto,
  normalizeModulePermissions,
  type RoleOption,
  type LinkedStudentSummary,
  type StaffUser,
} from "@/lib/staffApi";
import { useStaffRealtime } from "@/hooks/useStaffSocket";
import ModuleAccessMatrix from "@/components/modules/ModuleAccessMatrix";
import ParentUserCreateFields, {
  emptyParentCreateSelection,
  type ParentCreateSelection,
} from "@/components/modules/ParentUserCreateFields";
import PanelToolbar from "@/components/modules/PanelToolbar";
import { usePanelListSearch } from "@/hooks/usePanelListSearch";
import {
  fetchAcademyStudents,
  provisionParentPortals,
  type AcademyStudent,
  type ParentPortalProvisionResult,
} from "@/lib/studentManagementApi";
import { resolveUploadUrl } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";

function setFormField(setter: React.Dispatch<React.SetStateAction<UserFormValues>>, key: UserFieldKey, value: string) {
  setter((prev) => ({ ...prev, [key]: value }));
}

function SchemaFieldControl({
  field,
  mode,
  value,
  onChange,
  roleOptions,
}: {
  field: UserSchemaField;
  mode: UserFormMode;
  value: string;
  onChange: (v: string) => void;
  roleOptions: RoleOption[];
}) {
  const selectOptions =
    field.optionsFrom === "roles"
      ? roleOptions.map((r) => ({ value: r._id, label: r.name }))
      : field.options ?? [];

  const placeholder =
    field.key === "password" && mode === "edit" && field.optionalOnEdit
      ? "Leave blank to keep current password"
      : field.placeholder;

  if (field.inputType === "select") {
    return (
      <select
        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={field.required && !(mode === "edit" && field.key === "password")}
      >
        {field.optionsFrom === "roles" && <option value="">Select role…</option>}
        {selectOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {field.optionsFrom === "roles" ? roleDisplayLabel(o.label) : o.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.inputType === "number") {
    return (
      <Input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  }

  const inputType =
    field.inputType === "email" ? "email" : field.inputType === "tel" ? "tel" : "text";

  return (
    field.inputType === "password" ? (
      <div className="space-y-1">
        <Input
          type="text"
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="font-mono"
          required={
            field.required && !(mode === "edit" && field.key === "password" && field.optionalOnEdit)
          }
        />
        {mode === "create" ? (
          <p className="text-xs text-muted-foreground">Password is shown in plain text so you can copy it.</p>
        ) : null}
      </div>
    ) : (
      <Input
        type={inputType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={
          field.required && !(mode === "edit" && field.key === "password" && field.optionalOnEdit)
        }
      />
    )
  );
}

function formatTableCell(user: StaffUser, key: UserFieldKey): React.ReactNode {
  if (key === "role") {
    const r = user.role;
    if (r && typeof r === "object" && "name" in r) return <span className="capitalize">{(r as RoleOption).name}</span>;
    return "—";
  }
  if (key === "isActive") {
    return (
      <span
        className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
          user.isActive ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"
        }`}
      >
        {user.isActive ? "Active" : "Inactive"}
      </span>
    );
  }
  if (key === "salary") {
    const n = Number(user.salary ?? 0);
    return `₨ ${n.toLocaleString()}`;
  }
  const v = user[key as keyof StaffUser];
  if (v === undefined || v === null) return "—";
  return String(v);
}

function isParentUser(user: StaffUser): boolean {
  const r = user.role;
  const name =
    r && typeof r === "object" && "name" in r
      ? String((r as RoleOption).name)
      : typeof r === "string"
        ? r
        : "";
  return name.toLowerCase() === "parent";
}

function LinkedStudentsCell({ user }: { user: StaffUser }) {
  if (!isParentUser(user)) return <span className="text-muted-foreground">—</span>;
  const students = user.linkedStudents ?? [];
  if (students.length === 0) {
    return <span className="text-xs text-muted-foreground">No children linked</span>;
  }
  return (
    <div className="flex flex-col gap-1.5 max-w-xs">
      {students.map((s: LinkedStudentSummary) => {
        const classSection = [s.className, s.sectionName].filter(Boolean).join(" · ");
        return (
          <div key={s._id} className="text-xs leading-snug">
            <span className="font-medium text-foreground">{s.studentName}</span>
            {s.studentId ? (
              <span className="text-muted-foreground"> ({s.studentId})</span>
            ) : null}
            {classSection ? (
              <div className="text-muted-foreground">{classSection}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const STAFF_QUERY = ["users-module-list"] as const;
const ROLES_QUERY = ["staffRoles"] as const;
const REGISTRY_QUERY = ["moduleRegistry"] as const;

const UsersModule = ({
  perm: _perm,
  caps,
  scope = "all",
}: {
  perm: PermLevel;
  caps: ModuleActionCaps;
  scope?: "all" | "staff";
}) => {
  const anyWrite = caps.canCreate || caps.canEdit || caps.canDelete;
  const { toast } = useToast();
  const qc = useQueryClient();
  useStaffRealtime(anyWrite);

  const { data: staff = [], isLoading: staffLoading } = useQuery<StaffUser[]>({
    queryKey: [...STAFF_QUERY, scope],
    queryFn: async () =>
      scope === "staff"
        ? await fetchStaffUsers()
        : (await fetchAllUsers()) as StaffUser[],
  });

  const { data: rolesRaw = [] } = useQuery({
    queryKey: ROLES_QUERY,
    queryFn: fetchAllRoles,
  });

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<UserFormMode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormValues>(() => emptyUserForm());
  const [modulePerms, setModulePerms] = useState<Record<string, string[]>>({});
  const [parentStudentIds, setParentStudentIds] = useState<string[]>([]);
  const [parentCreate, setParentCreate] = useState<ParentCreateSelection>(() => emptyParentCreateSelection());
  const [editingWasParent, setEditingWasParent] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [provisionResult, setProvisionResult] = useState<ParentPortalProvisionResult | null>(null);
  const [showProvisionPasswords, setShowProvisionPasswords] = useState(true);
  const [createdParentCredentials, setCreatedParentCredentials] = useState<{
    name: string;
    email: string;
    password: string;
  } | null>(null);

  const roleOptions = useMemo(() => {
    if (scope === "staff") {
      return staffRolesOnly(rolesRaw).filter((r) => String(r.name).toLowerCase() !== "parent");
    }
    return userCreateRoles(rolesRaw);
  }, [rolesRaw, scope]);
  const selectedRole = roleOptions.find((r) => r._id === form.role);
  const isParentRole = (selectedRole?.name || "").toLowerCase() === "parent";
  const isTeacherRole = (selectedRole?.name || "").toLowerCase() === "teacher";
  const isAccountantRole = (selectedRole?.name || "").toLowerCase() === "accountant";
  const isParentCreate = open && mode === "create" && isParentRole;

  // Seed default RBAC matrix when creating teacher / accountant / parent (admin can still override).
  useEffect(() => {
    if (!open || mode !== "create") return;
    if (isParentRole) {
      setParentCreate((prev) => ({
        ...prev,
        password: prev.password || "Concept@1234",
        modulePermissions:
          Object.keys(prev.modulePermissions || {}).length > 0
            ? prev.modulePermissions
            : { ...PARENT_DEFAULT_MODULE_PERMISSIONS },
      }));
      return;
    }
    if (isTeacherRole) {
      setModulePerms({ ...TEACHER_DEFAULT_MODULE_PERMISSIONS });
    } else if (isAccountantRole) {
      setModulePerms({ ...ACCOUNTANT_DEFAULT_MODULE_PERMISSIONS });
    }
  }, [open, mode, isTeacherRole, isAccountantRole, isParentRole, form.role]);

  const provisionMutation = useMutation({
    mutationFn: async () => {
      if (!caps.canCreate) throw new Error("You do not have permission to create parent portals.");
      return provisionParentPortals();
    },
    onSuccess: (data) => {
      setProvisionResult(data);
      setProvisionOpen(true);
      setShowProvisionPasswords(true);
      void qc.invalidateQueries({ queryKey: STAFF_QUERY });
      toast({
        title: "Parent portals ready",
        description: `${data.createdCount} created, ${data.updatedCount} updated (${data.total} students).`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Provision failed", description: e.message, variant: "destructive" });
    },
  });

  const { data: parentStudentChoices = [], isLoading: parentStudentChoicesLoading } = useQuery({
    queryKey: ["academy-student-choices", isParentRole, mode],
    queryFn: async () => {
      const r = await fetchAcademyStudents({ page: 1, limit: 200, status: "active" });
      return r.students;
    },
    enabled: open && isParentRole && mode === "edit",
    retry: false,
  });

  const { data: currentParentStudents = [] } = useQuery({
    queryKey: ["parent-students", editingId],
    queryFn: async () => {
      if (!editingId) return [];
      return await fetchParentStudents(editingId);
    },
    enabled: open && mode === "edit" && Boolean(editingId) && isParentRole,
    retry: false,
  });

  useEffect(() => {
    if (!(open && mode === "edit" && isParentRole)) return;
    setParentStudentIds(currentParentStudents.map((r: any) => r._id));
  }, [open, mode, isParentRole, currentParentStudents]);

  const { data: modules = [] } = useQuery({
    queryKey: REGISTRY_QUERY,
    queryFn: fetchModuleRegistry,
  });

  const { search, setSearch, filtered: staffFiltered } = usePanelListSearch(staff, (u) => [
    u.name,
    u.email,
    u.phone,
    typeof u.role === "object" && u.role ? (u.role as RoleOption).name : typeof u.role === "string" ? u.role : "",
    u.isActive ? "active" : "inactive",
    ...(u.linkedStudents ?? []).flatMap((s) => [
      s.studentName,
      s.studentId,
      s.className ?? "",
      s.sectionName ?? "",
    ]),
  ]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (mode === "create" && !caps.canCreate) throw new Error("You do not have permission to create staff.");
      if (mode === "edit" && !caps.canEdit) throw new Error("You do not have permission to edit staff.");

      if (mode === "create" && isParentRole) {
        if (!form.role) throw new Error("Select a role.");
        if (!parentCreate.studentId) throw new Error("Select a student for this parent.");
        if (!parentCreate.name.trim()) throw new Error("Selected student has no name.");
        if (!parentCreate.email.trim()) {
          throw new Error("Could not build a portal email. Ensure the student has an official Student ID.");
        }
        if (!parentCreate.password || parentCreate.password.length < 8) {
          throw new Error("Password must be at least 8 characters.");
        }
        const mods =
          Object.keys(parentCreate.modulePermissions || {}).length > 0
            ? parentCreate.modulePermissions
            : { ...PARENT_DEFAULT_MODULE_PERMISSIONS };
        const u = await createStaffUser({
          name: parentCreate.name.trim(),
          email: parentCreate.email.trim().toLowerCase(),
          password: parentCreate.password,
          phone: parentCreate.phone.trim() || "N/A",
          role: form.role,
          isActive: true,
          salary: 0,
          modulePermissions: mods,
        });
        await assignParentStudents(u._id, [parentCreate.studentId]);
        return {
          user: u,
          parentCredentials: {
            name: parentCreate.name.trim(),
            email: parentCreate.email.trim().toLowerCase(),
            password: parentCreate.password,
          },
        };
      }

      const fields = visibleFormFields(mode);
      for (const f of fields) {
        const v = (form[f.key] || "").trim();
        if (f.key === "password" && mode === "edit" && f.optionalOnEdit) continue;
        if (f.required && !v && f.key !== "salary") throw new Error(`${f.label} is required.`);
        if (f.key === "password" && mode === "create" && (!v || v.length < 8)) {
          throw new Error("Password must be at least 8 characters.");
        }
        if (f.key === "password" && mode === "edit" && v && v.length < 8) {
          throw new Error("Password must be at least 8 characters.");
        }
        if (f.key === "role" && !form.role) throw new Error("Select a role.");
      }

      const salaryNum = Math.max(0, Number(form.salary) || 0);
      const permsPayload = { ...modulePerms };
      if (isParentRole && parentStudentIds.length === 0) {
        throw new Error("Select at least one student for this parent.");
      }

      if (mode === "create") {
        if (!form.password || form.password.length < 8) throw new Error("Password must be at least 8 characters.");
        const u = await createStaffUser({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          phone: form.phone.trim(),
          role: form.role,
          isActive: form.isActive === "true",
          salary: salaryNum,
          modulePermissions: permsPayload,
        });
        if (photoFile) await uploadStaffProfilePhoto(u._id, photoFile);
        return { user: u, parentCredentials: null };
      }
      if (!editingId) throw new Error("Missing user");
      const payload: Parameters<typeof updateStaffUser>[1] = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        role: form.role,
        isActive: form.isActive === "true",
        salary: salaryNum,
        modulePermissions: permsPayload,
      };
      if (form.password.trim()) payload.password = form.password;
      const u = await updateStaffUser(editingId, payload);
      if (photoFile) await uploadStaffProfilePhoto(editingId, photoFile);
      if (isParentRole) await assignParentStudents(editingId, parentStudentIds);
      if (!isParentRole && editingWasParent) await assignParentStudents(editingId, []);
      return { user: u, parentCredentials: null };
    },
    onSuccess: (result) => {
      toast({
        title: mode === "create"
          ? isParentRole ? "Parent user created" : "User created"
          : "User updated",
      });
      void qc.invalidateQueries({ queryKey: STAFF_QUERY });
      setOpen(false);
      clearFormState();
      if (result.parentCredentials) {
        setCreatedParentCredentials(result.parentCredentials);
      }
    },
    onError: (e: Error) => {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => {
      if (!caps.canEdit) throw new Error("Not allowed.");
      return updateStaffUser(id, { isActive: false });
    },
    onSuccess: () => {
      toast({ title: "Staff member deactivated" });
      void qc.invalidateQueries({ queryKey: STAFF_QUERY });
    },
    onError: (e: Error) => {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      if (!caps.canDelete) throw new Error("Not allowed.");
      return deleteStaffUser(id);
    },
    onSuccess: () => {
      toast({ title: "User deleted" });
      void qc.invalidateQueries({ queryKey: STAFF_QUERY });
    },
    onError: (e: Error) => {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    },
  });

  const clearFormState = () => {
    setForm(emptyUserForm());
    setEditingId(null);
    setModulePerms({});
    setParentStudentIds([]);
    setParentCreate(emptyParentCreateSelection());
    setEditingWasParent(false);
    setPhotoFile(null);
    setPhotoPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const openCreate = () => {
    if (!caps.canCreate) return;
    setMode("create");
    clearFormState();
    setOpen(true);
  };

  const openEdit = (u: StaffUser) => {
    if (!caps.canEdit) return;
    setMode("edit");
    setEditingId(u._id);
    setForm(userToFormValues(u));
    setModulePerms(normalizeModulePermissions(u.modulePermissions));
    const uRoleName =
      typeof u.role === "object" && u.role?.name ? String(u.role.name).toLowerCase() : String(u.role || "").toLowerCase();
    setEditingWasParent(uRoleName === "parent");
    setParentStudentIds([]);
    setPhotoFile(null);
    setPhotoPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return u.profileImage ? resolveUploadUrl(u.profileImage) : null;
    });
    setOpen(true);
  };

  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/image\/(jpeg|png|gif|webp)/i.test(f.type) && !/\.(jpe?g|png|gif|webp)$/i.test(f.name)) {
      toast({ title: "Invalid file", description: "Please choose a JPG, PNG, GIF, or WebP image.", variant: "destructive" });
      return;
    }
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const cols = tableColumns();
  const showLinkedStudents = scope === "all";
  const showParentPasswordCol = scope === "all";
  const showActions = scope === "staff" || caps.canEdit || caps.canDelete;
  const tableColSpan =
    cols.length + 2 + (showLinkedStudents ? 1 : 0) + (showParentPasswordCol ? 1 : 0) + (showActions ? 1 : 0);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <PanelToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, email, phone, role…"
      >
        {caps.canCreate && scope !== "staff" && (
          <Button
            variant="outline"
            disabled={provisionMutation.isPending}
            onClick={() => {
              if (
                !window.confirm(
                  "Create or reset parent portal email and password (Concept@1234) for every active student?",
                )
              ) {
                return;
              }
              provisionMutation.mutate();
            }}
          >
            {provisionMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            Create parent emails & passwords
          </Button>
        )}
        {caps.canCreate && (
          <Button variant="hero" onClick={openCreate}>
            <Plus className="h-4 w-4" /> {scope === "staff" ? "Add staff" : "Add user"}
          </Button>
        )}
      </PanelToolbar>
        {(caps.canCreate || caps.canEdit) && (
            <Dialog
              open={open}
              onOpenChange={(o) => {
                setOpen(o);
                if (!o) clearFormState();
              }}
            >
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {mode === "create"
                      ? scope === "staff" ? "Add staff member" : "Add user"
                      : scope === "staff" ? "Edit staff member" : "Edit user"}
                  </DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3 py-2">
                  {!isParentCreate && (
                    <div className="col-span-2 flex flex-col sm:flex-row gap-4 items-start">
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-24 w-24 rounded-full border-2 border-dashed border-border bg-muted flex items-center justify-center overflow-hidden">
                          {photoPreview ? (
                            <img src={photoPreview} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon className="h-8 w-8 text-muted-foreground" />
                          )}
                        </div>
                        <input
                          id="staff-photo-input"
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          className="sr-only"
                          onChange={onPickPhoto}
                        />
                        <Label htmlFor="staff-photo-input" className="cursor-pointer text-xs text-accent hover:underline">
                          Upload photo
                        </Label>
                      </div>
                      <p className="text-[11px] text-muted-foreground flex-1">
                        Profile picture is stored on the server (not a URL field). Optional — you can add or change it
                        whenever you save.
                      </p>
                    </div>
                  )}

                  <div className="col-span-2 sm:col-span-1">
                    <Label className="mb-1.5 block">
                      Role <span className="text-destructive">*</span>
                    </Label>
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={form.role}
                      onChange={(e) => {
                        const nextRole = e.target.value;
                        setFormField(setForm, "role", nextRole);
                        const roleName = roleOptions.find((r) => r._id === nextRole)?.name?.toLowerCase() || "";
                        if (roleName === "parent" && mode === "create") {
                          setParentCreate(emptyParentCreateSelection());
                        }
                        if (mode === "create" && roleName === "teacher") {
                          setModulePerms({ ...TEACHER_DEFAULT_MODULE_PERMISSIONS });
                        }
                        if (mode === "create" && roleName === "accountant") {
                          setModulePerms({ ...ACCOUNTANT_DEFAULT_MODULE_PERMISSIONS });
                        }
                      }}
                      required
                    >
                      <option value="">Select role…</option>
                      {roleOptions.map((r) => (
                        <option key={r._id} value={r._id}>
                          {roleDisplayLabel(r.name)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isParentCreate ? (
                    form.role ? (
                      <ParentUserCreateFields
                        value={parentCreate}
                        onChange={setParentCreate}
                        modules={modules}
                      />
                    ) : null
                  ) : (
                    <>
                      {visibleFormFields(mode)
                        .filter((field) => field.key !== "role")
                        .map((field) => (
                          <div key={field.key} className={field.colSpan === 2 ? "col-span-2" : "col-span-2 sm:col-span-1"}>
                            <Label className="mb-1.5 block">
                              {field.label}
                              {field.required && !(mode === "edit" && field.key === "password" && field.optionalOnEdit) ? (
                                <span className="text-destructive"> *</span>
                              ) : null}
                            </Label>
                            <SchemaFieldControl
                              field={field}
                              mode={mode}
                              value={form[field.key]}
                              onChange={(v) => setFormField(setForm, field.key, v)}
                              roleOptions={roleOptions}
                            />
                          </div>
                        ))}

                      {isParentRole && mode === "edit" && (
                        <div className="col-span-2 space-y-2">
                          <Label className="mb-1.5 block">
                            Parent students
                            <span className="text-destructive"> *</span>
                          </Label>
                          <div className="rounded-lg border p-3 bg-secondary/10">
                            {parentStudentChoicesLoading ? (
                              <p className="text-sm text-muted-foreground">Loading students…</p>
                            ) : parentStudentChoices.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No active students found.</p>
                            ) : (
                              <select
                                multiple
                                value={parentStudentIds}
                                onChange={(e) => {
                                  const opts = Array.from(e.target.selectedOptions);
                                  setParentStudentIds(opts.map((o) => o.value));
                                }}
                                className="w-full h-40 rounded-md border border-input bg-background px-3 text-sm"
                              >
                                {parentStudentChoices.map((s: AcademyStudent) => (
                                  <option key={s._id} value={s._id}>
                                    {s.studentName} ({s.studentId})
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>
                      )}

                      {modules.length > 0 && (
                        <ModuleAccessMatrix modules={modules} value={modulePerms} onChange={setModulePerms} />
                      )}
                    </>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => saveMutation.mutate()}
                    variant="hero"
                    disabled={saveMutation.isPending || (mode === "create" && !form.role)}
                  >
                    {saveMutation.isPending ? "Saving…" : "Save"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
        )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3 w-14">Photo</th>
                {cols.map((c) => (
                  <th key={c.key} className="text-left font-medium px-4 py-3">
                    {c.label}
                  </th>
                ))}
                {showLinkedStudents && (
                  <th className="text-left font-medium px-4 py-3 min-w-[10rem]">Linked students</th>
                )}
                {showParentPasswordCol && (
                  <th className="text-left font-medium px-4 py-3 min-w-[8rem]">Password</th>
                )}
                <th className="text-left font-medium px-4 py-3">Modules</th>
                {showActions && <th className="px-4 py-3 w-28" />}
              </tr>
            </thead>
            <tbody>
              {staffLoading ? (
                <tr>
                  <td colSpan={tableColSpan} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : staff.length === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} className="px-4 py-8 text-center text-muted-foreground">
                    {scope === "staff"
                      ? "No teachers or accountants yet."
                      : "No users found yet."}
                  </td>
                </tr>
              ) : staffFiltered.length === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} className="px-4 py-8 text-center text-muted-foreground">
                    No staff match your search.
                  </td>
                </tr>
              ) : (
                staffFiltered.map((u) => {
                  const modCount = u.modulePermissions ? Object.keys(u.modulePermissions).length : 0;
                  const imgSrc = u.profileImage ? resolveUploadUrl(u.profileImage) : undefined;
                  return (
                    <tr key={u._id} className="border-t border-border hover:bg-secondary/30">
                      <td className="px-4 py-2">
                        <div className="h-10 w-10 rounded-full bg-muted overflow-hidden border border-border">
                          {imgSrc ? (
                            <img src={imgSrc} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                      </td>
                      {cols.map((c) => (
                        <td key={c.key} className="px-4 py-3">
                          {formatTableCell(u, c.key)}
                        </td>
                      ))}
                      {showLinkedStudents && (
                        <td className="px-4 py-3 align-top">
                          <LinkedStudentsCell user={u} />
                        </td>
                      )}
                      {showParentPasswordCol && (
                        <td className="px-4 py-3 align-top">
                          {isParentUser(u) ? (
                            <span className="font-mono text-xs tracking-wide">Concept@1234</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 text-muted-foreground">
                        {(() => {
                          const mods = u.modulePermissions && typeof u.modulePermissions === "object"
                            ? Object.keys(u.modulePermissions)
                            : [];
                          if (!mods || mods.length === 0) return "—";
                          const show = mods.slice(0, 3);
                          return (
                            <div className="flex flex-wrap items-center gap-2">
                              {show.map((m) => (
                                <span key={m} className="text-xs bg-muted/20 rounded-full px-2 py-0.5 capitalize">
                                  {m}
                                </span>
                              ))}
                              {mods.length > 3 ? (
                                <span className="text-xs text-muted-foreground">+{mods.length - 3}</span>
                              ) : null}
                            </div>
                          );
                        })()}
                      </td>
                      {showActions && (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {scope === "staff" && (
                            <Button size="sm" variant="ghost" className="gap-1" asChild aria-label="View staff">
                              <Link to={u._id}>
                                <Eye className="h-4 w-4" /> View
                              </Link>
                            </Button>
                          )}
                          {caps.canEdit && (
                            <Button size="sm" variant="ghost" onClick={() => openEdit(u)} aria-label="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {caps.canEdit && u.isActive ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (window.confirm(`Deactivate ${u.name}?`)) deactivateMutation.mutate(u._id);
                              }}
                              aria-label="Deactivate"
                              title="Deactivate"
                            >
                              <UserX className="h-4 w-4 text-destructive" />
                            </Button>
                          ) : null}
                          {caps.canDelete && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={deleteMutation.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Permanently delete ${u.name}? This cannot be undone.`,
                                  )
                                ) {
                                  deleteMutation.mutate(u._id);
                                }
                              }}
                              aria-label="Delete"
                              title="Delete user"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog
        open={Boolean(createdParentCredentials)}
        onOpenChange={(o) => {
          if (!o) setCreatedParentCredentials(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Parent portal credentials</DialogTitle>
          </DialogHeader>
          {createdParentCredentials && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Student / parent name</p>
                <p className="font-medium">{createdParentCredentials.name}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Login email</p>
                <p className="font-medium break-all">{createdParentCredentials.email}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Password</p>
                <p className="font-medium font-mono tracking-wide">{createdParentCredentials.password}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Share these credentials with the family. Default password is Concept@1234.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => setCreatedParentCredentials(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={provisionOpen}
        onOpenChange={(o) => {
          setProvisionOpen(o);
          if (!o) setProvisionResult(null);
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Parent portal emails & passwords</DialogTitle>
          </DialogHeader>
          {provisionResult && (
            <div className="space-y-3 min-h-0 flex-1 flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p className="text-muted-foreground">
                  {provisionResult.total} students · {provisionResult.createdCount} new ·{" "}
                  {provisionResult.updatedCount} updated · password{" "}
                  <span className="font-medium text-foreground font-mono">
                    {provisionResult.defaultPassword}
                  </span>
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowProvisionPasswords((p) => !p)}
                >
                  {showProvisionPasswords ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                  {showProvisionPasswords ? "Hide passwords" : "Show passwords"}
                </Button>
              </div>
              <ScrollArea className="h-[min(420px,50vh)] rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background border-b border-border">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Student</th>
                      <th className="text-left font-medium px-3 py-2">Student ID</th>
                      <th className="text-left font-medium px-3 py-2">Email</th>
                      <th className="text-left font-medium px-3 py-2">Password</th>
                      <th className="text-left font-medium px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {provisionResult.rows.map((row) => (
                      <tr key={row.studentMongoId} className="border-t border-border">
                        <td className="px-3 py-2">{row.studentName}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.studentId}</td>
                        <td className="px-3 py-2 break-all text-xs">{row.parentEmail}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {showProvisionPasswords ? row.parentPassword : "••••••••"}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {row.created ? "Created" : "Updated"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => setProvisionOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersModule;
