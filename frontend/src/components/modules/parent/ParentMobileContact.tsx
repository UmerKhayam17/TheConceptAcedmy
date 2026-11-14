import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Mail, Phone, type LucideIcon } from "lucide-react";
import ParentMobilePageHeader from "@/components/modules/parent/ParentMobilePageHeader";
import { useAuth } from "@/hooks/useAuth";

const PHONES = [
  { number: "0301-1009989" },
  { number: "0300-1009989" },
  { number: "0332-2009989", note: "From 04:30 to 09:00 p.m." },
] as const;

const EMAILS = [
  {
    label: "General",
    href: "mailto:theconceptacademyislamabad@gmail.com",
    text: "theconceptacademyislamabad@gmail.com",
  },
  {
    label: "CEO Office",
    href: "mailto:ceo@theconcept.edu.pk",
    text: "ceo@theconcept.edu.pk",
  },
] as const;

function InfoCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[22px] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-3 border-b border-[#EEF2F6] px-4 py-3.5">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#DBEAFE] text-[#0867cc]">
          <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </span>
        <h2 className="text-[16px] font-extrabold text-[#111827]">{title}</h2>
      </div>
      <div className="px-4 py-3.5">{children}</div>
    </section>
  );
}

export default function ParentMobileContact() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="min-h-full bg-[#F4F6F8] pb-8">
      <ParentMobilePageHeader title="Contact Us" onBack={() => navigate(-1)} />

      <div className="space-y-4 px-4 pt-1">
        <div className="overflow-hidden rounded-[22px] bg-gradient-to-br from-[#071958] via-[#0739ac] to-[#0873ed] px-5 py-5 text-white shadow-[0_12px_28px_rgba(8,103,204,0.28)]">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/70">
            The Concept Academy
          </p>
          <h2 className="mt-1.5 text-[22px] font-extrabold leading-tight tracking-tight">
            We&apos;re here to help
          </h2>
          <p className="mt-2 text-[14px] leading-snug text-white/85">
            Reach us by phone or email during business hours for assistance with admissions, academics, or account matters.
          </p>
          {user?.name ? (
            <p className="mt-3 text-[13px] font-semibold text-[#FFDA23]">
              Signed in as {user.name}
            </p>
          ) : null}
        </div>

        <InfoCard icon={Phone} title="Phone">
          <ul className="space-y-2.5">
            {PHONES.map((phone) => (
              <li key={phone.number}>
                <a
                  href={`tel:${phone.number.replace(/-/g, "")}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-[#F8FAFC] px-3.5 py-3 active:bg-[#EFF6FF]"
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold text-[#0867cc]">{phone.number}</span>
                    {"note" in phone && phone.note ? (
                      <span className="mt-0.5 block text-[12px] font-semibold text-[#64748B]">
                        {phone.note}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[12px] font-semibold text-[#64748B]">Call</span>
                </a>
              </li>
            ))}
          </ul>
        </InfoCard>

        <InfoCard icon={Mail} title="Email">
          <ul className="space-y-3">
            {EMAILS.map((email) => (
              <li key={email.href}>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#94A3B8]">
                  {email.label}
                </p>
                <a
                  href={email.href}
                  className="mt-1 block break-all text-[14px] font-semibold text-[#0867cc]"
                >
                  {email.text}
                </a>
              </li>
            ))}
          </ul>
        </InfoCard>

        <InfoCard icon={Clock} title="Business Hours">
          <ul className="space-y-2 text-[15px] font-semibold text-[#17324A]">
            <li>Morning · 8:00 AM – 2:00 PM</li>
            <li>Evening · 4:00 PM – 9:00 PM</li>
          </ul>
        </InfoCard>
      </div>
    </div>
  );
}
