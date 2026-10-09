#!/bin/sh
# Provision the bundled desk-agent next to DeskLink without coupling their
# package lifetimes. The agent files are copied to untracked /usr/local paths,
# so removing DeskLink leaves the service and its data intact.
set -eu

SRC=/usr/share/rustdesk/agent
BIN=/usr/local/bin/hostagent
CONF=/etc/hostagent/config.yaml
SEED="$SRC/config.seed.yaml"
UNINSTALL=/usr/local/sbin/desklink-agent-uninstall

[ -x "$SRC/hostagent" ] || exit 0
[ -f "$SEED" ] || {
    echo "desklink-agent: missing $SEED" >&2
    exit 1
}

install -d -m 0755 /usr/local/bin /usr/local/sbin /etc/hostagent
if [ ! -f "$CONF" ]; then
    install -m 0600 "$SEED" "$CONF"
fi

cat >"$UNINSTALL" <<'EOF'
#!/bin/sh
set -eu
BIN=/usr/local/bin/hostagent
CONF=/etc/hostagent/config.yaml
if [ -x "$BIN" ]; then
    "$BIN" -config "$CONF" stop || true
    "$BIN" -config "$CONF" uninstall || true
fi
rm -f /usr/local/bin/hostagent
rm -f /usr/local/sbin/desklink-agent-uninstall
rm -f /usr/local/share/applications/desklink-agent-uninstall.desktop
command -v systemctl >/dev/null 2>&1 && systemctl daemon-reload || true
EOF
chmod 0755 "$UNINSTALL"

install -d -m 0755 /usr/local/share/applications
cat >/usr/local/share/applications/desklink-agent-uninstall.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=Uninstall DeskLink Agent
Comment=Stop and remove the desk-agent service
Exec=/usr/local/sbin/desklink-agent-uninstall
Terminal=true
Categories=Utility;
EOF
chmod 0644 /usr/local/share/applications/desklink-agent-uninstall.desktop

if [ -x "$BIN" ] && "$BIN" -config "$CONF" status >/dev/null 2>&1; then
    echo "desklink-agent: existing HostAgent service kept (DeskLink package update is independent)"
    exit 0
fi

install -m 0755 "$SRC/hostagent" "$BIN"
"$BIN" -config "$CONF" install

echo "desklink-agent: service HostAgent installed and enabled"
