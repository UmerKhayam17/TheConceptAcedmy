import splash from "@/assets/mobile-loading.jpg";

/** Shown from the moment the app opens until the login page is ready. */
export default function AcademyLoader() {
  return (
    <div
      className="min-h-dvh bg-[#041a5c]"
      role="status"
      aria-live="polite"
      aria-label="Loading the academy portal"
    >
      <img
        src={splash}
        alt="The Concept Academy. Learn today, excel tomorrow."
        className="h-dvh w-full object-cover object-center"
      />
    </div>
  );
}
