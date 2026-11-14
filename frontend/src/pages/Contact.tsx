import { Phone, Mail, Clock, MapPin } from "lucide-react";
import SEO from "@/components/SEO";
import PageHeader from "@/components/PageHeader";
import ContactForm from "@/components/ContactForm";

const Contact = () => (
  <>
    <SEO
      title="Contact Us — The Concept Educational System"
      description="Get in touch with The Concept Educational System in Islamabad — phone, email and business hours for our School, College and Academy."
    />
    <PageHeader
      eyebrow="Contact"
      title="We'd love to hear from you."
      description="Whether you're a parent, student, or partner — our team is ready to help."
    />

    <section className="py-20 md:py-28">
      <div className="container grid lg:grid-cols-3 gap-10">
        {/* Info cards */}
        <div className="space-y-5">
          {[
            {
              icon: Phone,
              title: "Phone",
              lines: [
                "0301-1009989",
                "0300-1009989",
                "0332-2009989 (From 04:30 to 09:00 p.m.)",
              ],
            },
            {
              icon: Mail,
              title: "Email",
              lines: [
                { label: "General", href: "mailto:theconceptacademyislamabad@gmail.com", text: "theconceptacademyislamabad@gmail.com" },
                { label: "CEO Office", href: "mailto:ceo@theconcept.edu.pk", text: "ceo@theconcept.edu.pk" },
              ] as any,
            },
            {
              icon: Clock,
              title: "Business Hours",
              lines: ["Morning · 8:00 AM – 2:00 PM", "Evening · 4:00 PM – 9:00 PM"],
            },
            {
              icon: MapPin,
              title: "Location",
              lines: ["Islamabad, Pakistan"],
            },
          ].map((c) => (
            <div key={c.title} className="bg-card border border-border rounded-2xl p-6 shadow-card hover:shadow-elegant transition-smooth">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-lg bg-gold-gradient grid place-items-center shadow-gold">
                  <c.icon className="h-5 w-5 text-accent-foreground" />
                </div>
                <h3 className="font-display text-lg font-bold text-primary">{c.title}</h3>
              </div>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {c.lines.map((l: any, i: number) =>
                  typeof l === "string" ? (
                    <li key={i}>{l}</li>
                  ) : (
                    <li key={i}>
                      <span className="text-xs text-accent font-semibold uppercase tracking-wider mr-2">{l.label}</span>
                      <a href={l.href} className="hover:text-primary break-all">{l.text}</a>
                    </li>
                  )
                )}
              </ul>
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="lg:col-span-2">
          <div className="bg-card border border-border rounded-2xl p-7 md:p-10 shadow-card">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-primary mb-2">Send us a message</h2>
            <p className="text-muted-foreground mb-7">We typically respond within one business day.</p>
            <ContactForm />
          </div>
        </div>
      </div>
    </section>

    {/* Map placeholder */}
    <section className="pb-20">
      <div className="container">
        <div className="rounded-2xl overflow-hidden shadow-elegant border border-border h-[360px]">
          <iframe
            title="The Concept Educational System Location"
            src="https://www.openstreetmap.org/export/embed.html?bbox=72.95%2C33.65%2C73.15%2C33.75&amp;layer=mapnik"
            className="w-full h-full"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  </>
);

export default Contact;
