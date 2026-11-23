export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '–');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');
export const fmtInr = (n) => (n == null ? '–' : '₹ ' + Number(n).toLocaleString('en-IN'));
export const humanize = (code) => String(code).toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
// datetime-local input value from an ISO string, in the browser's local time
export const toLocalInput = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
