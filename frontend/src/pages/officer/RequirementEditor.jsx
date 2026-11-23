import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Panel from '../../components/ui/Panel.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { approveRequirements, getRequirements, saveRequirements } from '../../services/tenders.js';
import { apiError } from '../../services/api.js';
import { REQ_TYPES, RULE_TEMPLATES } from '../../utils/ruleTemplates.js';
import { fmtDateTime } from '../../utils/format.js';
import { useAsync } from '../../hooks/useAsync.js';

let n = 0;
const toRows = (reqs) => reqs.map((r) => ({ key: ++n, code: r.code, type: r.type, description: r.description, mandatory: r.mandatory, ruleText: JSON.stringify(r.rule, null, 2), origin: r.origin, edited: r.editedByOfficer }));
const blank = () => ({ key: ++n, code: '', type: 'DOCUMENT', description: '', mandatory: true, ruleText: '{}', origin: 'officer' });

export default function RequirementEditor({ tenderId, canEdit, lockedReason, onChanged }) {
  const { loading, data, error, reload } = useAsync(() => getRequirements(tenderId), [tenderId]);
  const [rows, setRows] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [forceEdit, setForceEdit] = useState(false);
  const [errs, setErrs] = useState({});     // rowKey -> [messages]
  const [msg, setMsg] = useState(null);      // { kind: 'ok'|'err', text }
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (data) { setRows(toRows(data.requirements)); setDirty(false); setErrs({}); } }, [data]);

  const approved = !!data?.approved;
  const readOnly = !canEdit || (approved && !forceEdit);
  const edit = (key, patch) => { setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r))); setDirty(true); setMsg(null); };

  const mapErrors = (fields, parsedRows) => {
    const out = {};
    fields.forEach((f) => {
      let row;
      const m = /^requirements\.(\d+)\./.exec(f.path);
      if (m) row = parsedRows[Number(m[1])]; else row = parsedRows.find((r) => f.path.startsWith(`${r.code}.`));
      const k = row ? row.key : 'general';
      (out[k] = out[k] || []).push(`${f.path.replace(/^requirements\.\d+\./, '')}: ${f.message}`);
    });
    return out;
  };

  const save = async () => {
    setMsg(null); const e = {}; const payload = [];
    for (const r of rows) {
      try { payload.push({ code: r.code.trim(), type: r.type, description: r.description.trim(), mandatory: r.mandatory, rule: JSON.parse(r.ruleText || '{}') }); }
      catch { e[r.key] = ['rule: not valid JSON']; }
    }
    if (Object.keys(e).length) { setErrs(e); setMsg({ kind: 'err', text: 'Fix the highlighted rows before saving.' }); return false; }
    setBusy(true);
    try { await saveRequirements(tenderId, payload); setForceEdit(false); setMsg({ kind: 'ok', text: 'Draft saved. It is not in force until you approve it.' }); await reload(); onChanged?.(); return true; }
    catch (x) { const a = apiError(x); setErrs(mapErrors(a.fields, rows)); setMsg({ kind: 'err', text: a.message }); return false; }
    finally { setBusy(false); }
  };

  const approve = async () => {
    setConfirming(false); setBusy(true); setMsg(null);
    try { const r = await approveRequirements(tenderId); setMsg({ kind: 'ok', text: `Version ${r.version} approved and frozen. The tender is now open to bidders.` }); setForceEdit(false); await reload(); onChanged?.(); }
    catch (x) { const a = apiError(x); setErrs(mapErrors(a.fields, rows)); setMsg({ kind: 'err', text: a.message }); }
    finally { setBusy(false); }
  };

  const latest = data?.versions?.[data.versions.length - 1];
  return (
    <Panel title={`Eligibility requirements${data?.version ? ` – version ${data.version}` : ''}`}
      actions={data?.version ? <StatusBadge status={approved ? 'DONE' : 'DRAFT'} label={approved ? 'Approved and frozen' : 'Draft – not in force'} /> : null}>
      {loading && <p className="p-3 text-[13px] text-muted" role="status">Loading requirements…</p>}
      {error && <p className="p-3 text-[13px] text-bad" role="alert">{error}</p>}
      {rows && (
        <div className="p-3 space-y-3">
          {!canEdit && lockedReason && <p className="text-[12px] border border-line bg-paper px-3 py-2 rounded">{lockedReason}</p>}
          {msg && <p role={msg.kind === 'err' ? 'alert' : 'status'} className={`text-[13px] px-3 py-2 rounded border ${msg.kind === 'err' ? 'border-bad bg-[#FBEDED] text-bad' : 'border-ok bg-[#EAF5EE] text-ok'}`}>{msg.text}</p>}
          {errs.general && <ul className="text-[12px] text-bad list-disc pl-5">{errs.general.map((m, i) => <li key={i}>{m}</li>)}</ul>}
          {rows.length === 0 && <p className="text-[13px] text-muted">No requirements yet. {canEdit ? 'Add them below; automatic extraction from the NIT arrives with the AI service (phase 5).' : ''}</p>}

          {rows.map((r, i) => (
            <fieldset key={r.key} className={`border rounded p-3 ${errs[r.key] ? 'border-bad' : 'border-line'}`} disabled={readOnly || busy}>
              <legend className="px-1 text-[12px] text-muted">Requirement {i + 1}{r.origin === 'ai' ? ' · AI-extracted draft' : ''}{r.edited ? ' · edited by officer' : ''}</legend>
              <div className="grid md:grid-cols-[110px_160px_1fr_auto] gap-2 items-start">
                <div><label className="field-label" htmlFor={`c${r.key}`}>Code</label><input id={`c${r.key}`} className="field-input" value={r.code} onChange={(e) => edit(r.key, { code: e.target.value })} /></div>
                <div><label className="field-label" htmlFor={`t${r.key}`}>Type</label><select id={`t${r.key}`} className="field-input" value={r.type} onChange={(e) => edit(r.key, { type: e.target.value })}>{REQ_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
                <div><label className="field-label" htmlFor={`d${r.key}`}>Description</label><textarea id={`d${r.key}`} rows={2} className="field-input" value={r.description} onChange={(e) => edit(r.key, { description: e.target.value })} /></div>
                <label className="flex items-center gap-1 text-[13px] mt-6"><input type="checkbox" checked={r.mandatory} onChange={(e) => edit(r.key, { mandatory: e.target.checked })} />Mandatory</label>
              </div>
              <div className="mt-2 grid md:grid-cols-[1fr_220px] gap-2">
                <div><label className="field-label" htmlFor={`r${r.key}`}>Rule (JSON)</label><textarea id={`r${r.key}`} rows={5} spellCheck={false} className="field-input font-mono text-[12px]" value={r.ruleText} onChange={(e) => edit(r.key, { ruleText: e.target.value })} /></div>
                <div className="space-y-2">
                  <div><label className="field-label" htmlFor={`tp${r.key}`}>Insert template</label>
                    <select id={`tp${r.key}`} className="field-input" value="" onChange={(e) => e.target.value && edit(r.key, { ruleText: JSON.stringify(RULE_TEMPLATES[e.target.value], null, 2) })}>
                      <option value="">Choose rule type…</option>{Object.keys(RULE_TEMPLATES).map((k) => <option key={k}>{k}</option>)}</select></div>
                  {!readOnly && <button type="button" className="btn-danger !py-0.5" onClick={() => { setRows(rows.filter((x) => x.key !== r.key)); setDirty(true); }}><Trash2 size={13} aria-hidden="true" />Remove</button>}
                </div>
              </div>
              {errs[r.key] && <ul className="mt-2 text-[12px] text-bad list-disc pl-5" role="alert">{errs[r.key].map((m, j) => <li key={j}>{m}</li>)}</ul>}
            </fieldset>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            {!readOnly && <button className="btn-secondary" onClick={() => { setRows([...rows, blank()]); setDirty(true); }}><Plus size={14} aria-hidden="true" />Add requirement</button>}
            {!readOnly && <button className="btn-primary" onClick={save} disabled={busy || !dirty}>Save draft</button>}
            {!readOnly && data?.version && !approved && !dirty && !confirming && <button className="btn-primary" onClick={() => setConfirming(true)} disabled={busy}>Approve and freeze…</button>}
            {canEdit && approved && !forceEdit && <button className="btn-secondary" onClick={() => setForceEdit(true)}>Edit (starts a new version)</button>}
            {!readOnly && dirty && data?.version && !approved && <span className="text-[12px] text-muted">Save your changes before approving.</span>}
          </div>
          {confirming && (
            <div role="alertdialog" aria-label="Confirm approval" className="border border-warn bg-[#FBF3E4] p-3 text-[13px] space-y-2">
              <p><b>Approve version {data.version}?</b> It becomes the rule set used for every bidder and cannot be altered afterwards; further changes create a new version. The tender opens to bidders.</p>
              <div className="flex gap-2"><button className="btn-primary" onClick={approve}>Confirm approval</button><button className="btn-secondary" onClick={() => setConfirming(false)}>Cancel</button></div>
            </div>
          )}
          {data?.versions?.length > 0 && (
            <div className="border-t border-line pt-2 text-[12px] text-muted">Version history: {data.versions.map((v) => `v${v.version} (${v.count} req., ${v.approved ? `approved ${fmtDateTime(v.approvedAt)}` : 'draft'})`).join(' · ')}{latest && !latest.approved && data.versions.length > 1 ? ' — the approved version stays in force until the draft is approved.' : ''}</div>
          )}
        </div>
      )}
    </Panel>
  );
}
