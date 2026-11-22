/** Indian-grouped rupee amount, e.g. 2950000 → "₹29,50,000". */
export function formatINR(amount: number): string {
  const [whole, frac] = Math.abs(amount).toFixed(2).split('.');
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
  const sign = amount < 0 ? '-' : '';
  return `${sign}₹${grouped}${frac === '00' ? '' : '.' + frac}`;
}
