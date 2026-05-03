type PlaceholderColumn = {
  label: string;
  value: string;
};

type AdminPlaceholderBoardProps = {
  eyebrow: string;
  title: string;
  description: string;
  columns: PlaceholderColumn[];
  nextSteps: string[];
};

export function AdminPlaceholderBoard({
  eyebrow,
  title,
  description,
  columns,
  nextSteps,
}: AdminPlaceholderBoardProps) {
  return (
    <section className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
      <div className="flex flex-col gap-3 border-b border-white/8 px-5 py-6 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-cyan-300/55">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
            {title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/52">
            {description}
          </p>
        </div>
        <div className="rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-xs font-semibold text-amber-100">
          DB 연결 후 활성화
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="overflow-hidden rounded-[26px] border border-white/8 bg-black/18">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-black/38 text-white/72">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.label}
                    className="border-b border-white/8 px-4 py-4 font-semibold"
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="text-white/54">
                {columns.map((column) => (
                  <td key={column.label} className="px-4 py-5">
                    {column.value}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {nextSteps.map((step) => (
            <div
              key={step}
              className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/58"
            >
              {step}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
