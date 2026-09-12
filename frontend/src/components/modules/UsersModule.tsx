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
import { Plus, Pencil, UserX, ImageIcon, Eye, EyeOff } from "lucide-react";
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
import { fetchAcademyStudents, type AcademyStudent } from "@/lib/studentManagementApi";
import { resolveUploadUrl } from "@/lib/api";

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
  const [showPassword, setShowPassword] = useState(false);
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
      <div className="relative">
        <Input
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-10"
          required={
            field.required && !(mode === "edit" && field.key === "password" && field.optionalOnEdit)
          }
        />
        <button
          type="button"
          onClick={() => setShowPassword((p) => !p)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
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

  // Seed default RBAC matrix when creating teacher / accountant (admin can still override).
  useEffect(() => {
    if (!open || mode !== "create" || isParentRole) return;
    if (isTeacherRole) {
      setModulePerms({ ...TEACHER_DEFAULT_MODULE_PERMISSIONS });
    } else if (isAccountantRole) {
      setModulePerms({ ...ACCOUNTANT_DEFAULT_MODULE_PERMISSIONS });
    }
  }, [open, mode, isTeacherRole, isAccountantRole, isParentRole, form.role]);

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
          throw new Error("Selected student has no email. Add an email on the student record first.");
        }
        if (!parentCreate.password || parentCreate.password.length < 8) {
          throw new Error("Password must be at least 8 characters.");
        }
        const u = await createStaffUser({
          name: parentCreate.name.trim(),
          email: parentCreate.email.trim().toLowerCase(),
          password: parentCreate.password,
          phone: parentCreate.phone.trim() || "N/A",
          role: form.role,
          isActive: true,
          salary: 0,
          modulePermissions: parentCreate.modulePermissions,
        });
        await assignParentStudents(u._id, [parentCreate.studentId]);
        return u;
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
        return u;
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
      return u;
    },
    onSuccess: () => {
      toast({
        title: mode === "create"
          ? isParentRole ? "Parent user created" : "User created"
          : "User updated",
      });
      void qc.invalidateQueries({ queryKey: STAFF_QUERY });
      setOpen(false);
      clearFormState();
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
  const showActions = scope === "staff" || caps.canEdit || caps.canDelete;
  const tableColSpan = cols.length + 2 + (showLinkedStudents ? 1 : 0) + (showActions ? 1 : 0);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <PanelToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, email, phone, role…"
      >
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
                            >
                              <UserX className="h-4 w-4 text-destructive" />
                            </Button>
                          ) : null}
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
    </div>
  );
};

export default UsersModule;
