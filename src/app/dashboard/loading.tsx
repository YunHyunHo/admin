const skeletonRows = Array.from({ length: 8 }, (_, index) => index);

export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-[#09090b] text-white">
      <div className="flex min-h-screen">
        <aside className="hidden w-[308px] shrink-0 border-r border-white/8 bg-[#10141b] xl:block">
          <div className="border-b border-white/8 px-7 pb-7 pt-8">
            <div className="h-11 w-44 rounded-2xl bg-white/8" />
            <div className="mt-7 h-24 rounded-3xl bg-white/[0.04]" />
          </div>
          <div className="space-y-3 px-4 py-5">
            {skeletonRows.slice(0, 6).map((row) => (
              <div key={row} className="h-12 rounded-2xl bg-white/[0.04]" />
            ))}
          </div>
        </aside>

        <section className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="h-[72px] border-b border-white/8 bg-black/18" />
          <div className="border-b border-white/8 px-4 py-4 sm:px-6">
            <div className="h-8 max-w-xl rounded-2xl bg-white/[0.05]" />
          </div>
          <div className="space-y-4 p-4 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {skeletonRows.slice(0, 4).map((row) => (
                <div key={row} className="h-28 rounded-2xl bg-white/[0.04]" />
              ))}
            </div>
            <div className="min-h-[520px] rounded-[28px] bg-white/[0.035]" />
          </div>
        </section>
      </div>
    </main>
  );
}
