/** One server-clock cutoff for live intake and planning; simulation dates remain isolated. */
export function planningWindow(at = new Date()) {
  const localDate = new Date(at.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  const opensAt = new Date(`${localDate}T16:00:00+05:30`);
  return {
    serverNow: at.toISOString(),
    opensAt: opensAt.toISOString(),
    planningOpen: at > opensAt,
  };
}
export function planningBlockReason(kind: string, at = new Date()) {
  return kind === 'LIVE' && !planningWindow(at).planningOpen
    ? 'Live planning opens after 4:00 PM Asia/Colombo when order intake closes'
    : null;
}
