/** Legal review dates follow Korea's civil date, independent of the host's timezone. */
export function koreaDate(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}
