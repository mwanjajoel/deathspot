export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { startup } = await import("@/lib/bootstrap")
  await startup()
}
