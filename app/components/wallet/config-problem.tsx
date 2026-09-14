export function ConfigProblem({ problems }: { problems: string[] }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <p className="tag">Configuration</p>
      <h1 className="text-3xl font-semibold">STATELOCK cannot start with this configuration.</h1>
      <p className="text-dim">
        The app only runs against the network and contract it is configured for. Set these public values in{" "}
        <code className="font-mono text-text">app/.env.local</code> (see <code className="font-mono text-text">.env.example</code>) and
        restart:
      </p>
      <ul className="grid gap-2">
        {problems.map((p) => (
          <li key={p} className="border border-no/40 bg-no/10 px-4 py-3 font-mono text-sm text-text">
            {p}
          </li>
        ))}
      </ul>
    </main>
  );
}
