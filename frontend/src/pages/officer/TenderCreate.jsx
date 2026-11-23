import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import Breadcrumbs from '../../components/ui/Breadcrumbs.jsx';
import Panel from '../../components/ui/Panel.jsx';
import { createTender } from '../../services/tenders.js';
import { apiError } from '../../services/api.js';

const MAX_MB = 25;
const schema = z.object({
  tenderNo: z.string().trim().min(3, 'At least 3 characters').max(60).regex(/^[A-Za-z0-9][A-Za-z0-9/\-_.]*$/, 'Use letters, digits and / - _ . only'),
  gemBidNo: z.string().max(60).optional(),
  title: z.string().trim().min(5, 'At least 5 characters').max(300),
  department: z.string().trim().min(2, 'Required').max(150),
  description: z.string().max(5000).optional(),
  estimatedValue: z.coerce.number({ invalid_type_error: 'Enter a number' }).min(0, 'Cannot be negative'),
  submissionDeadline: z.string().min(1, 'Required'),
  bidOpeningDate: z.string().min(1, 'Required'),
  file: z.any().refine((f) => f?.length === 1, 'Attach the NIT/ATC PDF')
    .refine((f) => !f?.[0] || /\.pdf$/i.test(f[0].name), 'Only PDF files are accepted')
    .refine((f) => !f?.[0] || f[0].size <= MAX_MB * 1024 * 1024, `File must be ${MAX_MB} MB or smaller`),
}).superRefine((v, ctx) => {
  if (v.submissionDeadline && new Date(v.submissionDeadline) <= new Date()) ctx.addIssue({ code: 'custom', path: ['submissionDeadline'], message: 'Must be in the future' });
  if (v.submissionDeadline && v.bidOpeningDate && new Date(v.bidOpeningDate) < new Date(v.submissionDeadline)) ctx.addIssue({ code: 'custom', path: ['bidOpeningDate'], message: 'Cannot be before the submission deadline' });
});

function Field({ id, label, error, children, hint }) {
  return (<div><label htmlFor={id} className="field-label">{label}</label>{children}{hint && <p className="text-[12px] text-muted mt-1">{hint}</p>}{error && <p className="field-error" role="alert">{error.message}</p>}</div>);
}

export default function TenderCreate() {
  const nav = useNavigate();
  const [serverError, setServerError] = useState('');
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (v) => {
    setServerError('');
    try {
      const { file, ...fields } = v;
      fields.submissionDeadline = new Date(fields.submissionDeadline).toISOString();
      fields.bidOpeningDate = new Date(fields.bidOpeningDate).toISOString();
      const { tender } = await createTender(fields, file[0]);
      nav(`/officer/tenders/${tender.id}`);
    } catch (e) {
      const err = apiError(e);
      // Server-side field errors are shown next to the field; file-level errors under the file input.
      err.fields.forEach((f) => setError(f.path === 'tenderFile' || f.path.endsWith('.pdf') ? 'file' : f.path, { message: f.message }));
      setServerError(err.message);
    }
  };

  return (
    <>
      <Breadcrumbs items={[{ label: 'Home', to: '/officer' }, { label: 'Tenders', to: '/officer/tenders' }, { label: 'Create tender' }]} />
      <h1 className="mb-3">Create tender</h1>
      <Panel title="Tender details and NIT/ATC document">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="p-4 grid md:grid-cols-2 gap-4 max-w-4xl">
          {serverError && <div role="alert" className="md:col-span-2 text-[13px] border border-bad bg-[#FBEDED] text-bad px-3 py-2 rounded">{serverError}</div>}
          <Field id="tenderNo" label="Tender number *" error={errors.tenderNo}><input id="tenderNo" className="field-input" {...register('tenderNo')} /></Field>
          <Field id="gemBidNo" label="GeM bid number (if any)" error={errors.gemBidNo}><input id="gemBidNo" className="field-input" {...register('gemBidNo')} /></Field>
          <div className="md:col-span-2"><Field id="title" label="Title *" error={errors.title}><input id="title" className="field-input" {...register('title')} /></Field></div>
          <Field id="department" label="Department *" error={errors.department}><input id="department" className="field-input" {...register('department')} /></Field>
          <Field id="estimatedValue" label="Estimated value (₹) *" error={errors.estimatedValue}><input id="estimatedValue" inputMode="decimal" className="field-input" {...register('estimatedValue')} /></Field>
          <Field id="submissionDeadline" label="Submission deadline *" error={errors.submissionDeadline}><input id="submissionDeadline" type="datetime-local" className="field-input" {...register('submissionDeadline')} /></Field>
          <Field id="bidOpeningDate" label="Bid opening date *" error={errors.bidOpeningDate}><input id="bidOpeningDate" type="datetime-local" className="field-input" {...register('bidOpeningDate')} /></Field>
          <div className="md:col-span-2"><Field id="description" label="Description" error={errors.description}><textarea id="description" rows={3} className="field-input" {...register('description')} /></Field></div>
          <div className="md:col-span-2">
            <Field id="file" label="NIT / ATC document (PDF) *" error={errors.file} hint={`PDF only, up to ${MAX_MB} MB. Encrypted or damaged PDFs are rejected.`}>
              <input id="file" type="file" accept="application/pdf,.pdf" className="field-input" {...register('file')} />
            </Field>
          </div>
          <div className="md:col-span-2 flex gap-2">
            <button className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Creating…' : 'Create tender'}</button>
            <button type="button" className="btn-secondary" onClick={() => nav('/officer/tenders')}>Cancel</button>
          </div>
          <p className="md:col-span-2 text-[12px] text-muted">After creation, requirement extraction is queued. Until the AI service is connected (phase 5) you add requirements manually; nothing becomes a rule until you approve it.</p>
        </form>
      </Panel>
    </>
  );
}
