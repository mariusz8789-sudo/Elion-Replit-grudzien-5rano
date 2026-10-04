import type { ReactNode } from 'react';
import type { LabLoopState, LabPackage, LabProviderType, LabQualityStatus, LabRequest, LabReviewVerdict } from '../../core/backend/client';
import type { Locale } from '../../core/i18n';
import {
  comparisonView, formatNumber, nextActionWords, toleranceWords, type ExperimentRow, type Notice, type ObservationForm, type ObservationStage, type RequestForm,
} from './labHandoffModel';
import { INTEGRITY_TEXT, PROVIDER_TEXT, QC_TEXT, REVIEW_TEXT, lText, pairText, type LabTextKey } from './labHandoffText';

/**
 * #/lab-handoff — the pure view. It renders only what it is given (LabHandoffScreen fetches and holds the
 * state), so every state renders in a test with renderToStaticMarkup. Engine names, hashes and the server's
 * own English sentences appear only inside `data-technical-details` sections.
 */

export function Tech({ locale, rows, testId }: { locale: Locale; rows: readonly string[]; testId?: string }) {
  if (!rows.length) return null;
  return (
    <details className="vf-tech" data-technical-details data-testid={testId}>
      <summary>{lText('technical', locale)}</summary>
      <ul>{rows.map((r, i) => <li key={`${i}-${r}`}><code>{r}</code></li>)}</ul>
    </details>
  );
}

export function LabNotice({ notice, locale, testId }: { notice: Notice; locale: Locale; testId: string }) {
  return (
    <div className={`vf-notice vf-tone-${notice.tone}`} role={notice.tone === 'bad' ? 'alert' : 'status'} data-testid={testId}>
      {notice.lines.map((l) => <p key={l}>{l}</p>)}
      <Tech locale={locale} rows={notice.technical} />
    </div>
  );
}

export function HonestNotice({ locale }: { locale: Locale }) {
  return (
    <aside className="vf-unsigned" data-testid="lh-honest">
      <strong>{lText('honestTitle', locale)}</strong>
      <p>{lText('honestNoPartner', locale)}</p>
      <p>{lText('honestUnsigned', locale)}</p>
      <p>{lText('honestNotClinical', locale)}</p>
    </aside>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="vf-field">
      <span>{label}</span>
      {children}
      {hint ? <small className="vf-muted">{hint}</small> : null}
    </label>
  );
}

const PROVIDERS: readonly LabProviderType[] = ['CRO', 'ACADEMIC_LAB', 'INTERNAL_LAB', 'OTHER_EXTERNAL'];
const QUALITIES: readonly LabQualityStatus[] = ['QC_PASSED', 'QC_FAILED', 'QC_UNKNOWN'];
const VERDICTS: readonly LabReviewVerdict[] = ['ACCEPTED_AS_OBSERVATION', 'NEEDS_CLARIFICATION', 'REJECTED_INTEGRITY'];

/* ---------------- step 1 ---------------- */

export function ExperimentsStep({ locale, rows, onPrepare }: { locale: Locale; rows: readonly ExperimentRow[]; onPrepare: (experimentId: string) => void }) {
  return (
    <section className="lh-step" data-testid="lh-experiments">
      <h2>{lText('step1', locale)}</h2>
      <p className="vf-muted">{lText('step1Lead', locale)}</p>
      {rows.length === 0
        ? <p className="vf-muted">{lText('noExperiments', locale)}</p>
        : (
          <ul className="lh-list">
            {rows.map((row) => (
              <li key={row.experimentId} className={`lh-card ${row.eligible ? 'vf-tone-good' : 'vf-tone-idle'}`} data-testid={`lh-experiment-${row.experimentId}`} data-eligible={row.eligible ? 'yes' : 'no'}>
                <div className="vf-check-head">
                  <span className="vf-check-title">{row.claim}</span>
                  <span className="vf-badge">{lText(row.eligible ? 'eligible' : 'notEligible', locale)}</span>
                </div>
                <p className="lh-facts">{[row.verdictWord, row.replayWord].filter(Boolean).join(' · ')}</p>
                {row.why ? <p className="lh-why" data-testid="lh-why">{row.why}</p> : null}
                {row.eligible ? (
                  <div className="vf-actions">
                    <button type="button" className="vf-btn" onClick={() => onPrepare(row.experimentId)} data-testid="lh-prepare-open">{lText('prepareFor', locale)}</button>
                    {row.hasRequest ? <span className="vf-muted">{lText('hasRequest', locale)}</span> : null}
                  </div>
                ) : null}
                <Tech locale={locale} rows={row.technical} />
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

/* ---------------- step 2 ---------------- */

export interface RequestStepProps {
  locale: Locale;
  claim: string;
  outputs: readonly { key: string; value: number }[];
  form: RequestForm;
  missing: readonly string[];
  busy: boolean;
  notice: Notice | null;
  onChange: (patch: Partial<RequestForm>) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function RequestStep(p: RequestStepProps) {
  const { locale, form } = p;
  const bad = (key: keyof RequestForm) => (p.missing.includes(key) ? 'true' : undefined);
  return (
    <section className="lh-step" data-testid="lh-request-form">
      <h2>{lText('step2', locale)}</h2>
      <p className="vf-muted">{lText('step2Lead', locale)}</p>
      <p className="vf-meta">{lText('forExperiment', locale)}: <strong>{p.claim}</strong></p>
      <form className="vf-form" onSubmit={(e) => { e.preventDefault(); p.onSubmit(); }}>
        <Field label={lText('endpointId', locale)} hint={lText('endpointIdHint', locale)}>
          <input type="text" value={form.endpointId} aria-invalid={bad('endpointId')} onChange={(e) => p.onChange({ endpointId: e.target.value })} data-testid="lh-endpoint-id" />
        </Field>
        <Field label={lText('assay', locale)} hint={lText('assayHint', locale)}>
          <input type="text" value={form.assay} aria-invalid={bad('assay')} onChange={(e) => p.onChange({ assay: e.target.value })} data-testid="lh-assay" />
        </Field>
        {p.outputs.length === 0
          ? <p className="vf-error">{lText('noNumericOutput', locale)}</p>
          : (
            <Field label={lText('outputKey', locale)}>
              <select value={form.outputKey} aria-invalid={bad('outputKey')} onChange={(e) => p.onChange({ outputKey: e.target.value })} data-testid="lh-output-key">
                <option value="">{lText('chooseOutput', locale)}</option>
                {p.outputs.map((o) => <option key={o.key} value={o.key}>{`${o.key} = ${o.value}`}</option>)}
              </select>
            </Field>
          )}
        <Field label={lText('unit', locale)} hint={lText('unitHint', locale)}>
          <input type="text" value={form.expectedUnit} aria-invalid={bad('expectedUnit')} onChange={(e) => p.onChange({ expectedUnit: e.target.value })} data-testid="lh-unit" />
        </Field>
        <div className="lh-grid">
          <Field label={lText('toleranceAbs', locale)}>
            <input type="text" inputMode="decimal" value={form.toleranceAbsolute} aria-invalid={bad('toleranceAbsolute')} onChange={(e) => p.onChange({ toleranceAbsolute: e.target.value })} data-testid="lh-tol-abs" />
          </Field>
          <Field label={lText('toleranceRel', locale)}>
            <input type="text" inputMode="decimal" value={form.toleranceRelative} aria-invalid={bad('toleranceRelative')} onChange={(e) => p.onChange({ toleranceRelative: e.target.value })} data-testid="lh-tol-rel" />
          </Field>
        </div>
        <small className="vf-muted">{lText('toleranceHint', locale)}</small>
        <Field label={lText('objective', locale)}>
          <input type="text" value={form.objective} onChange={(e) => p.onChange({ objective: e.target.value })} data-testid="lh-objective" />
        </Field>
        <div className="lh-grid">
          <Field label={lText('labName', locale)}>
            <input type="text" value={form.labName} onChange={(e) => p.onChange({ labName: e.target.value })} data-testid="lh-lab-name" />
          </Field>
          <Field label={lText('providerType', locale)}>
            <select value={form.providerType} onChange={(e) => p.onChange({ providerType: e.target.value as LabProviderType })}>
              {PROVIDERS.map((t) => <option key={t} value={t}>{pairText(PROVIDER_TEXT[t]!, locale)}</option>)}
            </select>
          </Field>
        </div>
        {p.missing.length > 0 ? <p className="vf-error" role="alert" data-testid="lh-request-missing">{lText('missingFields', locale)} {p.missing.map((m) => lText(fieldLabel(m), locale)).join(', ')}</p> : null}
        {p.notice ? <LabNotice notice={p.notice} locale={locale} testId="lh-request-notice" /> : null}
        <div className="vf-actions">
          <button type="submit" className="vf-btn" disabled={p.busy} data-testid="lh-request-submit">{lText(p.busy ? 'preparing' : 'prepare', locale)}</button>
          <button type="button" className="vf-btn vf-btn-quiet" onClick={p.onCancel}>{lText('cancel', locale)}</button>
        </div>
      </form>
    </section>
  );
}

function fieldLabel(key: string): LabTextKey {
  const map: Record<string, LabTextKey> = {
    endpointId: 'endpointId', assay: 'assay', outputKey: 'outputKey', expectedUnit: 'unit', toleranceAbsolute: 'toleranceAbs', toleranceRelative: 'toleranceRel',
    value: 'value', unit: 'unit', observedAt: 'observedAt', methodReference: 'methodReference', labId: 'labId', externalObservationId: 'externalObservationId',
    sourceUri: 'sourceUri', rawFile: 'rawFile',
  };
  return map[key] ?? 'errOther';
}

/* ---------------- step 3 ---------------- */

export interface PackageStepProps {
  locale: Locale;
  requests: readonly LabRequest[];
  claimOf: (experimentId: string) => string;
  busyRequestId: string | null;
  saved: { requestId: string; pkg: LabPackage; url: string | null; fileName: string } | null;
  notice: Notice | null;
  verifyBusy: boolean;
  verifyNotice: Notice | null;
  onGetPackage: (requestId: string) => void;
  onVerifyFile: (file: File) => void;
  onVerifySaved: () => void;
}

export function PackageStep(p: PackageStepProps) {
  const { locale } = p;
  return (
    <section className="lh-step" data-testid="lh-packages">
      <h2>{lText('step3', locale)}</h2>
      <p className="vf-muted">{lText('step3Lead', locale)}</p>
      <h3>{lText('requests', locale)}</h3>
      {p.requests.length === 0 ? <p className="vf-muted">{lText('noRequests', locale)}</p> : (
        <ul className="lh-list">
          {p.requests.map((r) => (
            <li key={r.requestId} className="lh-card" data-testid="lh-request">
              <div className="vf-check-head"><span className="vf-check-title">{p.claimOf(r.experimentId)}</span></div>
              <dl className="lh-dl">
                <div><dt>{lText('endpointId', locale)}</dt><dd>{r.endpoint.endpointId}</dd></div>
                <div><dt>{lText('assay', locale)}</dt><dd>{r.endpoint.assay}</dd></div>
                <div><dt>{lText('frozenModelValue', locale)}</dt><dd data-testid="lh-frozen-value">{`${formatNumber(r.modelBinding.modelValue)} ${r.endpoint.expectedUnit}`}</dd></div>
                <div><dt>{lText('frozenTolerance', locale)}</dt><dd>{toleranceWords(r.endpoint.tolerance, r.endpoint.expectedUnit, locale)}</dd></div>
              </dl>
              <div className="vf-actions">
                <button type="button" className="vf-btn" disabled={p.busyRequestId === r.requestId} onClick={() => p.onGetPackage(r.requestId)} data-testid="lh-get-package">
                  {lText(p.busyRequestId === r.requestId ? 'gettingPackage' : 'getPackage', locale)}
                </button>
              </div>
              {p.saved?.requestId === r.requestId ? (
                <div className="vf-exported" data-testid="lh-package-ready">
                  <p>{lText('packageUnsigned', locale)}</p>
                  <p className="vf-meta">{lText('packageReady', locale)} <code>{p.saved.pkg.packageHash}</code></p>
                  {p.saved.url ? <a className="vf-btn" href={p.saved.url} download={p.saved.fileName} data-testid="lh-save-package">{lText('savePackage', locale)}</a> : null}
                  <h3>{lText('pleaseReturn', locale)}</h3>
                  <ul className="vf-not-checked">{p.saved.pkg.forLaboratory.pleaseReturn.map((line) => <li key={line} lang="en">{line}</li>)}</ul>
                </div>
              ) : null}
              <Tech locale={locale} rows={[`requestId: ${r.requestId}`, `outputKey: ${r.modelBinding.outputKey}`, `outputHash: ${r.modelBinding.outputHash}`, `status: ${r.status}`, `executionAuthority: ${r.executionAuthority}`, `boundary: ${r.claimBoundary}`]} />
            </li>
          ))}
        </ul>
      )}
      {p.notice ? <LabNotice notice={p.notice} locale={locale} testId="lh-package-notice" /> : null}

      <h3>{lText('verifyTitle', locale)}</h3>
      <p className="vf-muted">{lText('verifyLead', locale)}</p>
      <div className="vf-actions">
        <label className="vf-file">
          <span className="vf-btn vf-btn-quiet">{lText('verifyFile', locale)}</span>
          <input type="file" accept="application/json,.json" onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onVerifyFile(f); e.target.value = ''; }} data-testid="lh-verify-file" />
        </label>
        {p.saved ? <button type="button" className="vf-btn vf-btn-quiet" disabled={p.verifyBusy} onClick={p.onVerifySaved} data-testid="lh-verify-saved">{lText(p.verifyBusy ? 'verifying' : 'verifyLast', locale)}</button> : null}
      </div>
      {p.verifyNotice ? <LabNotice notice={p.verifyNotice} locale={locale} testId="lh-verify-notice" /> : null}
    </section>
  );
}

/* ---------------- step 4 ---------------- */

export interface ObservationStepProps {
  locale: Locale;
  requests: readonly LabRequest[];
  requestId: string;
  form: ObservationForm;
  file: { name: string; size: number } | null;
  missing: readonly string[];
  busy: boolean;
  notice: Notice | null;
  onRequest: (requestId: string) => void;
  onChange: (patch: Partial<ObservationForm>) => void;
  onFile: (file: File) => void;
  onSubmit: () => void;
}

export function ObservationStep(p: ObservationStepProps) {
  const { locale, form } = p;
  if (p.requests.length === 0) return null;
  const request = p.requests.find((r) => r.requestId === p.requestId) ?? null;
  const bad = (key: string) => (p.missing.includes(key) ? 'true' : undefined);
  return (
    <section className="lh-step" data-testid="lh-observation-form">
      <h2>{lText('step4', locale)}</h2>
      <p className="vf-muted">{lText('step4Lead', locale)}</p>
      <form className="vf-form" onSubmit={(e) => { e.preventDefault(); p.onSubmit(); }}>
        <Field label={lText('forRequest', locale)}>
          <select value={p.requestId} onChange={(e) => p.onRequest(e.target.value)} data-testid="lh-obs-request">
            <option value="">{lText('chooseRequest', locale)}</option>
            {p.requests.map((r) => <option key={r.requestId} value={r.requestId}>{`${r.endpoint.endpointId} · ${r.endpoint.expectedUnit}`}</option>)}
          </select>
        </Field>
        {request ? (
          <>
            <p className="vf-meta">{lText('endpointId', locale)}: <strong>{request.endpoint.endpointId}</strong></p>
            <div className="lh-grid">
              <Field label={lText('value', locale)}>
                <input type="text" inputMode="decimal" value={form.value} aria-invalid={bad('value')} onChange={(e) => p.onChange({ value: e.target.value })} data-testid="lh-obs-value" />
              </Field>
              <Field label={lText('unit', locale)}>
                <input type="text" value={form.unit} aria-invalid={bad('unit')} onChange={(e) => p.onChange({ unit: e.target.value })} data-testid="lh-obs-unit" />
              </Field>
            </div>
            <Field label={lText('observedAt', locale)}>
              <input type="datetime-local" value={form.observedAt} aria-invalid={bad('observedAt')} onChange={(e) => p.onChange({ observedAt: e.target.value })} data-testid="lh-obs-when" />
            </Field>
            <Field label={lText('methodReference', locale)}>
              <input type="text" value={form.methodReference} aria-invalid={bad('methodReference')} onChange={(e) => p.onChange({ methodReference: e.target.value })} data-testid="lh-obs-method" />
            </Field>
            <div className="lh-grid">
              <Field label={lText('labId', locale)}>
                <input type="text" value={form.labId} aria-invalid={bad('labId')} onChange={(e) => p.onChange({ labId: e.target.value })} data-testid="lh-obs-lab" />
              </Field>
              <Field label={lText('providerType', locale)}>
                <select value={form.providerType} onChange={(e) => p.onChange({ providerType: e.target.value as LabProviderType })}>
                  {PROVIDERS.map((t) => <option key={t} value={t}>{pairText(PROVIDER_TEXT[t]!, locale)}</option>)}
                </select>
              </Field>
            </div>
            <Field label={lText('externalObservationId', locale)}>
              <input type="text" value={form.externalObservationId} aria-invalid={bad('externalObservationId')} onChange={(e) => p.onChange({ externalObservationId: e.target.value })} data-testid="lh-obs-ext-id" />
            </Field>
            <Field label={lText('sourceUri', locale)}>
              <input type="text" inputMode="url" value={form.sourceUri} aria-invalid={bad('sourceUri')} onChange={(e) => p.onChange({ sourceUri: e.target.value })} data-testid="lh-obs-uri" />
            </Field>
            <Field label={lText('quality', locale)}>
              <select value={form.quality} onChange={(e) => p.onChange({ quality: e.target.value as LabQualityStatus })} data-testid="lh-obs-qc">
                {QUALITIES.map((q) => <option key={q} value={q}>{pairText(QC_TEXT[q]!, locale)}</option>)}
              </select>
            </Field>
            <Field label={lText('qualityNotes', locale)}>
              <input type="text" value={form.notes} onChange={(e) => p.onChange({ notes: e.target.value })} />
            </Field>
            <div className="vf-field">
              <span>{lText('rawFile', locale)}</span>
              <label className="vf-file">
                <span className="vf-btn vf-btn-quiet">{lText('chooseFile', locale)}</span>
                <input type="file" aria-invalid={bad('rawFile')} onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onFile(f); e.target.value = ''; }} data-testid="lh-obs-file" />
                {p.file ? <span className="vf-file-name" data-testid="lh-obs-file-name">{`${p.file.name} · ${p.file.size} ${lText('fileBytes', locale)}`}</span> : null}
              </label>
              <small className="vf-muted">{lText('rawFileHint', locale)}</small>
            </div>
            {p.missing.length > 0 ? <p className="vf-error" role="alert" data-testid="lh-obs-missing">{lText('missingFields', locale)} {p.missing.map((m) => lText(fieldLabel(m), locale)).join(', ')}</p> : null}
            {p.notice ? <LabNotice notice={p.notice} locale={locale} testId="lh-obs-notice" /> : null}
            <div className="vf-actions">
              <button type="submit" className="vf-btn" disabled={p.busy} data-testid="lh-obs-submit">{lText(p.busy ? 'submittingObservation' : 'submitObservation', locale)}</button>
            </div>
          </>
        ) : null}
      </form>
    </section>
  );
}

/* ---------------- steps 5–7 ---------------- */

export interface ResultsStepProps {
  locale: Locale;
  lab: LabLoopState;
  stages: readonly ObservationStage[];
  reviewDraft: Record<string, { verdict: LabReviewVerdict | ''; note: string }>;
  busy: string | null;
  notices: Record<string, Notice>;
  onReviewDraft: (observationId: string, patch: Partial<{ verdict: LabReviewVerdict | ''; note: string }>) => void;
  onReview: (observationId: string) => void;
  onCompare: (observationId: string) => void;
  onPropose: (observationId: string) => void;
}

export function ResultsStep(p: ResultsStepProps) {
  const { locale } = p;
  return (
    <section className="lh-step" data-testid="lh-results">
      <h2>{lText('step5', locale)}</h2>
      <p className="vf-muted">{lText('step5Lead', locale)}</p>
      {p.stages.length === 0 ? <p className="vf-muted">{lText('noObservations', locale)}</p> : (
        <ul className="lh-list">
          {p.stages.map((s) => {
            const o = s.observation;
            const id = o.observationId;
            const draft = p.reviewDraft[id] ?? { verdict: '', note: '' };
            const comparison = s.comparison ? comparisonView(s.comparison, locale) : null;
            return (
              <li key={id} className="lh-card" data-testid="lh-observation" data-observation-id={id}>
                <div className="vf-check-head">
                  <span className="vf-check-title">{`${o.endpointId}: ${String(o.value)} ${o.unit}`}</span>
                  <span className="vf-badge">{o.evidenceClass}</span>
                </div>
                <dl className="lh-dl">
                  <div><dt>{lText('labId', locale)}</dt><dd>{`${o.source.labId} · ${o.source.externalObservationId}`}</dd></div>
                  <div><dt>{lText('quality', locale)}</dt><dd>{QC_TEXT[o.quality.status] ? pairText(QC_TEXT[o.quality.status]!, locale) : o.quality.status}</dd></div>
                  <div><dt>{lText('rawFile', locale)}</dt><dd>{INTEGRITY_TEXT[o.rawArtifactIntegrity.level] ? pairText(INTEGRITY_TEXT[o.rawArtifactIntegrity.level]!, locale) : o.rawArtifactIntegrity.level} <code data-testid="lh-obs-sha">{o.rawArtifactSha256}</code></dd></div>
                  <div><dt>{lText('enteredBy', locale)}</dt><dd>{s.enteredByMe ? lText('you', locale) : lText('anotherPerson', locale)}</dd></div>
                  <div><dt>{lText('reviewState', locale)}</dt><dd data-testid="lh-review-state">{o.review ? pairText(REVIEW_TEXT[o.review.verdict] ?? [o.review.verdict, o.review.verdict], locale) : lText('notReviewed', locale)}</dd></div>
                </dl>

                {s.enteredByMe ? <p className="lh-why" data-testid="lh-you-entered">{lText('youEntered', locale)}</p> : null}
                {o.quality.status === 'QC_FAILED' ? <p className="lh-why" data-testid="lh-qc-failed">{lText('qcFailedNoAccept', locale)}</p> : null}
                {!s.accepted ? (
                  <form className="lh-review" onSubmit={(e) => { e.preventDefault(); p.onReview(id); }}>
                    <Field label={lText('verdict', locale)}>
                      <select value={draft.verdict} onChange={(e) => p.onReviewDraft(id, { verdict: e.target.value as LabReviewVerdict | '' })} data-testid="lh-review-verdict">
                        <option value="">—</option>
                        {VERDICTS.map((v) => <option key={v} value={v} disabled={v === 'ACCEPTED_AS_OBSERVATION' && o.quality.status === 'QC_FAILED'}>{pairText(REVIEW_TEXT[v]!, locale)}</option>)}
                      </select>
                    </Field>
                    <Field label={lText('reviewNote', locale)}>
                      <input type="text" value={draft.note} onChange={(e) => p.onReviewDraft(id, { note: e.target.value })} data-testid="lh-review-note" />
                    </Field>
                    <div className="vf-actions">
                      <button type="submit" className="vf-btn" disabled={!draft.verdict || p.busy === `review:${id}`} data-testid="lh-review-submit">{lText(p.busy === `review:${id}` ? 'submittingReview' : 'submitReview', locale)}</button>
                    </div>
                  </form>
                ) : null}
                {p.notices[`review:${id}`] ? <LabNotice notice={p.notices[`review:${id}`]!} locale={locale} testId="lh-review-notice" /> : null}

                <h3>{lText('step6', locale)}</h3>
                <p className="vf-muted">{lText('step6Lead', locale)}</p>
                {!s.accepted ? <p className="vf-muted">{lText('needsAccept', locale)}</p> : null}
                {s.accepted && !comparison ? (
                  <div className="vf-actions">
                    <button type="button" className="vf-btn" disabled={p.busy === `compare:${id}`} onClick={() => p.onCompare(id)} data-testid="lh-compare">{lText(p.busy === `compare:${id}` ? 'comparing' : 'compare', locale)}</button>
                  </div>
                ) : null}
                {comparison ? (
                  <div className={`vf-verdict vf-tone-${comparison.tone}`} data-testid="lh-comparison" data-verdict={comparison.verdict}>
                    <strong>{comparison.verdictWord}</strong>
                    <dl className="lh-dl">
                      <div><dt>{lText('computed', locale)}</dt><dd data-testid="lh-cmp-model">{`${comparison.model} ${comparison.unit}`}</dd></div>
                      <div><dt>{lText('measured', locale)}</dt><dd data-testid="lh-cmp-measured">{`${comparison.measured} ${comparison.unit}`}</dd></div>
                      <div><dt>{lText('difference', locale)}</dt><dd>{`${comparison.delta} ${comparison.unit}`}</dd></div>
                      {comparison.checks.map((c) => (
                        <div key={c.kind}><dt>{`${lText('toleranceCheck', locale)} (${c.kind})`}</dt><dd>{`${c.actual} ≤ ${c.threshold}: ${lText(c.pass ? 'withinTolerance' : 'outsideTolerance', locale)}`}</dd></div>
                      ))}
                    </dl>
                    <p>{lText('clinicalUnknown', locale)}</p>
                    <Tech locale={locale} rows={comparison.technical} />
                  </div>
                ) : null}
                {p.notices[`compare:${id}`] ? <LabNotice notice={p.notices[`compare:${id}`]!} locale={locale} testId="lh-compare-notice" /> : null}

                <h3>{lText('step7', locale)}</h3>
                <p className="vf-muted">{lText('step7Lead', locale)}</p>
                {s.evidenceProposalId ? (
                  <div className="vf-notice" role="status" data-testid="lh-evidence-proposed">
                    <p>{lText('proposed', locale)}</p>
                    <a className="vf-btn vf-btn-quiet" href="#/knowledge-sources">{lText('openKnowledge', locale)}</a>
                    <Tech locale={locale} rows={[`proposalId: ${s.evidenceProposalId}`]} />
                  </div>
                ) : s.accepted ? (
                  <div className="vf-actions">
                    <button type="button" className="vf-btn" disabled={p.busy === `evidence:${id}`} onClick={() => p.onPropose(id)} data-testid="lh-propose">{lText(p.busy === `evidence:${id}` ? 'proposing' : 'propose', locale)}</button>
                  </div>
                ) : null}
                {p.notices[`evidence:${id}`] ? <LabNotice notice={p.notices[`evidence:${id}`]!} locale={locale} testId="lh-evidence-notice" /> : null}

                <Tech locale={locale} rows={[`observationId: ${id}`, `requestId: ${o.requestId}`, `observedAt: ${o.observedAt}`, `method: ${o.methodReference}`, `source: ${o.source.sourceUri}`, `integrity: ${o.rawArtifactIntegrity.limitation}`, `ingestedBy: ${o.ingestedBy}`, o.review ? `review: ${o.review.verdict} by ${o.review.reviewerId}` : 'review: none']} />
              </li>
            );
          })}
        </ul>
      )}
      <div className="vf-notice" role="status" data-testid="lh-next">
        <p><strong>{lText('nextTitle', locale)}:</strong> {nextActionWords(p.lab.nextResearchAction.action, locale)}</p>
        <Tech locale={locale} rows={[`nextResearchAction: ${p.lab.nextResearchAction.action}${p.lab.nextResearchAction.reason ? ` (${p.lab.nextResearchAction.reason})` : ''}`, `labFingerprint: ${p.lab.labFingerprint}`, `boundary: ${p.lab.claimBoundary}`]} />
      </div>
    </section>
  );
}
