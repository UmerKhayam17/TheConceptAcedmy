import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  ImageIcon,
  Loader2,
  Save,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  emptyUserForm,
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
  fetchAllRoles,
  fetchParentStudents,
  fetchModuleRegistry,
  fetchStaffUsers,
  fetchAllUsers,
  staffRolesOnly,
  userCreateRoles,
  roleDisplayLabel,
  assignParentStudents,
  updateStaffUser,
  uploadStaffProfilePhoto,
  normalizeModulePermissions,
  type RoleOption,
  type StaffUser,
} from "@/lib/staffApi";
import ModuleAccessMatrix from "@/components/modules/ModuleAccessMatrix";
import ParentUserCreateFields, {
  emptyParentCreateSelection,
  type ParentCreateSelection,
} from "@/components/modules/ParentUserCreateFields";
import { fetchAcademyStudents, type AcademyStudent } from "@/lib/studentManagementApi";
import { resolveUploadUrl } from "@/lib/api";
import { usersListHref, type UserFormScope } from "@/lib/userFormRoutes";
import { cn } from "@/lib/utils";

function setFormField(
  setter: React.Dispatch<React.SetStateAction<UserFormValues>>,
  key: UserFieldKey,
  value: string,
) {
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

  return field.inputType === "password" ? (
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
        <p className="text-xs text-muted-foreground">
          Password is shown in plain text so you can copy it.
        </p>
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
  );
}

function SectionCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm ring-1 ring-black/[0.02]",
        className,
      )}
    >
      <div className="mb-4 border-b border-slate-100 pb-3">
        <h3 className="text-sm font-semibold tracking-tight text-[#1a2b4b]">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

const STAFF_QUERY = ["users-module-list"] as const;

export default function UserFormPage({
  caps,
  scope,
  mode,
  userId,
}: {
  caps: ModuleActionCaps;
  scope: UserFormScope;
  mode: UserFormMode;
  userId?: string;
}) {
  const { toast } = useToast();
  const { user: session } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const role = session?.role;
  const listHref = role ? usersListHref(role, scope) : "/";
  const isStaffScope = scope === "staff";
  const HeaderIcon = mode === "create" ? UserPlus : isStaffScope ? UserCog : Users;

  const [form, setForm] = useState<UserFormValues>(() => emptyUserForm());
  const [modulePerms, setModulePerms] = useState<Record<string, string[]>>({});
  const [parentStudentIds, setParentStudentIds] = useState<string[]>([]);
  const [parentCreate, setParentCreate] = useState<ParentCreateSelection>(() =>
    emptyParentCreateSelection(),
  );
  const [editingWasParent, setEditingWasParent] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [createdParentCredentials, setCreatedParentCredentials] = useState<{
    name: string;
    email: string;
    password: string;
  } | null>(null);
  const [showParentPassword, setShowParentPassword] = useState(true);

  const { data: rolesRaw = [] } = useQuery({
    queryKey: ["staffRoles"],
    queryFn: fetchAllRoles,
  });

  const { data: editingUser, isLoading: userLoading } = useQuery({
    queryKey: [...STAFF_QUERY, scope, "edit", userId],
    queryFn: async () => {
      const list =
        scope === "staff"
          ? await fetchStaffUsers()
          : ((await fetchAllUsers()) as StaffUser[]);
      const found = list.find((u) => u._id === userId);
      if (!found) throw new Error("User not found");
      return found;
    },
    enabled: mode === "edit" && Boolean(userId),
  });

  const { data: modules = [] } = useQuery({
    queryKey: ["moduleRegistry"],
    queryFn: fetchModuleRegistry,
  });

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
  const isParentCreate = mode === "create" && isParentRole;

  useEffect(() => {
    if (mode !== "edit" || !editingUser) return;
    setForm(userToFormValues(editingUser));
    setModulePerms(normalizeModulePermissions(editingUser.modulePermissions));
    const uRoleName =
      typeof editingUser.role === "object" && editingUser.role?.name
        ? String(editingUser.role.name).toLowerCase()
        : String(editingUser.role || "").toLowerCase();
    setEditingWasParent(uRoleName === "parent");
    setPhotoFile(null);
    setPhotoPreview(
      editingUser.profileImage ? resolveUploadUrl(editingUser.profileImage) : null,
    );
  }, [mode, editingUser]);

  useEffect(() => {
    if (mode !== "create") return;
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
    if (isTeacherRole) setModulePerms({ ...TEACHER_DEFAULT_MODULE_PERMISSIONS });
    else if (isAccountantRole) setModulePerms({ ...ACCOUNTANT_DEFAULT_MODULE_PERMISSIONS });
  }, [mode, isTeacherRole, isAccountantRole, isParentRole, form.role]);

  const { data: parentStudentChoices = [], isLoading: parentStudentChoicesLoading } = useQuery({
    queryKey: ["academy-student-choices", isParentRole, mode],
    queryFn: async () => {
      const r = await fetchAcademyStudents({ page: 1, limit: 200, status: "active" });
      return r.students;
    },
    enabled: isParentRole && mode === "edit",
    retry: false,
  });

  const { data: currentParentStudents = [] } = useQuery({
    queryKey: ["parent-students", userId],
    queryFn: async () => {
      if (!userId) return [];
      return await fetchParentStudents(userId);
    },
    enabled: mode === "edit" && Boolean(userId) && isParentRole,
    retry: false,
  });

  useEffect(() => {
    if (!(mode === "edit" && isParentRole)) return;
    setParentStudentIds(currentParentStudents.map((r: { _id: string }) => r._id));
  }, [mode, isParentRole, currentParentStudents]);

  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (
      !/image\/(jpeg|png|gif|webp)/i.test(f.type) &&
      !/\.(jpe?g|png|gif|webp)$/i.test(f.name)
    ) {
      toast({
        title: "Invalid file",
        description: "Please choose a JPG, PNG, GIF, or WebP image.",
        variant: "destructive",
      });
      return;
    }
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (mode === "create" && !caps.canCreate) {
        throw new Error("You do not have permission to create users.");
      }
      if (mode === "edit" && !caps.canEdit) {
        throw new Error("You do not have permission to edit users.");
      }

      if (mode === "create" && isParentRole) {
        if (!form.role) throw new Error("Select a role.");
        if (!parentCreate.studentId) throw new Error("Select a student for this parent.");
        if (!parentCreate.name.trim()) throw new Error("Selected student has no name.");
        if (!parentCreate.email.trim()) {
          throw new Error(
            "Could not build a portal email. Ensure the student has an official Student ID.",
          );
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
          payType: "fixed",
          salary: 0,
          salaryPercentage: 0,
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
        if (f.required && !v && f.key !== "salary" && f.key !== "salaryPercentage") {
          throw new Error(`${f.label} is required.`);
        }
        if (f.key === "password" && mode === "create" && (!v || v.length < 8)) {
          throw new Error("Password must be at least 8 characters.");
        }
        if (f.key === "password" && mode === "edit" && v && v.length < 8) {
          throw new Error("Password must be at least 8 characters.");
        }
        if (f.key === "role" && !form.role) throw new Error("Select a role.");
      }

      const payType = form.payType === "percentage" ? "percentage" : "fixed";
      const salaryNum = Math.max(0, Number(form.salary) || 0);
      const pctNum = Math.min(100, Math.max(0, Number(form.salaryPercentage) || 0));
      if (payType === "percentage" && pctNum <= 0) {
        throw new Error("Enter the teacher percentage (greater than 0).");
      }
      if (isParentRole && mode === "edit" && parentStudentIds.length === 0) {
        throw new Error("Select at least one student for this parent.");
      }

      if (mode === "create") {
        if (!form.password || form.password.length < 8) {
          throw new Error("Password must be at least 8 characters.");
        }
        const u = await createStaffUser({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          phone: form.phone.trim(),
          role: form.role,
          isActive: form.isActive === "true",
          payType,
          salary: payType === "fixed" ? salaryNum : 0,
          salaryPercentage: payType === "percentage" ? pctNum : 0,
          modulePermissions: { ...modulePerms },
        });
        if (photoFile) await uploadStaffProfilePhoto(u._id, photoFile);
        return { user: u, parentCredentials: null };
      }

      if (!userId) throw new Error("Missing user");
      const payload: Parameters<typeof updateStaffUser>[1] = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        role: form.role,
        isActive: form.isActive === "true",
        payType,
        salary: payType === "fixed" ? salaryNum : 0,
        salaryPercentage: payType === "percentage" ? pctNum : 0,
        modulePermissions: { ...modulePerms },
      };
      if (form.password.trim()) payload.password = form.password;
      const u = await updateStaffUser(userId, payload);
      if (photoFile) await uploadStaffProfilePhoto(userId, photoFile);
      if (isParentRole) await assignParentStudents(userId, parentStudentIds);
      if (!isParentRole && editingWasParent) await assignParentStudents(userId, []);
      return { user: u, parentCredentials: null };
    },
    onSuccess: (result) => {
      toast({
        title:
          mode === "create"
            ? isParentRole
              ? "Parent user created"
              : isStaffScope
                ? "Staff member created"
                : "User created"
            : isStaffScope
              ? "Staff member updated"
              : "User updated",
      });
      void qc.invalidateQueries({ queryKey: STAFF_QUERY });
      if (result.parentCredentials) {
        setCreatedParentCredentials(result.parentCredentials);
        return;
      }
      navigate(listHref);
    },
    onError: (e: Error) => {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    },
  });

  const pageTitle =
    mode === "create"
      ? isStaffScope
        ? "Add staff"
        : "Add user"
      : isStaffScope
        ? "Edit staff"
        : "Edit user";
  const pageHint =
    mode === "create"
      ? isStaffScope
        ? "Create a teacher or accountant with pay settings and module access."
        : "Create a portal account, assign a role, and set module permissions."
      : "Update profile details, pay type, and module access for this account.";

  if (mode === "edit" && userLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading user…
      </div>
    );
  }

  if (mode === "edit" && !userLoading && !editingUser) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-12 text-center space-y-3">
        <p className="text-sm text-muted-foreground">User not found.</p>
        <Button variant="outline" asChild>
          <Link to={listHref}>Back to list</Link>
        </Button>
      </div>
    );
  }

  const canSave =
    (mode === "create" ? caps.canCreate : caps.canEdit) &&
    Boolean(form.role) &&
    !saveMutation.isPending;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <HeaderIcon className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={listHref}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to {isStaffScope ? "staff" : "users"}
                </Link>
              </div>
              <h2 className="mt-0.5 text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                {pageTitle}
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-xl">
                {pageHint}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button variant="outline" className="h-10 gap-2" asChild>
              <Link to={listHref}>Cancel</Link>
            </Button>
            <Button
              className="h-10 gap-2"
              disabled={!canSave}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saveMutation.isPending ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4">
        <div className="space-y-4">
          {!isParentCreate && (
            <SectionCard
              title="Profile photo"
              description="Optional. Stored on the server — you can change it anytime."
            >
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <div className="flex flex-col items-center gap-2">
                  <div className="h-28 w-28 rounded-full border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
                    {photoPreview ? (
                      <img src={photoPreview} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <input
                    id="user-form-photo"
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="sr-only"
                    onChange={onPickPhoto}
                  />
                  <Label
                    htmlFor="user-form-photo"
                    className="cursor-pointer text-xs font-medium text-primary hover:underline"
                  >
                    Upload photo
                  </Label>
                </div>
                <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                  Use a clear face photo for staff directories and attendance. JPG, PNG, GIF, or
                  WebP.
                </p>
              </div>
            </SectionCard>
          )}

          <SectionCard
            title="Account details"
            description="Role, login credentials, and contact information."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 sm:max-w-xs">
                <Label className="mb-1.5 block">
                  Role <span className="text-destructive">*</span>
                </Label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.role}
                  onChange={(e) => {
                    const nextRole = e.target.value;
                    setFormField(setForm, "role", nextRole);
                    const roleName =
                      roleOptions.find((r) => r._id === nextRole)?.name?.toLowerCase() || "";
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
                  <div className="sm:col-span-2">
                    <ParentUserCreateFields
                      value={parentCreate}
                      onChange={setParentCreate}
                      modules={modules}
                    />
                  </div>
                ) : null
              ) : (
                <>
                  {visibleFormFields(mode)
                    .filter((field) => {
                      if (field.key === "role") return false;
                      if (
                        isParentRole &&
                        (field.key === "payType" ||
                          field.key === "salary" ||
                          field.key === "salaryPercentage")
                      ) {
                        return false;
                      }
                      if (field.key === "salary" && form.payType === "percentage") return false;
                      if (field.key === "salaryPercentage" && form.payType !== "percentage") {
                        return false;
                      }
                      return true;
                    })
                    .map((field) => (
                      <div
                        key={field.key}
                        className={field.colSpan === 2 ? "sm:col-span-2" : undefined}
                      >
                        <Label className="mb-1.5 block">
                          {field.label}
                          {field.required &&
                          !(mode === "edit" && field.key === "password" && field.optionalOnEdit) ? (
                            <span className="text-destructive"> *</span>
                          ) : null}
                          {field.key === "salaryPercentage" ? (
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
                        {field.key === "payType" ? (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Fixed uses a monthly amount. Percentage teachers get tuition × subject
                            share × this teacher %. Subject weightage is configured on Subjects.
                          </p>
                        ) : null}
                        {field.key === "salaryPercentage" ? (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Teacher’s cut of each subject pool (e.g. 60 or 70).
                          </p>
                        ) : null}
                      </div>
                    ))}

                  {isParentRole && mode === "edit" && (
                    <div className="sm:col-span-2 space-y-2">
                      <Label className="mb-1.5 block">
                        Parent students
                        <span className="text-destructive"> *</span>
                      </Label>
                      <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/80">
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
                </>
              )}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          {!isParentCreate && modules.length > 0 ? (
            <SectionCard
              title="Module permissions"
              description="Choose what this account can view and manage in the panel."
            >
              <ModuleAccessMatrix
                modules={modules}
                value={modulePerms}
                onChange={setModulePerms}
              />
            </SectionCard>
          ) : (
            <SectionCard
              title="Access"
              description={
                isParentCreate
                  ? "Parent module access is configured with the student link below."
                  : "Select a role to load default module permissions."
              }
            >
              <p className="text-sm text-slate-500">
                {isParentCreate
                  ? "Use the parent fields to set portal access for the linked student."
                  : "Default permissions appear after you pick Teacher, Accountant, or Parent."}
              </p>
            </SectionCard>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1 pb-6">
        <Button variant="outline" className="h-10 gap-2" asChild>
          <Link to={listHref}>Cancel</Link>
        </Button>
        <Button className="h-10 gap-2" disabled={!canSave} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saveMutation.isPending ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
        </Button>
      </div>

      <Dialog
        open={Boolean(createdParentCredentials)}
        onOpenChange={(o) => {
          if (!o) {
            setCreatedParentCredentials(null);
            navigate(listHref);
          }
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
                <p className="text-muted-foreground text-xs">Email</p>
                <p className="font-mono text-xs break-all">{createdParentCredentials.email}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Password</p>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-xs">
                    {showParentPassword ? createdParentCredentials.password : "••••••••"}
                  </p>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setShowParentPassword((v) => !v)}
                  >
                    {showParentPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <Button className="w-full" onClick={() => navigate(listHref)}>
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
