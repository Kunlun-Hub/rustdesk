#!/bin/sh
set -eu

npm --workspace @rustdesk-admin/server run prisma:deploy
node server/dist/prisma/seed.js
exec "$@"
