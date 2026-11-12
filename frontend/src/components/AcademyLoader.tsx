/** Full-screen loader: blue field, yellow spinner, “Loading...”. */
export default function AcademyLoader() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center bg-[#0d4f9c]"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className="relative h-16 w-16 motion-safe:animate-spin">
        {Array.from({ length: 12 }, (_, i) => (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 block h-3.5 w-[5px] rounded-full bg-[#F6C445]"
            style={{
              transform: `translate(-50%, -50%) rotate(${i * 30}deg) translateY(-22px)`,
              opacity: 0.16 + (i / 11) * 0.84,
            }}
          />
        ))}
      </div>
      <p className="mt-5 text-lg font-medium tracking-wide text-white">Loading...</p>
    </div>
  );
}
