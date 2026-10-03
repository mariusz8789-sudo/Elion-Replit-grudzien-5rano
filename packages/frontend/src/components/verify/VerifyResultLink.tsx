import type { Locale } from '../../core/i18n';
import { rememberVerifyTarget, verifyHref, type VerifyTarget } from '../../core/verifyTarget';
import { vText } from './verifyText';

/**
 * "Zweryfikuj ten wynik / Verify this result": opens Genesis Verify with this
 * project, research run and experiment already picked. The click hands the
 * target over as in-app state; the href carries the same ids as route params.
 */
export function VerifyResultLink({ target, locale, className = 'verify-result-link', testId = 'verify-this-result' }: {
  readonly target: VerifyTarget;
  readonly locale: Locale;
  readonly className?: string;
  readonly testId?: string;
}): JSX.Element {
  return (
    <a
      className={className}
      href={verifyHref(target)}
      onClick={() => rememberVerifyTarget(target)}
      title={vText('verifyThisResultHint', locale)}
      data-testid={testId}
      data-run={target.researchRunId}
      data-experiment={target.experimentId ?? ''}
    >
      ✓ {vText('verifyThisResult', locale)}
    </a>
  );
}
