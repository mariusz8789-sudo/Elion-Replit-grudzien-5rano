#!/bin/sh
set -eu

# A newly attached/restored Railway volume is owned by root even when the image
# declared a non-root USER. Restrict the privileged startup work to the one
# canonical persistence mount, then replace this process with the unprivileged
# application process. No user-controlled command text is evaluated here.
if [ -d /data ]; then
  chown -R node:node /data
fi

exec gosu node "$@"
