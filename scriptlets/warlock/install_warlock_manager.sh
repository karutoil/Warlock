##
# Install the management script from the project's repo
#
# Expects the following variables:
#   GAME_USER    - User account to install the game under
#   GAME_DIR     - Directory to install the game into
#
function install_warlock_manager() {
	print_header "Performing install_management"

	# Install management console and its dependencies
	local SRC=""
	local REPO="$1"
	local INSTALLER_VERSION="$2"

	if [[ "$INSTALLER_VERSION" == *"~DEV"* ]]; then
		# Development version, pull from dev branch
		SRC="https://raw.githubusercontent.com/${REPO}/refs/heads/dev/dist/manage.py"
		echo "Trying to download manage.py from dev branch on $REPO"
	else
		# Stable version, pull from tagged release
		SRC="https://raw.githubusercontent.com/${REPO}/refs/tags/${INSTALLER_VERSION}/dist/manage.py"
		echo "Trying to download manage.py from $INSTALLER_VERSION tag on $REPO"
	fi

	if ! download "$SRC" "$GAME_DIR/manage.py"; then
		# Fallback to main branch
		echo "Download failed, falling back to main branch..." >&2
		SRC="https://raw.githubusercontent.com/${REPO}/refs/heads/main/dist/manage.py"
		if ! download "$SRC" "$GAME_DIR/manage.py"; then
			echo "Could not download management script!" >&2
			exit 1
		fi
	fi

	chown $GAME_USER:$GAME_USER "$GAME_DIR/manage.py"
	chmod +x "$GAME_DIR/manage.py"

	# Install configuration definitions
	cat > "$GAME_DIR/configs.yaml" <<EOF
# script:configs.yaml
EOF
	chown $GAME_USER:$GAME_USER "$GAME_DIR/configs.yaml"

	# Most games use .settings.ini for manager settings
	touch "$GAME_DIR/.settings.ini"
	chown $GAME_USER:$GAME_USER "$GAME_DIR/.settings.ini"

	# If a pyenv is required:
	sudo -u $GAME_USER python3 -m venv "$GAME_DIR/.venv"
	sudo -u $GAME_USER "$GAME_DIR/.venv/bin/pip" install --upgrade pip
	sudo -u $GAME_USER "$GAME_DIR/.venv/bin/pip" install pyyaml
}

