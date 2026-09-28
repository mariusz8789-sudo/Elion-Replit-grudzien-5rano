# Run 8 checkpoint — live, not a result

This directory holds the per-case result files run 8 writes as it goes, pushed at
intervals so that losing the container costs a resume rather than a restart: the
runner skips any case whose file is already here.

These files are intermediate state, not a report. They change no parameter, no
rule and no denominator, and nothing here may be read as a result until the run
finishes and `posebusters-run8-unseen-benchmark.json` exists. This directory is
removed in the commit that adds the finished report.
