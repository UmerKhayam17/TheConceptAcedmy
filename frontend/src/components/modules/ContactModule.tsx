import { Clock, Mail, Phone } from "lucide-react";
import { Card } from "@/components/ui/card";
import ParentMobileContact from "@/components/modules/parent/ParentMobileContact";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const PHONES = [
  { number: "0301-1009989" },
  { number: "0300-1009989" },
  { number: "0332-2009989", note: "From 04:30 to 09:00 p.m." },
];

export default function ContactModule() {
  const { user } = useAuth();
  const isParent = user?.role === "parent";

  return (
    <>
      {isParent ? (
        <div className="md:hidden">
          <ParentMobileContact />
        </div>
      ) : null}

      <div
        className={cn(
          "mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 lg:px-8",
          isParent && "hidden md:block",
        )}
      >
        <div>
          <h1 className="font-display text-xl font-bold text-primary sm:text-2xl">Contact Us</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reach The Concept Academy — phone, email, and business hours.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#DBEAFE] text-[#0867cc]">
                <Phone className="h-5 w-5" />
              </span>
              <h2 className="font-semibold text-primary">Phone</h2>
            </div>
            <ul className="space-y-2 text-sm">
              {PHONES.map((phone) => (
                <li key={phone.number}>
                  <a
                    href={`tel:${phone.number.replace(/-/g, "")}`}
                    className="font-medium text-[#0867cc] hover:underline"
                  >
                    {phone.number}
                  </a>
                  {phone.note ? (
                    <p className="text-xs text-muted-foreground">{phone.note}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#DBEAFE] text-[#0867cc]">
                <Mail className="h-5 w-5" />
              </span>
              <h2 className="font-semibold text-primary">Email</h2>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-[#0867cc]">
                  General
                </span>
                <a
                  href="mailto:theconceptacademyislamabad@gmail.com"
                  className="break-all hover:text-primary"
                >
                  theconceptacademyislamabad@gmail.com
                </a>
              </li>
              <li>
                <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-[#0867cc]">
                  CEO
                </span>
                <a href="mailto:ceo@theconcept.edu.pk" className="break-all hover:text-primary">
                  ceo@theconcept.edu.pk
                </a>
              </li>
            </ul>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#DBEAFE] text-[#0867cc]">
                <Clock className="h-5 w-5" />
              </span>
              <h2 className="font-semibold text-primary">Hours</h2>
            </div>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>Morning · 8:00 AM – 2:00 PM</li>
              <li>Evening · 4:00 PM – 9:00 PM</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
