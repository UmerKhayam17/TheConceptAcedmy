/**
 * Staff / User fields aligned with backend `User` schema (`backend/src/models/User.js`).
 * Profile photos are uploaded as files (`POST /users/:id/profile-photo`), not URL fields.
 */

export type UserFieldKey =
  | "name"
  | "email"
  | "password"
  | "phone"
  | "role"
  | "isActive"
  | "payType"
  | "salary"
  | "salaryPercentage";

export type UserFieldType = "text" | "email" | "password" | "tel" | "select" | "number";

export type UserFormMode = "create" | "edit";

export interface SelectOption {
  value: string;
  label: string;
}

export interface UserSchemaField {
  key: UserFieldKey;
  label: string;
  inputType: UserFieldType;
  modes: UserFormMode[];
  required: boolean;
  optionalOnEdit?: boolean;
  colSpan: 1 | 2;
  showInTable: boolean;
  placeholder?: string;
  options?: SelectOption[];
  optionsFrom?: "roles";
  booleanSelect?: boolean;
}

export const USER_SCHEMA_FIELDS: UserSchemaField[] = [
  {
    key: "name",
    label: "Full name",
    inputType: "text",
    modes: ["create", "edit"],
    required: true,
    colSpan: 2,
    showInTable: true,
    placeholder: "Full name",
  },
  {
    key: "email",
    label: "Email",
    inputType: "email",
    modes: ["create", "edit"],
    required: true,
    colSpan: 2,
    showInTable: true,
    placeholder: "login@school.edu",
  },
  {
    key: "password",
    label: "Password",
    inputType: "password",
    modes: ["create", "edit"],
    required: true,
    optionalOnEdit: true,
    colSpan: 2,
    showInTable: false,
    placeholder: "Concept@1234 or custom password",
  },
  {
    key: "phone",
    label: "Phone",
    inputType: "tel",
    modes: ["create", "edit"],
    required: true,
    colSpan: 1,
    showInTable: true,
    placeholder: "Primary contact",
  },
  {
    key: "role",
    label: "Role",
    inputType: "select",
    modes: ["create", "edit"],
    required: true,
    colSpan: 1,
    showInTable: true,
    optionsFrom: "roles",
  },
  {
    key: "isActive",
    label: "Status",
    inputType: "select",
    modes: ["create", "edit"],
    required: true,
    colSpan: 1,
    showInTable: true,
    booleanSelect: true,
    options: [
      { value: "true", label: "Active" },
      { value: "false", label: "Inactive" },
    ],
  },
  {
    key: "payType",
    label: "Pay type",
    inputType: "select",
    modes: ["create", "edit"],
    required: true,
    colSpan: 1,
    showInTable: true,
    options: [
      { value: "fixed", label: "Fixed salary" },
      { value: "percentage", label: "Percentage" },
    ],
  },
  {
    key: "salary",
    label: "Monthly salary (PKR)",
    inputType: "number",
    modes: ["create", "edit"],
    required: false,
    colSpan: 1,
    showInTable: false,
    placeholder: "0",
  },
  {
    key: "salaryPercentage",
    label: "Salary percentage (%)",
    inputType: "number",
    modes: ["create", "edit"],
    required: false,
    colSpan: 1,
    showInTable: false,
    placeholder: "e.g. 40",
  },
];

export function visibleFormFields(mode: UserFormMode): UserSchemaField[] {
  return USER_SCHEMA_FIELDS.filter((f) => f.modes.includes(mode));
}

export function tableColumns(): UserSchemaField[] {
  return USER_SCHEMA_FIELDS.filter((f) => f.showInTable);
}

export type UserFormValues = Record<UserFieldKey, string>;

export function emptyUserForm(): UserFormValues {
  return {
    name: "",
    email: "",
    password: "",
    phone: "",
    role: "",
    isActive: "true",
    payType: "fixed",
    salary: "0",
    salaryPercentage: "0",
  };
}

export function userToFormValues(u: {
  name?: string;
  email?: string;
  phone?: string;
  isActive?: boolean;
  payType?: "fixed" | "percentage" | string;
  salary?: number;
  salaryPercentage?: number;
  role?: { _id?: string; name?: string } | string;
}): UserFormValues {
  const roleId = typeof u.role === "object" && u.role?._id ? String(u.role._id) : "";
  return {
    name: u.name ?? "",
    email: u.email ?? "",
    password: "",
    phone: u.phone ?? "",
    role: roleId,
    isActive: u.isActive === false ? "false" : "true",
    payType: u.payType === "percentage" ? "percentage" : "fixed",
    salary: String(u.salary ?? 0),
    salaryPercentage: String(u.salaryPercentage ?? 0),
  };
}
